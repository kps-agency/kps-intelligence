import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { OPPORTUNITY_PIPELINE, OPPORTUNITY_STAGE_PROBABILITY } from "@kps/shared";
import { EventEntityType, EventType, OpportunityStatus } from "@kps/types";
import type {
  AssignableUserResponse,
  Database,
  OpportunityBoardResponse,
  OpportunityColumnTotal,
  OpportunityResponse,
  PaginatedResponse,
} from "@kps/types";
import { toDbException } from "../common/db-error";
import { toRange } from "../common/pagination-query.dto";
import { AUTOMATION_ACTOR, EventBus, type EventActor } from "../events/event-bus.service";
import { SupabaseService } from "../supabase/supabase.service";
import { currencyForCountry } from "./currency";
import type {
  ChangeOpportunityStageDto,
  CreateOpportunityDto,
  ListOpportunitiesQueryDto,
  OpportunityBoardQueryDto,
  UpdateOpportunityDto,
} from "./dto/opportunity.dto";

type OpportunityRow = Database["public"]["Tables"]["opportunities"]["Row"];
type OpportunityUpdate = Database["public"]["Tables"]["opportunities"]["Update"];
type OpportunityWithLinks = OpportunityRow & {
  clients: { company_name: string } | null;
  services: { name: string } | null;
  owner: { first_name: string; last_name: string } | null;
  requests: {
    reference: string;
    contacts: { first_name: string; last_name: string } | null;
  } | null;
};

// Un seul littéral : le typage des sélections Supabase ne suit pas une
// chaîne concaténée.
const OPPORTUNITY_SELECT =
  "*, clients(company_name), services(name), owner:users!opportunities_owner_user_id_fkey(first_name, last_name), requests(reference, contacts(first_name, last_name))";

const BOARD_MAX_ROWS = 2000;
const BOARD_ITEMS_PER_COLUMN = 50;
const CLOSED_STAGES: string[] = [OpportunityStatus.WON, OpportunityStatus.LOST];

// Une opportunité créée depuis une demande déjà qualifiée entre
// directement à l'étape « Qualifiée ».
const QUALIFIED_REQUEST_STATUSES = [
  "QUALIFIED",
  "MATCHING",
  "ASSIGNED",
  "QUOTE_PENDING",
  "QUOTE_SENT",
  "NEGOTIATION",
];

// Statut de la demande d'origine selon l'étape de son opportunité. Les
// deux premières étapes n'en imposent aucun : la demande y suit son
// propre cycle (qualifiée, matching, assignée).
const REQUEST_STATUS_FOR_STAGE: Partial<Record<string, string>> = {
  PROPOSAL_REQUIRED: "QUOTE_PENDING",
  PROPOSAL_SENT: "QUOTE_SENT",
  NEGOTIATION: "NEGOTIATION",
  WON: "WON",
  LOST: "LOST",
};
// Une demande déjà convertie en mission ou clôturée ne recule plus.
const REQUEST_STATUSES_KEPT = ["CONVERTED_TO_MISSION", "CLOSED"];

function fullName(user: { first_name: string; last_name: string } | null): string | null {
  return user ? `${user.first_name} ${user.last_name}` : null;
}

