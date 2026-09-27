import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AI_LOW_CONFIDENCE_THRESHOLD } from "@kps/shared";
import type {
  AiAnalysisResponse,
  AiAnalysisStatus,
  Database,
  PaginatedResponse,
  PriorityLevel,
  RequestAnalysisResult,
  RequestResponse,
  RequestSource,
  RequestStatus,
  ServiceSlug,
} from "@kps/types";
import { AI_SERVICE, type AIService } from "../ai/ai.service.interface";
import { toDbException } from "../common/db-error";
import { toRange } from "../common/pagination-query.dto";
import { toContainsPattern } from "../common/search";
import { SupabaseService } from "../supabase/supabase.service";
import type { CreateRequestDto } from "./dto/create-request.dto";
import type { ListRequestsQueryDto } from "./dto/list-requests-query.dto";
import type { UpdateRequestDto } from "./dto/update-request.dto";

type RequestRow = Database["public"]["Tables"]["requests"]["Row"];
type RequestUpdate = Database["public"]["Tables"]["requests"]["Update"];
type RequestWithLinks = RequestRow & {
  clients: { company_name: string } | null;
  contacts: { first_name: string; last_name: string } | null;
  services: { slug: string; name: string } | null;
};
type AiAnalysisRow = Database["public"]["Tables"]["ai_analyses"]["Row"];

const REQUEST_SELECT =
  "*, clients(company_name), contacts(first_name, last_name), services(slug, name)";

const logger = new Logger("RequestsService");

