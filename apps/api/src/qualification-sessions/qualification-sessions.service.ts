import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QUALIFICATION_LINK_DEFAULT_EXPIRY_DAYS } from "@kps/shared";
import { EventEntityType, EventType, FormFieldType, QualificationSessionStatus } from "@kps/types";
import type {
  Database,
  FormFieldOption,
  FormResponse,
  Json,
  PublicQualificationSessionResponse,
  QualificationSessionCreatedResponse,
  QualificationSessionDetailResponse,
  QualificationSessionResponse,
} from "@kps/types";
import { FormsService } from "../forms/forms.service";
import { toDbException } from "../common/db-error";
import { EventBus, SYSTEM_ACTOR, type EventActor } from "../events/event-bus.service";
import { SupabaseService } from "../supabase/supabase.service";

type SessionRow = Database["public"]["Tables"]["qualification_sessions"]["Row"];
type FormFieldRow = Database["public"]["Tables"]["form_fields"]["Row"];

// États dans lesquels une session est encore "en cours" : réutilisée
// (avec un nouveau token, voir `create`) plutôt que d'en recréer une
// depuis zéro à chaque clic.
const ACTIVE_SESSION_STATUSES: QualificationSessionStatus[] = [
  "CREATED",
  "SENT",
  "OPENED",
  "IN_PROGRESS",
] as QualificationSessionStatus[];

const TERMINAL_STATUSES: QualificationSessionStatus[] = [
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
] as QualificationSessionStatus[];

// Statuts de requests.status antérieurs à une réponse de qualification —
// une soumission ne fait avancer la demande que depuis l'un d'eux, jamais
// en régressant un statut déjà plus avancé dans le pipeline.
const PRE_RESPONSE_REQUEST_STATUSES = [
  "NEW",
  "RECEIVED",
  "AI_ANALYZING",
  "ANALYZED",
  "FORM_PENDING",
  "FORM_SENT",
  "WAITING_CLIENT",
];

function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

const logger = new Logger("QualificationSessionsService");

// Paliers de progression journalisés (section 38) : un événement par
// palier franchi plutôt qu'un par champ sauvegardé, sinon l'autosave
// noierait la timeline.
const PROGRESS_STEP_PERCENT = 25;

