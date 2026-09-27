import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { QUALIFICATION_LINK_DEFAULT_EXPIRY_DAYS } from "@kps/shared";
import { FormFieldType } from "@kps/types";
import type {
  Database,
  FormFieldOption,
  FormResponse,
  Json,
  QualificationSessionDetailResponse,
  QualificationSessionResponse,
  QualificationSessionStatus,
} from "@kps/types";
import { FormsService } from "../forms/forms.service";
import { toDbException } from "../common/db-error";
import { SupabaseService } from "../supabase/supabase.service";

type SessionRow = Database["public"]["Tables"]["qualification_sessions"]["Row"];
type FormFieldRow = Database["public"]["Tables"]["form_fields"]["Row"];

// États dans lesquels une session est encore "en cours" : réutilisée
// plutôt que d'en recréer une nouvelle à chaque clic (Phase 9, flux
// authentifié interne — SENT/OPENED n'existent que côté Phase 10, mais
// une session peut déjà y être si elle a été créée puis marquée ainsi par
// un futur envoi manuel).
const ACTIVE_SESSION_STATUSES: QualificationSessionStatus[] = [
  "CREATED",
  "SENT",
  "OPENED",
  "IN_PROGRESS",
] as QualificationSessionStatus[];

function toSessionResponse(row: SessionRow): QualificationSessionResponse {
  return {
    id: row.id,
    requestId: row.request_id,
    formId: row.form_id,
    status: row.status as QualificationSessionStatus,
    expiresAt: row.expires_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
  };
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

@Injectable()
export class QualificationSessionsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly formsService: FormsService,
  ) {}

  async create(requestId: string, formId: string): Promise<QualificationSessionResponse> {
    await this.assertRequestExists(requestId);

    const { data: form, error: formError } = await this.supabase
      .getClient()
      .from("forms")
      .select("id, status")
      .eq("id", formId)
      .maybeSingle();
    if (formError) throw toDbException(formError);
    if (!form) throw new NotFoundException("Formulaire introuvable.");
    if (form.status !== "PUBLISHED") {
      throw new BadRequestException(
        "Seul un formulaire publié peut être utilisé pour une qualification.",
      );
    }

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
    if (existing) return toSessionResponse(existing);

    const tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
    const expiresAt = new Date(
      Date.now() + QUALIFICATION_LINK_DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data, error } = await client
      .from("qualification_sessions")
      .insert({
        request_id: requestId,
        form_id: formId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (error) throw toDbException(error);

    return toSessionResponse(data);
  }

  async findById(id: string): Promise<QualificationSessionDetailResponse> {
    const session = await this.selectSession(id);
    if (!session) throw new NotFoundException("Session de qualification introuvable.");

    const form = await this.formsService.findById(session.form_id);
    const responses = await this.buildResponseMap(id, form);

    return { ...toSessionResponse(session), form, responses };
  }

  async saveResponse(sessionId: string, fieldKey: string, value: unknown): Promise<void> {
    const session = await this.selectSession(sessionId);
    if (!session) throw new NotFoundException("Session de qualification introuvable.");
    if (session.status === "COMPLETED") {
      throw new BadRequestException("Cette qualification est déjà terminée.");
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      throw new BadRequestException("Ce lien de qualification a expiré.");
    }

    const field = await this.selectFieldByKey(session.form_id, fieldKey);
    if (!field) {
      throw new NotFoundException(`Champ inconnu pour ce formulaire ("${fieldKey}").`);
    }

    const client = this.supabase.getClient();

    if (value === null) {
      // form_responses.value est NOT NULL : « effacer » une réponse
      // signifie donc supprimer la ligne, pas y écrire un null SQL.
      const { error: deleteError } = await client
        .from("form_responses")
        .delete()
        .eq("qualification_session_id", sessionId)
        .eq("form_field_id", field.id);
      if (deleteError) throw toDbException(deleteError);
    } else {
      const coerced = this.coerceValue(field, value);
      const { error: upsertError } = await client.from("form_responses").upsert(
        {
          qualification_session_id: sessionId,
          form_field_id: field.id,
          value: coerced,
        },
        { onConflict: "qualification_session_id,form_field_id" },
      );
      if (upsertError) throw toDbException(upsertError);
    }

    const isFirstResponse = session.status === "CREATED";
    const { error: updateError } = await client
      .from("qualification_sessions")
      .update({
        status: isFirstResponse ? "IN_PROGRESS" : session.status,
        started_at: session.started_at ?? new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    if (updateError) throw toDbException(updateError);
  }

  async submit(id: string): Promise<QualificationSessionResponse> {
    const session = await this.selectSession(id);
    if (!session) throw new NotFoundException("Session de qualification introuvable.");
    if (session.status === "COMPLETED") {
      throw new BadRequestException("Cette qualification est déjà terminée.");
    }

    const form = await this.formsService.findById(session.form_id);
    const responses = await this.buildResponseMap(id, form);

    const missingLabels = form.steps
      .flatMap((step) => step.fields)
      .filter((f) => f.required && isEmptyValue(responses[f.key]))
      .map((f) => f.label);

    if (missingLabels.length > 0) {
      throw new BadRequestException(
        `Champs requis manquants : ${missingLabels.join(", ")}`,
      );
    }

    const { data, error } = await this.supabase
      .getClient()
      .from("qualification_sessions")
      .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw toDbException(error);

    return toSessionResponse(data);
  }

  // ---- Helpers ----

  private async selectSession(id: string): Promise<SessionRow | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("qualification_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw toDbException(error);
    return data;
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

  // Convertit/valide la réponse brute selon le type réel du champ — jamais
  // une simple écriture aveugle de ce que le client envoie. `null` efface
  // toujours la réponse, quel que soit le type.
  // Appelé uniquement pour une valeur non-null (l'appelant gère le cas
  // `null` séparément — voir saveResponse).
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
        if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || !optionValues.has(v))) {
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