function toResponse(row: OpportunityWithLinks): OpportunityResponse {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as OpportunityStatus,
    requestId: row.request_id,
    requestReference: row.requests?.reference ?? null,
    clientId: row.client_id,
    clientCompanyName: row.clients?.company_name ?? null,
    contactFullName: fullName(row.requests?.contacts ?? null),
    serviceId: row.service_id,
    serviceName: row.services?.name ?? null,
    estimatedValue: row.estimated_value === null ? null : Number(row.estimated_value),
    currency: row.currency,
    probability: row.probability,
    ownerUserId: row.owner_user_id,
    ownerName: fullName(row.owner),
    expectedCloseDate: row.expected_close_date,
    lostReason: row.lost_reason,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Pipeline commercial (section 50). Une opportunité naît d'une demande
// qualifiée (workflow `opportunity-on-matching`) ou d'une saisie manuelle ;
// chaque changement d'étape est un événement, donc visible dans la
// timeline et ouvert aux workflows et aux notifications.
@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBus,
  ) {}

  async list(query: ListOpportunitiesQueryDto): Promise<PaginatedResponse<OpportunityResponse>> {
    let request = this.supabase
      .getClient()
      .from("opportunities")
      .select(OPPORTUNITY_SELECT, { count: "exact" });

    if (query.status) request = request.eq("status", query.status);
    if (query.ownerUserId) request = request.eq("owner_user_id", query.ownerUserId);
    if (query.clientId) request = request.eq("client_id", query.clientId);
    if (query.requestId) request = request.eq("request_id", query.requestId);

    const [from, to] = toRange(query.page, query.limit);
    const { data, count, error } = await request
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (error) throw toDbException(error);

    return {
      data: (data as unknown as OpportunityWithLinks[]).map(toResponse),
      meta: { total: count ?? 0, page: query.page, limit: query.limit },
    };
  }

  // Kanban : toutes les étapes en une réponse, avec le total de chaque
  // colonne calculé sur l'ensemble de ses opportunités (pas seulement
  // celles affichées).
  async board(query: OpportunityBoardQueryDto): Promise<OpportunityBoardResponse> {
    let request = this.supabase.getClient().from("opportunities").select(OPPORTUNITY_SELECT);
    if (query.ownerUserId) request = request.eq("owner_user_id", query.ownerUserId);

    const { data, error } = await request
      .order("updated_at", { ascending: false })
      .range(0, BOARD_MAX_ROWS - 1);
    if (error) throw toDbException(error);

    const term = query.search?.trim().toLowerCase();
    const opportunities = (data as unknown as OpportunityWithLinks[]).map(toResponse).filter(
      (o) =>
        !term ||
        [o.title, o.clientCompanyName, o.contactFullName, o.requestReference].some((value) =>
          value?.toLowerCase().includes(term),
        ),
    );

    return {
      columns: OPPORTUNITY_PIPELINE.map((status) => {
        const inStage = opportunities.filter((o) => o.status === status);
        return {
          status,
          count: inStage.length,
          totals: columnTotals(inStage),
          items: inStage.slice(0, BOARD_ITEMS_PER_COLUMN),
        };
      }),
    };
  }

  async findById(id: string): Promise<OpportunityResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from("opportunities")
      .select(OPPORTUNITY_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Opportunité introuvable.");
    return toResponse(data as unknown as OpportunityWithLinks);
  }

  async create(dto: CreateOpportunityDto, actor: EventActor): Promise<OpportunityResponse> {
    if (dto.requestId) return (await this.createFromRequest(dto.requestId, actor)).opportunity;

    const clientCountry = dto.clientId ? await this.clientCountry(dto.clientId) : null;
    if (dto.serviceId) await this.assertServiceExists(dto.serviceId);
    // Par défaut, celui qui saisit l'opportunité en est le responsable.
    const ownerUserId = dto.ownerUserId === undefined ? actor.id : dto.ownerUserId;
    if (dto.ownerUserId) await this.assertOwner(dto.ownerUserId);

    const { data, error } = await this.supabase
      .getClient()
      .from("opportunities")
      .insert({
        title: dto.title as string,
        description: dto.description ?? null,
        client_id: dto.clientId ?? null,
        service_id: dto.serviceId ?? null,
        estimated_value: dto.estimatedValue ?? null,
        currency: dto.currency ?? currencyForCountry(clientCountry),
        probability: OPPORTUNITY_STAGE_PROBABILITY[OpportunityStatus.NEW],
        owner_user_id: ownerUserId,
        expected_close_date: dto.expectedCloseDate ?? null,
      })
      .select("id")
      .single();
    if (error) throw toDbException(error);

    const opportunity = await this.findById(data.id);
    await this.emitCreated(opportunity, actor);
    return opportunity;
  }

  // Idempotent (section 63) : une seule opportunité par demande, y compris
  // si le matching est relancé ou l'événement rejoué.
  async createFromRequest(
    requestId: string,
    actor: EventActor,
  ): Promise<{ opportunity: OpportunityResponse; created: boolean }> {
    const client = this.supabase.getClient();
    const { data: request, error } = await client
      .from("requests")
      .select("id, subject, status, country, client_id, detected_service_id, assigned_user_id, clients(country)")
      .eq("id", requestId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!request) throw new NotFoundException("Demande introuvable.");

    const existing = await this.findByRequest(requestId);
    if (existing) return { opportunity: existing, created: false };

    const status = QUALIFIED_REQUEST_STATUSES.includes(request.status)
      ? OpportunityStatus.QUALIFIED
      : OpportunityStatus.NEW;
    const clientCountry = (request.clients as { country: string | null } | null)?.country;

    const { data, error: insertError } = await client
      .from("opportunities")
      .insert({
        request_id: requestId,
        title: request.subject,
        description: await this.analysisSummary(requestId),
        client_id: request.client_id,
        service_id: request.detected_service_id,
        status,
        currency: currencyForCountry(clientCountry ?? request.country),
        probability: OPPORTUNITY_STAGE_PROBABILITY[status],
        owner_user_id: request.assigned_user_id,
      })
      .select("id")
      .single();
    if (insertError) {
      // Deux créations simultanées : l'index unique sur request_id tranche.
      if (insertError.code === "23505") {
        const raced = await this.findByRequest(requestId);
        if (raced) return { opportunity: raced, created: false };
      }
      throw toDbException(insertError);
    }

    const opportunity = await this.findById(data.id);
    await this.emitCreated(opportunity, actor);
    return { opportunity, created: true };
  }

  async update(id: string, dto: UpdateOpportunityDto): Promise<OpportunityResponse> {
    const fields: OpportunityUpdate = {};
    if (dto.title !== undefined) fields.title = dto.title;
    if (dto.description !== undefined) fields.description = dto.description;
    if (dto.clientId !== undefined) {
      if (dto.clientId !== null) await this.clientCountry(dto.clientId);
      fields.client_id = dto.clientId;
    }
    if (dto.serviceId !== undefined) {
      if (dto.serviceId !== null) await this.assertServiceExists(dto.serviceId);
      fields.service_id = dto.serviceId;
    }
    if (dto.estimatedValue !== undefined) fields.estimated_value = dto.estimatedValue;
    if (dto.currency !== undefined) fields.currency = dto.currency;
    if (dto.probability !== undefined) fields.probability = dto.probability;
    if (dto.ownerUserId !== undefined) {
      if (dto.ownerUserId !== null) await this.assertOwner(dto.ownerUserId);
      fields.owner_user_id = dto.ownerUserId;
    }
    if (dto.expectedCloseDate !== undefined) fields.expected_close_date = dto.expectedCloseDate;

    if (Object.keys(fields).length === 0) throw new BadRequestException("Aucun champ à modifier.");

    const { data, error } = await this.supabase
      .getClient()
      .from("opportunities")
      .update(fields)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Opportunité introuvable.");
    return this.findById(id);
  }

  async changeStage(
    id: string,
    dto: ChangeOpportunityStageDto,
    actor: EventActor,
  ): Promise<OpportunityResponse> {
    const current = await this.findById(id);
    if (current.status === dto.status) return current;

    const closed = CLOSED_STAGES.includes(dto.status);
    const lostReason = dto.status === OpportunityStatus.LOST ? (dto.lostReason ?? null) : null;

    // Filtré sur l'étape lue : deux déplacements simultanés de la même
    // carte ne produisent qu'un changement, donc un seul événement.
    const { data: updated, error } = await this.supabase
      .getClient()
      .from("opportunities")
      .update({
        status: dto.status,
        probability: OPPORTUNITY_STAGE_PROBABILITY[dto.status],
        closed_at: closed ? new Date().toISOString() : null,
        lost_reason: lostReason,
      })
      .eq("id", id)
      .eq("status", current.status)
      .select("id");
    if (error) throw toDbException(error);
    const opportunity = await this.findById(id);
    if (updated.length === 0) return opportunity;

    const event = {
      entityType: EventEntityType.OPPORTUNITY,
      entityId: id,
      requestId: opportunity.requestId,
      actor,
    };
    await this.eventBus.emit({
      ...event,
      type: EventType.OPPORTUNITY_STAGE_CHANGED,
      payload: { opportunityId: id, title: opportunity.title, from: current.status, to: dto.status },
    });
    if (dto.status === OpportunityStatus.WON) {
      await this.eventBus.emit({
        ...event,
        type: EventType.OPPORTUNITY_WON,
        payload: {
          opportunityId: id,
          title: opportunity.title,
          estimatedValue: opportunity.estimatedValue,
          currency: opportunity.currency,
        },
      });
    }
    if (dto.status === OpportunityStatus.LOST) {
      await this.eventBus.emit({
        ...event,
        type: EventType.OPPORTUNITY_LOST,
        payload: { opportunityId: id, title: opportunity.title, lostReason },
      });
    }
    return opportunity;
  }

  // Action de workflow SET_OPPORTUNITY_STAGE : le devis fait avancer son
  // opportunité, jamais reculer — et ne rouvre pas une opportunité déjà
  // gagnée ou perdue (décision humaine).
  async advanceTo(
    opportunityId: string,
    stage: OpportunityStatus,
    actor: EventActor,
  ): Promise<{ status: "DONE" | "SKIPPED"; detail: string }> {
    const current = await this.findById(opportunityId);
    if (CLOSED_STAGES.includes(current.status)) {
      return { status: "SKIPPED", detail: "L'opportunité est déjà gagnée ou perdue." };
    }
    if (OPPORTUNITY_PIPELINE.indexOf(stage) <= OPPORTUNITY_PIPELINE.indexOf(current.status)) {
      return { status: "SKIPPED", detail: "L'opportunité est déjà à cette étape ou plus avancée." };
    }
    await this.changeStage(opportunityId, { status: stage }, actor);
    return { status: "DONE", detail: `Opportunité : ${stage}.` };
  }

  // Action de workflow SYNC_REQUEST_STATUS : aligne le statut de la demande
  // sur l'étape de son opportunité.
  async syncRequestStatus(requestId: string): Promise<{ status: "DONE" | "SKIPPED"; detail: string }> {
    const opportunity = await this.findByRequest(requestId);
    if (!opportunity) return { status: "SKIPPED", detail: "Aucune opportunité pour cette demande." };

    const target = REQUEST_STATUS_FOR_STAGE[opportunity.status];
    if (!target) return { status: "SKIPPED", detail: "Cette étape ne change pas le statut de la demande." };

    const client = this.supabase.getClient();
    const { data: request, error } = await client
      .from("requests")
      .select("status")
      .eq("id", requestId)
      .single();
    if (error) throw toDbException(error);
    if (request.status === target) return { status: "SKIPPED", detail: "Statut de la demande déjà à jour." };
    if (REQUEST_STATUSES_KEPT.includes(request.status)) {
      return { status: "SKIPPED", detail: "La demande est déjà convertie ou clôturée." };
    }

    const { error: updateError } = await client
      .from("requests")
      .update({ status: target as never })
      .eq("id", requestId);
    if (updateError) throw toDbException(updateError);
    await this.eventBus.emit({
      type: EventType.REQUEST_STATUS_CHANGED,
      entityType: EventEntityType.REQUEST,
      entityId: requestId,
      requestId,
      actor: AUTOMATION_ACTOR,
      payload: { from: request.status, to: target },
    });
    return { status: "DONE", detail: `Statut de la demande : ${target}.` };
  }

  // Utilisateurs actifs pouvant gérer le pipeline : les seuls responsables
  // possibles d'une opportunité.
  async listOwners(): Promise<AssignableUserResponse[]> {
    const client = this.supabase.getClient();
    const { data: roles, error: rolesError } = await client
      .from("role_permissions")
      .select("role_id, permissions!inner(key)")
      .eq("permissions.key", "opportunities.manage");
    if (rolesError) throw toDbException(rolesError);
    if (roles.length === 0) return [];

    const { data, error } = await client
      .from("users")
      .select("id, first_name, last_name, roles(key)")
      .in("role_id", roles.map((r) => r.role_id))
      .eq("status", "ACTIVE")
      .order("first_name", { ascending: true });
    if (error) throw toDbException(error);

    return (data as { id: string; first_name: string; last_name: string; roles: { key: string } | null }[]).map(
      (u) => ({ id: u.id, fullName: `${u.first_name} ${u.last_name}`, roleKey: u.roles?.key ?? "" }),
    );
  }

  private async findByRequest(requestId: string): Promise<OpportunityResponse | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("opportunities")
      .select(OPPORTUNITY_SELECT)
      .eq("request_id", requestId)
      .maybeSingle();
    if (error) throw toDbException(error);
    return data ? toResponse(data as unknown as OpportunityWithLinks) : null;
  }

  // Résumé de l'IA comme description de départ : l'analyse des réponses
  // de qualification si elle existe, sinon celle de la demande.
  private async analysisSummary(requestId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("ai_analyses")
      .select("kind, result")
      .eq("request_id", requestId)
      .eq("status", "COMPLETED")
      .order("created_at", { ascending: false });
    if (error) throw toDbException(error);
    const analysis =
      data.find((a) => a.kind === "QUALIFICATION_ANALYSIS") ?? data.find((a) => a.kind === "REQUEST_ANALYSIS");
    const summary = (analysis?.result as { summary?: unknown } | null)?.summary;
    return typeof summary === "string" && summary.trim() !== "" ? summary : null;
  }

  private async clientCountry(clientId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("clients")
      .select("country")
      .eq("id", clientId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new BadRequestException("Ce client n'existe pas.");
    return data.country;
  }

  private async assertServiceExists(serviceId: string): Promise<void> {
    const { data, error } = await this.supabase
      .getClient()
      .from("services")
      .select("id")
      .eq("id", serviceId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new BadRequestException("Ce service n'existe pas.");
  }

  private async assertOwner(userId: string): Promise<void> {
    if (!(await this.listOwners()).some((u) => u.id === userId)) {
      throw new BadRequestException(
        "Cet utilisateur ne peut pas être responsable d'une opportunité (inactif ou sans droit de gestion).",
      );
    }
  }

  private async emitCreated(opportunity: OpportunityResponse, actor: EventActor): Promise<void> {
    await this.eventBus.emit({
      type: EventType.OPPORTUNITY_CREATED,
      entityType: EventEntityType.OPPORTUNITY,
      entityId: opportunity.id,
      requestId: opportunity.requestId,
      actor,
      payload: {
        opportunityId: opportunity.id,
        title: opportunity.title,
        status: opportunity.status,
        estimatedValue: opportunity.estimatedValue,
        currency: opportunity.currency,
      },
    });
  }
}

function columnTotals(opportunities: OpportunityResponse[]): OpportunityColumnTotal[] {
  const totals = new Map<string, OpportunityColumnTotal>();
  for (const o of opportunities) {
    if (o.estimatedValue === null || !o.currency) continue;
    const total = totals.get(o.currency) ?? { currency: o.currency, value: 0, weightedValue: 0 };
    total.value += o.estimatedValue;
    total.weightedValue += (o.estimatedValue * (o.probability ?? 0)) / 100;
    totals.set(o.currency, total);
  }
  return [...totals.values()]
    .map((t) => ({
      currency: t.currency,
      value: Math.round(t.value * 100) / 100,
      weightedValue: Math.round(t.weightedValue * 100) / 100,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