@Injectable()
export class QualificationSessionsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly formsService: FormsService,
    private readonly config: ConfigService,
    private readonly eventBus: EventBus,
  ) {}

  // ---- Création / gestion admin (authentifié, section 37) ----

  // Toujours renvoie un lien utilisable : réutilise la session existante
  // (et ses réponses déjà enregistrées) pour ce couple demande/formulaire
  // si elle est encore active, mais lui attribue un token tout juste
  // généré — le seul moment où ce token est récupérable.
  async create(
    requestId: string,
    formId: string,
    actor: EventActor,
  ): Promise<QualificationSessionCreatedResponse> {
    await this.assertRequestExists(requestId);
    const form = await this.assertFormPublished(formId);

    const client = this.supabase.getClient();
    const { data: existing, error: existingError } = await client
      .from("qualification_sessions")
      .select("*")
      .eq("request_id", requestId)
      .eq("form_id", formId)
      .in("status", ACTIVE_SESSION_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw toDbException(existingError);

    if (existing) {
      return this.rotateToken(existing, form.name, actor);
    }

    const { rawToken, tokenHash } = this.generateToken();
    const { data, error } = await client
      .from("qualification_sessions")
      .insert({
        request_id: requestId,
        form_id: formId,
        token_hash: tokenHash,
        expires_at: this.defaultExpiry(),
      })
      .select("*")
      .single();
    if (error) throw toDbException(error);

    logger.log({ requestId, formId, sessionId: data.id }, "Lien de qualification créé");
    await this.emitForSession(data, EventType.QUALIFICATION_LINK_CREATED, actor, {
      formId,
      formName: form.name,
      regenerated: false,
    });
    return this.toCreatedResponse(data, rawToken);
  }

  async list(requestId: string): Promise<QualificationSessionResponse[]> {
    await this.assertRequestExists(requestId);

    const { data, error } = await this.supabase
      .getClient()
      .from("qualification_sessions")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false });
    if (error) throw toDbException(error);

    const rows = await Promise.all(data.map((row) => this.withEffectiveStatus(row)));
    return Promise.all(rows.map((row) => this.toResponse(row)));
  }

  async findById(id: string): Promise<QualificationSessionDetailResponse> {
    const session = await this.requireSession(id);
    return this.buildDetail(session);
  }

  async saveResponse(
    sessionId: string,
    fieldKey: string,
    value: unknown,
    actor: EventActor,
  ): Promise<QualificationSessionDetailResponse> {
    const session = await this.requireSession(sessionId);
    const updated = await this.saveResponseForSession(session, fieldKey, value, actor);
    return this.buildDetail(updated);
  }

  async submit(id: string, actor: EventActor): Promise<QualificationSessionResponse> {
    const session = await this.requireSession(id);
    const updated = await this.submitSession(session, actor);
    return this.toResponse(updated);
  }

  // `channel` : MANUAL quand un utilisateur indique avoir transmis le lien
  // lui-même, EMAIL/WHATSAPP quand la plateforme l'a réellement envoyé.
  async markSent(
    id: string,
    actor: EventActor,
    channel: "MANUAL" | "EMAIL" | "WHATSAPP" = "MANUAL",
  ): Promise<QualificationSessionResponse> {
    const session = await this.requireSession(id);
    if (session.status !== "CREATED") {
      throw new BadRequestException(
        "Seul un lien tout juste créé peut être marqué comme envoyé.",
      );
    }

    const { data, error } = await this.supabase
      .getClient()
      .from("qualification_sessions")
      .update({ status: "SENT", sent_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw toDbException(error);
    await this.emitForSession(data, EventType.QUALIFICATION_LINK_SENT, actor, { channel });
    return this.toResponse(data);
  }

  async revoke(id: string, actor: EventActor): Promise<QualificationSessionResponse> {
    const session = await this.requireSession(id);
    if (session.status === "COMPLETED") {
      throw new BadRequestException("Une qualification déjà terminée ne peut pas être révoquée.");
    }
    if (session.status === "CANCELLED") {
      throw new BadRequestException("Ce lien est déjà révoqué.");
    }

    const { data, error } = await this.supabase
      .getClient()
      .from("qualification_sessions")
      .update({ status: "CANCELLED" })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw toDbException(error);
    await this.emitForSession(data, EventType.QUALIFICATION_LINK_REVOKED, actor);
    return this.toResponse(data);
  }

  async extend(
    id: string,
    days: number | undefined,
    actor: EventActor,
  ): Promise<QualificationSessionResponse> {
    const session = await this.requireSession(id);
    if (session.status === "COMPLETED") {
      throw new BadRequestException("Une qualification déjà terminée ne peut pas être prolongée.");
    }
    if (session.status === "CANCELLED") {
      throw new BadRequestException(
        "Ce lien a été révoqué — régénérez-en un nouveau plutôt que de le prolonger.",
      );
    }

    const extendDays = days && days > 0 ? days : QUALIFICATION_LINK_DEFAULT_EXPIRY_DAYS;
    const base = Math.max(new Date(session.expires_at).getTime(), Date.now());
    const nextExpiresAt = new Date(base + extendDays * 24 * 60 * 60 * 1000).toISOString();

    // Un lien qui vient d'expirer retrouve un statut cohérent avec son
    // avancement réel (la distinction SENT/OPENED n'est pas conservée :
    // ce n'est qu'un indicateur de suivi, pas une donnée métier).
    const nextStatus: QualificationSessionStatus =
      session.status === "EXPIRED"
        ? session.started_at
          ? QualificationSessionStatus.IN_PROGRESS
          : session.opened_at
            ? QualificationSessionStatus.OPENED
            : QualificationSessionStatus.CREATED
        : (session.status as QualificationSessionStatus);

    const { data, error } = await this.supabase
      .getClient()
      .from("qualification_sessions")
      .update({ expires_at: nextExpiresAt, status: nextStatus })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw toDbException(error);
    await this.emitForSession(data, EventType.QUALIFICATION_LINK_EXTENDED, actor, {
      expiresAt: nextExpiresAt,
    });
    return this.toResponse(data);
  }

  async regenerate(id: string, actor: EventActor): Promise<QualificationSessionCreatedResponse> {
    const session = await this.requireSession(id);
    if (session.status === "COMPLETED") {
      throw new BadRequestException("Une qualification déjà terminée ne peut pas être régénérée.");
    }

    const form = await this.formsService.findById(session.form_id);
    return this.rotateToken(session, form.name, actor);
  }

  // ---- Page publique (section 24, aucune authentification) ----

  async findByToken(rawToken: string): Promise<PublicQualificationSessionResponse> {
    const session = await this.resolveByToken(rawToken);
    const opened = await this.markOpenedIfNeeded(session);
    return this.buildPublicResponse(opened);
  }

  async savePublicResponse(
    rawToken: string,
    fieldKey: string,
    value: unknown,
  ): Promise<PublicQualificationSessionResponse> {
    const session = await this.resolveByToken(rawToken);
    const updated = await this.saveResponseForSession(session, fieldKey, value, SYSTEM_ACTOR);
    return this.buildPublicResponse(updated);
  }

  async submitPublic(rawToken: string): Promise<PublicQualificationSessionResponse> {
    const session = await this.resolveByToken(rawToken);
    const updated = await this.submitSession(session, SYSTEM_ACTOR);
    return this.buildPublicResponse(updated);
  }

  // ---- Cœur partagé (authentifié et public convergent ici) ----

  private async saveResponseForSession(
    session: SessionRow,
    fieldKey: string,
    value: unknown,
    actor: EventActor,
  ): Promise<SessionRow> {
    this.assertWritable(session);

    const field = await this.selectFieldByKey(session.form_id, fieldKey);
    if (!field) {
      throw new NotFoundException(`Champ inconnu pour ce formulaire ("${fieldKey}").`);
    }

    const progressBefore = await this.computeProgressPercent(session);

    const client = this.supabase.getClient();

    if (value === null) {
      // form_responses.value est NOT NULL : « effacer » une réponse
      // signifie donc supprimer la ligne, pas y écrire un null SQL.
      const { error: deleteError } = await client
        .from("form_responses")
        .delete()
        .eq("qualification_session_id", session.id)
        .eq("form_field_id", field.id);
      if (deleteError) throw toDbException(deleteError);
    } else {
      const coerced = this.coerceValue(field, value);
      const { error: upsertError } = await client.from("form_responses").upsert(
        {
          qualification_session_id: session.id,
          form_field_id: field.id,
          value: coerced,
        },
        { onConflict: "qualification_session_id,form_field_id" },
      );
      if (upsertError) throw toDbException(upsertError);
    }

    const isFirstResponse = session.status === "CREATED" || session.status === "SENT" || session.status === "OPENED";
    const { data, error } = await client
      .from("qualification_sessions")
      .update({
        status: isFirstResponse ? "IN_PROGRESS" : session.status,
        started_at: session.started_at ?? new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", session.id)
      .select("*")
      .single();
    if (error) throw toDbException(error);

    if (!session.started_at) {
      await this.emitForSession(data, EventType.FORM_STARTED, actor);
    }
    const progressAfter = await this.computeProgressPercent(data);
    if (
      Math.floor(progressAfter / PROGRESS_STEP_PERCENT) >
      Math.floor(progressBefore / PROGRESS_STEP_PERCENT)
    ) {
      await this.emitForSession(data, EventType.FORM_PROGRESS_UPDATED, actor, {
        progressPercent: progressAfter,
      });
    }
    return data;
  }

  private async submitSession(session: SessionRow, actor: EventActor): Promise<SessionRow> {
    this.assertWritable(session);

    const form = await this.formsService.findById(session.form_id);
    const responses = await this.buildResponseMap(session.id, form);

    const missingLabels = form.steps
      .flatMap((step) => step.fields)
      .filter((f) => f.required && isEmptyValue(responses[f.key]))
      .map((f) => f.label);

    if (missingLabels.length > 0) {
      throw new BadRequestException(`Champs requis manquants : ${missingLabels.join(", ")}`);
    }

    const { data, error } = await this.supabase
      .getClient()
      .from("qualification_sessions")
      .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
      .eq("id", session.id)
      .select("*")
      .single();
    if (error) throw toDbException(error);

    // Une réponse complète fait avancer la demande — mais seulement si
    // elle n'est pas déjà allée plus loin dans le pipeline (ex. qualifiée
    // manuellement entre-temps) : pas encore d'analyse IA des réponses
    // (section 40) ni de workflow engine (Phase 15) pour arbitrer un vrai
    // retour en arrière, donc on ne fait jamais régresser un statut.
    const { data: requestRow, error: requestFetchError } = await this.supabase
      .getClient()
      .from("requests")
      .select("status")
      .eq("id", session.request_id)
      .maybeSingle();
    if (requestFetchError) throw toDbException(requestFetchError);

    if (requestRow && PRE_RESPONSE_REQUEST_STATUSES.includes(requestRow.status)) {
      const { error: requestError } = await this.supabase
        .getClient()
        .from("requests")
        .update({ status: "RESPONSE_RECEIVED" })
        .eq("id", session.request_id);
      if (requestError) throw toDbException(requestError);
    }

    logger.log({ sessionId: session.id, requestId: session.request_id }, "Qualification complétée");
    await this.emitForSession(data, EventType.FORM_COMPLETED, actor);
    return data;
  }

  private async buildDetail(session: SessionRow): Promise<QualificationSessionDetailResponse> {
    const form = await this.formsService.findById(session.form_id);
    const responses = await this.buildResponseMap(session.id, form);
    const response = await this.toResponse(session);
    return { ...response, form, responses };
  }

  private async buildPublicResponse(session: SessionRow): Promise<PublicQualificationSessionResponse> {
    const form = await this.formsService.findById(session.form_id);
    const responses = await this.buildResponseMap(session.id, form);

    const { data: requestRow, error: requestError } = await this.supabase
      .getClient()
      .from("requests")
      .select("reference, contact_id")
      .eq("id", session.request_id)
      .maybeSingle();
    if (requestError) throw toDbException(requestError);

    let contactFirstName: string | null = null;
    if (requestRow?.contact_id) {
      const { data: contact, error: contactError } = await this.supabase
        .getClient()
        .from("contacts")
        .select("first_name")
        .eq("id", requestRow.contact_id)
        .maybeSingle();
      if (contactError) throw toDbException(contactError);
      contactFirstName = contact?.first_name ?? null;
    }

    return {
      status: session.status as QualificationSessionStatus,
      expiresAt: session.expires_at,
      contactFirstName,
      serviceName: form.serviceName,
      requestReference: requestRow?.reference ?? "",
      form,
      responses,
    };
  }

  // ---- Résolution / garde-fous ----

  private async requireSession(id: string): Promise<SessionRow> {
    const { data, error } = await this.supabase
      .getClient()
      .from("qualification_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Session de qualification introuvable.");
    return this.withEffectiveStatus(data);
  }

  private async resolveByToken(rawToken: string): Promise<SessionRow> {
    const tokenHash = this.hashToken(rawToken);
    const { data, error } = await this.supabase
      .getClient()
      .from("qualification_sessions")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Lien de qualification introuvable.");
    return this.withEffectiveStatus(data);
  }

  // Auto-corrige un statut périmé (pas de tâche planifiée dans le
  // projet pour l'instant) : quiconque consulte une session dont
  // l'expiration est dépassée la voit — et la persiste — comme EXPIRED.
  private async withEffectiveStatus(session: SessionRow): Promise<SessionRow> {
    if (TERMINAL_STATUSES.includes(session.status as QualificationSessionStatus)) return session;
    if (new Date(session.expires_at).getTime() >= Date.now()) return session;

    const { data, error } = await this.supabase
      .getClient()
      .from("qualification_sessions")
      .update({ status: "EXPIRED" })
      .eq("id", session.id)
      .select("*")
      .single();
    if (error) throw toDbException(error);
    // Journalisé au moment où l'expiration est constatée (pas de tâche
    // planifiée) ; la date réelle d'expiration est dans le payload.
    await this.emitForSession(data, EventType.QUALIFICATION_LINK_EXPIRED, SYSTEM_ACTOR, {
      expiresAt: data.expires_at,
    });
    return data;
  }

  private async markOpenedIfNeeded(session: SessionRow): Promise<SessionRow> {
    if (session.opened_at) return session;
    if (session.status !== "CREATED" && session.status !== "SENT") return session;

    const { data, error } = await this.supabase
      .getClient()
      .from("qualification_sessions")
      .update({
        status: "OPENED",
        opened_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", session.id)
      .select("*")
      .single();
    if (error) throw toDbException(error);
    await this.emitForSession(data, EventType.QUALIFICATION_LINK_OPENED, SYSTEM_ACTOR);
    return data;
  }

  private assertWritable(session: SessionRow): void {
    switch (session.status as QualificationSessionStatus) {
      case "COMPLETED":
        throw new BadRequestException("Cette qualification est déjà terminée.");
      case "CANCELLED":
        throw new BadRequestException("Ce lien de qualification a été révoqué.");
      case "EXPIRED":
        throw new BadRequestException("Ce lien de qualification a expiré.");
      default:
        return;
    }
  }

  private async rotateToken(
    session: SessionRow,
    formName: string,
    actor: EventActor,
  ): Promise<QualificationSessionCreatedResponse> {
    const { rawToken, tokenHash } = this.generateToken();
    const nextStatus: QualificationSessionStatus = session.started_at
      ? QualificationSessionStatus.IN_PROGRESS
      : QualificationSessionStatus.CREATED;

    const { data, error } = await this.supabase
      .getClient()
      .from("qualification_sessions")
      .update({
        token_hash: tokenHash,
        expires_at: this.defaultExpiry(),
        opened_at: null,
        sent_at: null,
        status: nextStatus,
      })
      .eq("id", session.id)
      .select("*")
      .single();
    if (error) throw toDbException(error);

    logger.log({ sessionId: session.id, form: formName }, "Lien de qualification (re)généré");
    await this.emitForSession(data, EventType.QUALIFICATION_LINK_CREATED, actor, {
      formId: data.form_id,
      formName,
      regenerated: true,
    });
    return this.toCreatedResponse(data, rawToken);
  }

  private async emitForSession(
    session: SessionRow,
    type: EventType,
    actor: EventActor,
    payload: Record<string, string | number | boolean | null> = {},
  ): Promise<void> {
    await this.eventBus.emit({
      type,
      entityType: EventEntityType.QUALIFICATION_SESSION,
      entityId: session.id,
      requestId: session.request_id,
      actor,
      payload: { sessionId: session.id, ...payload },
    });
  }

  private async assertFormPublished(
    formId: string,
  ): Promise<{ id: string; name: string }> {
    const { data: form, error: formError } = await this.supabase
      .getClient()
      .from("forms")
      .select("id, name, status")
      .eq("id", formId)
      .maybeSingle();
    if (formError) throw toDbException(formError);
    if (!form) throw new NotFoundException("Formulaire introuvable.");
    if (form.status !== "PUBLISHED") {
      throw new BadRequestException(
        "Seul un formulaire publié peut être utilisé pour une qualification.",
      );
    }
    return form;
  }

  private async selectFieldByKey(formId: string, key: string): Promise<FormFieldRow | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("form_fields")
      .select("*, form_steps!inner(form_id)")
      .eq("key", key)
      .eq("form_steps.form_id", formId)
      .maybeSingle();
    if (error) throw toDbException(error);
    return data as FormFieldRow | null;
  }

  private async buildResponseMap(
    sessionId: string,
    form: FormResponse,
  ): Promise<Record<string, unknown>> {
    const { data, error } = await this.supabase
      .getClient()
      .from("form_responses")
      .select("form_field_id, value")
      .eq("qualification_session_id", sessionId);
    if (error) throw toDbException(error);

    const keyByFieldId = new Map<string, string>();
    for (const step of form.steps) {
      for (const field of step.fields) keyByFieldId.set(field.id, field.key);
    }

    const map: Record<string, unknown> = {};
    for (const row of data) {
      const key = keyByFieldId.get(row.form_field_id);
      if (key) map[key] = row.value;
    }
    return map;
  }

  private async assertRequestExists(requestId: string): Promise<void> {
    const { data, error } = await this.supabase
      .getClient()
      .from("requests")
      .select("id")
      .eq("id", requestId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Demande introuvable.");
  }

  private async computeProgressPercent(session: SessionRow): Promise<number> {
    const client = this.supabase.getClient();
    const { count: total, error: totalError } = await client
      .from("form_fields")
      .select("id, form_steps!inner(form_id)", { count: "exact", head: true })
      .eq("form_steps.form_id", session.form_id);
    if (totalError) throw toDbException(totalError);
    if (!total) return 0;

    const { count: answered, error: answeredError } = await client
      .from("form_responses")
      .select("id", { count: "exact", head: true })
      .eq("qualification_session_id", session.id);
    if (answeredError) throw toDbException(answeredError);

    return Math.round(((answered ?? 0) / total) * 100);
  }

  private async toResponse(session: SessionRow): Promise<QualificationSessionResponse> {
    const progressPercent = await this.computeProgressPercent(session);
    return {
      id: session.id,
      requestId: session.request_id,
      formId: session.form_id,
      status: session.status as QualificationSessionStatus,
      expiresAt: session.expires_at,
      sentAt: session.sent_at,
      openedAt: session.opened_at,
      startedAt: session.started_at,
      completedAt: session.completed_at,
      lastActivityAt: session.last_activity_at,
      progressPercent,
      createdAt: session.created_at,
    };
  }

  private async toCreatedResponse(
    session: SessionRow,
    rawToken: string,
  ): Promise<QualificationSessionCreatedResponse> {
    const response = await this.toResponse(session);
    return { ...response, qualificationUrl: this.buildQualificationUrl(rawToken) };
  }

  private buildQualificationUrl(rawToken: string): string {
    const base = this.config.getOrThrow<string>("PUBLIC_QUALIFICATION_URL");
    return `${base}/${rawToken}`;
  }

  private defaultExpiry(): string {
    return new Date(
      Date.now() + QUALIFICATION_LINK_DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  private generateToken(): { rawToken: string; tokenHash: string } {
    const rawToken = randomBytes(32).toString("base64url");
    return { rawToken, tokenHash: this.hashToken(rawToken) };
  }

  private hashToken(rawToken: string): string {
    return createHash("sha256").update(rawToken).digest("hex");
  }

  // Convertit/valide la réponse brute selon le type réel du champ — jamais
  // une simple écriture aveugle de ce que le client envoie. Appelé
  // uniquement pour une valeur non-null (`saveResponseForSession` gère le
  // cas `null`, qui supprime la réponse plutôt que de la coercer).
  private coerceValue(field: FormFieldRow, value: unknown): Json {
    const type = field.type as FormFieldType;
    const options = (field.options as unknown as FormFieldOption[] | null) ?? [];
    const optionValues = new Set(options.map((o) => o.value));

    switch (type) {
      case FormFieldType.NUMBER:
      case FormFieldType.CURRENCY:
      case FormFieldType.RANGE: {
        const num = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(num)) {
          throw new BadRequestException(`"${field.key}" doit être un nombre.`);
        }
        const validation = field.validation as { min?: number; max?: number } | null;
        if (validation?.min !== undefined && num < validation.min) {
          throw new BadRequestException(`"${field.key}" doit être ≥ ${validation.min}.`);
        }
        if (validation?.max !== undefined && num > validation.max) {
          throw new BadRequestException(`"${field.key}" doit être ≤ ${validation.max}.`);
        }
        return num;
      }

      case FormFieldType.SELECT:
      case FormFieldType.RADIO: {
        if (typeof value !== "string" || !optionValues.has(value)) {
          throw new BadRequestException(`Valeur invalide pour "${field.key}".`);
        }
        return value;
      }

      case FormFieldType.MULTI_SELECT:
      case FormFieldType.CHECKBOX: {
        if (
          !Array.isArray(value) ||
          value.some((v) => typeof v !== "string" || !optionValues.has(v))
        ) {
          throw new BadRequestException(`Valeurs invalides pour "${field.key}".`);
        }
        return value;
      }

      case FormFieldType.DATE: {
        if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
          throw new BadRequestException(`"${field.key}" doit être une date valide.`);
        }
        return value;
      }

      case FormFieldType.FILE:
        throw new BadRequestException(
          "Le téléversement de fichiers n'est pas encore disponible.",
        );

      default: {
        // TEXT, TEXTAREA, EMAIL, PHONE, URL
        if (typeof value !== "string") {
          throw new BadRequestException(`"${field.key}" doit être une chaîne de caractères.`);
        }
        const validation = field.validation as { minLength?: number; maxLength?: number } | null;
        if (validation?.minLength !== undefined && value.length < validation.minLength) {
          throw new BadRequestException(
            `"${field.key}" doit contenir au moins ${validation.minLength} caractères.`,
          );
        }
        if (validation?.maxLength !== undefined && value.length > validation.maxLength) {
          throw new BadRequestException(
            `"${field.key}" doit contenir au plus ${validation.maxLength} caractères.`,
          );
        }
        return value;
      }
    }
  }
}