function toResponse(row: RequestWithLinks): RequestResponse {
  return {
    id: row.id,
    reference: row.reference,
    clientId: row.client_id,
    clientCompanyName: row.clients?.company_name ?? null,
    contactId: row.contact_id,
    contactFullName: row.contacts
      ? `${row.contacts.first_name} ${row.contacts.last_name}`
      : null,
    // Les enums Postgres générés sont des unions littérales ; nos enums
    // TypeScript (packages/types) en sont la source alignée 1:1.
    source: row.source as RequestSource,
    channel: row.channel,
    subject: row.subject,
    originalMessage: row.original_message,
    language: row.language,
    country: row.country,
    status: row.status as RequestStatus,
    priority: row.priority as PriorityLevel | null,
    urgency: row.urgency as PriorityLevel | null,
    detectedServiceSlug: (row.services?.slug as ServiceSlug | undefined) ?? null,
    detectedServiceName: row.services?.name ?? null,
    detectedSubservice: row.detected_subservice,
    aiConfidence: row.ai_confidence,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAnalysisResponse(row: AiAnalysisRow): AiAnalysisResponse {
  return {
    id: row.id,
    requestId: row.request_id,
    status: row.status as AiAnalysisStatus,
    model: row.model,
    confidence: row.confidence,
    result: row.result as unknown as RequestAnalysisResult | null,
    error: row.error,
    createdAt: row.created_at,
  };
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly supabase: SupabaseService,
    @Inject(AI_SERVICE) private readonly aiService: AIService,
  ) {}

  async list(
    query: ListRequestsQueryDto,
  ): Promise<PaginatedResponse<RequestResponse>> {
    let request = this.supabase
      .getClient()
      .from("requests")
      .select(REQUEST_SELECT, { count: "exact" });

    if (query.status) request = request.eq("status", query.status);
    if (query.source) request = request.eq("source", query.source);
    if (query.clientId) request = request.eq("client_id", query.clientId);

    const pattern = query.search ? toContainsPattern(query.search) : null;
    if (pattern) {
      request = request.or(
        `reference.ilike.${pattern},subject.ilike.${pattern},original_message.ilike.${pattern}`,
      );
    }

    const [from, to] = toRange(query.page, query.limit);
    const { data, count, error } = await request
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw toDbException(error);

    return {
      data: (data as RequestWithLinks[]).map(toResponse),
      meta: { total: count ?? 0, page: query.page, limit: query.limit },
    };
  }

  async findById(id: string): Promise<RequestResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from("requests")
      .select(REQUEST_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Demande introuvable.");
    return toResponse(data as RequestWithLinks);
  }

  async create(dto: CreateRequestDto): Promise<RequestResponse> {
    await this.assertClientContactMatch(dto.clientId, dto.contactId);

    const { data, error } = await this.supabase
      .getClient()
      .from("requests")
      .insert({
        source: "MANUAL",
        subject: dto.subject,
        original_message: dto.originalMessage,
        language: dto.language,
        country: dto.country,
        priority: dto.priority,
        urgency: dto.urgency,
        client_id: dto.clientId,
        contact_id: dto.contactId,
      })
      .select("id")
      .single();

    if (error) throw toDbException(error);

    // Analyse IA synchrone (Phase 8, section 19) : pas de file d'attente
    // asynchrone en place pour l'instant, et une demande MANUAL doit être
    // analysée dès sa création. Un échec ne doit jamais bloquer la
    // création (section 68) — runAnalysis avale déjà ses propres erreurs.
    await this.runAnalysis({
      id: data.id,
      subject: dto.subject,
      original_message: dto.originalMessage ?? null,
      language: dto.language ?? null,
      country: dto.country ?? null,
    });

    return this.findById(data.id);
  }

  async update(id: string, dto: UpdateRequestDto): Promise<RequestResponse> {
    if (dto.subject === null) {
      throw new BadRequestException("Le sujet ne peut pas être vide.");
    }

    // `clientId: null` délie aussi le contact, même si contactId n'est pas
    // explicitement fourni dans la même requête.
    const nextClientId = dto.clientId === null ? null : dto.clientId;
    const nextContactId = dto.clientId === null ? null : dto.contactId;
    if (nextClientId !== undefined || nextContactId !== undefined) {
      await this.assertClientContactMatch(
        nextClientId ?? undefined,
        nextContactId ?? undefined,
        id,
      );
    }

    const fields: RequestUpdate = {};
    if (dto.subject !== undefined) fields.subject = dto.subject;
    if (dto.originalMessage !== undefined) fields.original_message = dto.originalMessage;
    if (dto.language !== undefined) fields.language = dto.language;
    if (dto.country !== undefined) fields.country = dto.country;
    if (dto.status !== undefined) fields.status = dto.status as RequestStatus;
    if (dto.priority !== undefined) fields.priority = dto.priority;
    if (dto.urgency !== undefined) fields.urgency = dto.urgency;
    if (dto.clientId !== undefined) fields.client_id = nextClientId;
    if (nextClientId !== undefined || dto.contactId !== undefined) {
      fields.contact_id = nextContactId ?? null;
    }

    if (Object.keys(fields).length === 0) {
      throw new BadRequestException("Aucun champ à modifier.");
    }

    const { data, error } = await this.supabase
      .getClient()
      .from("requests")
      .update(fields)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Demande introuvable.");
    return this.findById(id);
  }

  /**
   * Un contact lié à une demande doit appartenir au client lié à cette
   * même demande — sinon la fiche client affiche un contact qui n'est
   * pas le sien. `requestId` (mise à jour uniquement) sert à retrouver le
   * client déjà lié quand seul `contactId` change dans cet appel.
   */
  private async assertClientContactMatch(
    clientId: string | undefined,
    contactId: string | undefined,
    requestId?: string,
  ): Promise<void> {
    if (!contactId) return;

    const client = this.supabase.getClient();
    const { data: contact, error } = await client
      .from("contacts")
      .select("client_id")
      .eq("id", contactId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!contact) throw new NotFoundException("Contact introuvable.");

    let effectiveClientId = clientId;
    if (effectiveClientId === undefined && requestId) {
      const { data: existing, error: existingError } = await client
        .from("requests")
        .select("client_id")
        .eq("id", requestId)
        .maybeSingle();
      if (existingError) throw toDbException(existingError);
      effectiveClientId = existing?.client_id ?? undefined;
    }

    if (!effectiveClientId) {
      throw new BadRequestException(
        "clientId est requis lorsque contactId est renseigné.",
      );
    }
    if (contact.client_id !== effectiveClientId) {
      throw new BadRequestException(
        "Ce contact n'appartient pas au client sélectionné.",
      );
    }
  }

  // Déclenche (ou redéclenche) une analyse IA pour une demande existante.
  async analyze(id: string): Promise<AiAnalysisResponse> {
    const { data: row, error } = await this.supabase
      .getClient()
      .from("requests")
      .select("id, subject, original_message, language, country")
      .eq("id", id)
      .maybeSingle();

    if (error) throw toDbException(error);
    if (!row) throw new NotFoundException("Demande introuvable.");

    return this.runAnalysis(row);
  }

  async listAnalyses(requestId: string): Promise<AiAnalysisResponse[]> {
    const { data: requestRow, error: requestError } = await this.supabase
      .getClient()
      .from("requests")
      .select("id")
      .eq("id", requestId)
      .maybeSingle();
    if (requestError) throw toDbException(requestError);
    if (!requestRow) throw new NotFoundException("Demande introuvable.");

    const { data, error } = await this.supabase
      .getClient()
      .from("ai_analyses")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false });

    if (error) throw toDbException(error);
    return (data as AiAnalysisRow[]).map(toAnalysisResponse);
  }

  // Panne Claude après épuisement des retries du SDK (section 68) : jamais
  // propagée à l'appelant — une analyse FAILED est persistée pour garder
  // une trace et permettre un traitement manuel, la demande reste utilisable.
  private async runAnalysis(row: {
    id: string;
    subject: string;
    original_message: string | null;
    language: string | null;
    country: string | null;
  }): Promise<AiAnalysisResponse> {
    const model = this.aiService.getModel();
    const promptVersion = this.aiService.getPromptVersion();
    const client = this.supabase.getClient();

    try {
      const result = await this.aiService.analyzeRequest({
        subject: row.subject,
        originalMessage: row.original_message,
        language: row.language,
        country: row.country,
      });

      let detectedServiceId: string | null = null;
      if (result.service) {
        const { data: service, error: serviceError } = await client
          .from("services")
          .select("id")
          .eq("slug", result.service)
          .maybeSingle();
        if (serviceError) throw toDbException(serviceError);
        detectedServiceId = service?.id ?? null;
      }

      const requestUpdate: RequestUpdate = {
        detected_service_id: detectedServiceId,
        detected_subservice: result.subservice,
        ai_confidence: result.confidence,
        status: "ANALYZED",
      };
      if (!row.language && result.language) requestUpdate.language = result.language;
      if (!row.country && result.country) requestUpdate.country = result.country;
      if (result.urgency) requestUpdate.urgency = result.urgency;

      const { error: updateError } = await client
        .from("requests")
        .update(requestUpdate)
        .eq("id", row.id);
      if (updateError) throw toDbException(updateError);

      const { data: analysisRow, error: insertError } = await client
        .from("ai_analyses")
        .insert({
          request_id: row.id,
          kind: "REQUEST_ANALYSIS",
          status: "COMPLETED",
          prompt_version: promptVersion,
          model,
          confidence: result.confidence,
          result: result as unknown as Database["public"]["Tables"]["ai_analyses"]["Insert"]["result"],
        })
        .select("*")
        .single();
      if (insertError) throw toDbException(insertError);

      if (result.confidence < AI_LOW_CONFIDENCE_THRESHOLD) {
        logger.warn(
          { requestId: row.id, confidence: result.confidence },
          "Analyse IA à faible confiance : validation humaine requise",
        );
      }

      return toAnalysisResponse(analysisRow as AiAnalysisRow);
    } catch (err) {
      logger.error(
        { requestId: row.id, err: err instanceof Error ? err.message : String(err) },
        "Échec de l'analyse IA",
      );

      const { data: failedRow, error: insertError } = await client
        .from("ai_analyses")
        .insert({
          request_id: row.id,
          kind: "REQUEST_ANALYSIS",
          status: "FAILED",
          prompt_version: promptVersion,
          model,
          // Jamais le détail brut de l'erreur (section 68) : message
          // générique seulement, le détail reste dans les logs serveur.
          error: "L'analyse IA a échoué. Un traitement manuel est requis.",
        })
        .select("*")
        .single();
      if (insertError) throw toDbException(insertError);

      return toAnalysisResponse(failedRow as AiAnalysisRow);
    }
  }
}
