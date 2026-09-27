import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FormFieldType } from "@kps/types";
import type {
  Database,
  FormFieldCondition,
  FormFieldOption,
  FormFieldResponse,
  FormFieldValidation,
  FormListItemResponse,
  FormResponse,
  FormStatus,
  FormStepResponse,
  Json,
} from "@kps/types";
import { toDbException } from "../common/db-error";
import { SupabaseService } from "../supabase/supabase.service";
import type { CreateFormFieldDto, UpdateFormFieldDto } from "./dto/form-field.dto";
import type { CreateFormStepDto, UpdateFormStepDto } from "./dto/form-step.dto";
import type { CreateFormDto } from "./dto/create-form.dto";
import type { UpdateFormDto } from "./dto/update-form.dto";

type FormRow = Database["public"]["Tables"]["forms"]["Row"];
type FormUpdate = Database["public"]["Tables"]["forms"]["Update"];
type FormStepRow = Database["public"]["Tables"]["form_steps"]["Row"];
type FormFieldRow = Database["public"]["Tables"]["form_fields"]["Row"];

// Types dont les options doivent être fournies (le prospect choisit parmi
// une liste) — pour les autres, des options seraient sans effet.
const OPTION_BASED_TYPES: FormFieldType[] = [
  FormFieldType.SELECT,
  FormFieldType.MULTI_SELECT,
  FormFieldType.RADIO,
  FormFieldType.CHECKBOX,
];

type FormWithService = FormRow & { services: { name: string } | null };
type FormFull = FormWithService & {
  form_steps: (FormStepRow & { form_fields: FormFieldRow[] })[];
};
type FormWithCounts = FormWithService & {
  form_steps: { id: string; form_fields: { id: string }[] }[];
};

// Deux relations existent entre forms et services (forms.service_id, et
// services.qualification_form_id en sens inverse) : le nom de contrainte
// explicite lève l'ambiguïté que PostgREST refuserait sinon (PGRST201).
const FORM_SELECT = "*, services!forms_service_id_fkey(name)";
const FORM_LIST_SELECT = `${FORM_SELECT}, form_steps(id, form_fields(id))`;
const FORM_FULL_SELECT = `${FORM_SELECT}, form_steps(*, form_fields(*))`;

function toListItem(row: FormWithCounts): FormListItemResponse {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status as FormStatus,
    version: row.version,
    serviceId: row.service_id,
    serviceName: row.services?.name ?? null,
    stepCount: row.form_steps.length,
    fieldCount: row.form_steps.reduce((sum, step) => sum + step.form_fields.length, 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toFieldResponse(row: FormFieldRow): FormFieldResponse {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type as FormFieldType,
    required: row.required,
    options: (row.options as unknown as FormFieldOption[] | null) ?? null,
    validation: (row.validation as unknown as FormFieldValidation | null) ?? null,
    conditionalLogic: (row.conditional_logic as unknown as FormFieldCondition | null) ?? null,
    orderIndex: row.order_index,
  };
}

function toStepResponse(row: FormStepRow & { form_fields: FormFieldRow[] }): FormStepResponse {
  return {
    id: row.id,
    title: row.title,
    orderIndex: row.order_index,
    fields: row.form_fields.map(toFieldResponse),
  };
}

function toFormResponse(row: FormFull): FormResponse {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status as FormStatus,
    version: row.version,
    serviceId: row.service_id,
    serviceName: row.services?.name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    steps: row.form_steps.map(toStepResponse),
  };
}

@Injectable()
export class FormsService {
  constructor(private readonly supabase: SupabaseService) {}

  // ---- Forms ----

  async list(): Promise<FormListItemResponse[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from("forms")
      .select(FORM_LIST_SELECT)
      .order("name", { ascending: true });

    if (error) throw toDbException(error);
    return (data as unknown as FormWithCounts[]).map(toListItem);
  }

  async findById(id: string): Promise<FormResponse> {
    const row = await this.selectFullForm(id);
    if (!row) throw new NotFoundException("Formulaire introuvable.");
    return toFormResponse(row);
  }

  async create(dto: CreateFormDto): Promise<FormResponse> {
    if (dto.serviceId) await this.assertServiceExists(dto.serviceId);

    const { data, error } = await this.supabase
      .getClient()
      .from("forms")
      .insert({
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        service_id: dto.serviceId,
      })
      .select("id")
      .single();

    if (error) throw toDbException(error);
    return this.findById(data.id);
  }

  async update(id: string, dto: UpdateFormDto): Promise<FormResponse> {
    if (dto.name === null) {
      throw new BadRequestException("Le nom ne peut pas être vide.");
    }
    if (dto.serviceId) await this.assertServiceExists(dto.serviceId);

    const fields: FormUpdate = {};
    if (dto.name !== undefined) fields.name = dto.name;
    if (dto.description !== undefined) fields.description = dto.description;
    if (dto.status !== undefined) fields.status = dto.status;
    if (dto.serviceId !== undefined) fields.service_id = dto.serviceId;

    if (Object.keys(fields).length === 0) {
      throw new BadRequestException("Aucun champ à modifier.");
    }

    const { data, error } = await this.supabase
      .getClient()
      .from("forms")
      .update(fields)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Formulaire introuvable.");
    return this.findById(id);
  }

  // ---- Steps ----

  async createStep(formId: string, dto: CreateFormStepDto): Promise<FormStepResponse> {
    await this.assertFormExists(formId);
    const client = this.supabase.getClient();

    const { data: last } = await client
      .from("form_steps")
      .select("order_index")
      .eq("form_id", formId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await client
      .from("form_steps")
      .insert({
        form_id: formId,
        title: dto.title,
        order_index: (last?.order_index ?? -1) + 1,
      })
      .select("*")
      .single();

    if (error) throw toDbException(error);
    return toStepResponse({ ...data, form_fields: [] });
  }

  async updateStep(
    formId: string,
    stepId: string,
    dto: UpdateFormStepDto,
  ): Promise<FormStepResponse> {
    if (dto.title === null) {
      throw new BadRequestException("Le titre ne peut pas être vide.");
    }
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException("Aucun champ à modifier.");
    }

    const step = await this.selectStep(formId, stepId);
    if (!step) throw new NotFoundException("Étape introuvable.");

    const { error } = await this.supabase
      .getClient()
      .from("form_steps")
      .update({ title: dto.title })
      .eq("id", stepId);
    if (error) throw toDbException(error);

    const fields = await this.selectFields(stepId);
    return toStepResponse({ ...step, title: dto.title ?? step.title, form_fields: fields });
  }

  async deleteStep(formId: string, stepId: string): Promise<void> {
    const step = await this.selectStep(formId, stepId);
    if (!step) throw new NotFoundException("Étape introuvable.");

    const { error } = await this.supabase.getClient().from("form_steps").delete().eq("id", stepId);
    if (error) throw toDbException(error);
  }

  async reorderSteps(formId: string, orderedIds: string[]): Promise<void> {
    await this.assertFormExists(formId);
    const client = this.supabase.getClient();

    const { data: existing, error } = await client
      .from("form_steps")
      .select("id")
      .eq("form_id", formId);
    if (error) throw toDbException(error);

    this.assertSameIdSet(
      existing.map((s) => s.id),
      orderedIds,
      "étapes",
    );

    const { error: rpcError } = await client.rpc("reorder_form_steps", {
      p_form_id: formId,
      p_step_ids: orderedIds,
    });
    if (rpcError) throw toDbException(rpcError);
  }

  // ---- Fields ----

  async createField(
    formId: string,
    stepId: string,
    dto: CreateFormFieldDto,
  ): Promise<FormFieldResponse> {
    const step = await this.selectStep(formId, stepId);
    if (!step) throw new NotFoundException("Étape introuvable.");

    this.assertOptionsMatchType(dto.type, dto.options);
    await this.assertKeyAvailable(formId, dto.key);
    if (dto.conditionalLogic) {
      await this.assertConditionFieldExists(formId, dto.conditionalLogic.field);
    }

    const client = this.supabase.getClient();
    const { data: last } = await client
      .from("form_fields")
      .select("order_index")
      .eq("form_step_id", stepId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await client
      .from("form_fields")
      .insert({
        form_step_id: stepId,
        key: dto.key,
        label: dto.label,
        type: dto.type,
        required: dto.required ?? false,
        options: (dto.options as unknown as Json) ?? null,
        validation: (dto.validation as unknown as Json) ?? null,
        conditional_logic: (dto.conditionalLogic as unknown as Json) ?? null,
        order_index: (last?.order_index ?? -1) + 1,
      })
      .select("*")
      .single();

    if (error) throw toDbException(error);
    return toFieldResponse(data);
  }

  async updateField(
    formId: string,
    stepId: string,
    fieldId: string,
    dto: UpdateFormFieldDto,
  ): Promise<FormFieldResponse> {
    if (dto.key === null) throw new BadRequestException("La clé du champ ne peut pas être vide.");
    if (dto.label === null) throw new BadRequestException("Le libellé ne peut pas être vide.");
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException("Aucun champ à modifier.");
    }

    const field = await this.selectField(formId, stepId, fieldId);
    if (!field) throw new NotFoundException("Champ introuvable.");

    const nextType = (dto.type ?? field.type) as FormFieldType;
    const nextOptions =
      dto.options !== undefined ? dto.options : (field.options as unknown as FormFieldOption[] | null);
    this.assertOptionsMatchType(nextType, nextOptions ?? undefined);

    if (dto.key !== undefined) await this.assertKeyAvailable(formId, dto.key, fieldId);
    if (dto.conditionalLogic) {
      await this.assertConditionFieldExists(formId, dto.conditionalLogic.field, dto.key ?? field.key);
    }

    const update: Database["public"]["Tables"]["form_fields"]["Update"] = {};
    if (dto.key !== undefined) update.key = dto.key;
    if (dto.label !== undefined) update.label = dto.label;
    if (dto.type !== undefined) update.type = dto.type;
    if (dto.required !== undefined) update.required = dto.required;
    if (dto.options !== undefined) update.options = dto.options as unknown as Json;
    if (dto.validation !== undefined) update.validation = dto.validation as unknown as Json;
    if (dto.conditionalLogic !== undefined) {
      update.conditional_logic = dto.conditionalLogic as unknown as Json;
    }

    const { data, error } = await this.supabase
      .getClient()
      .from("form_fields")
      .update(update)
      .eq("id", fieldId)
      .select("*")
      .single();

    if (error) throw toDbException(error);
    return toFieldResponse(data);
  }

  async deleteField(formId: string, stepId: string, fieldId: string): Promise<void> {
    const field = await this.selectField(formId, stepId, fieldId);
    if (!field) throw new NotFoundException("Champ introuvable.");

    const { error } = await this.supabase
      .getClient()
      .from("form_fields")
      .delete()
      .eq("id", fieldId);
    if (error) throw toDbException(error);
  }

  async reorderFields(formId: string, stepId: string, orderedIds: string[]): Promise<void> {
    const step = await this.selectStep(formId, stepId);
    if (!step) throw new NotFoundException("Étape introuvable.");

    const client = this.supabase.getClient();
    const { data: existing, error } = await client
      .from("form_fields")
      .select("id")
      .eq("form_step_id", stepId);
    if (error) throw toDbException(error);

    this.assertSameIdSet(
      existing.map((f) => f.id),
      orderedIds,
      "champs",
    );

    const { error: rpcError } = await client.rpc("reorder_form_fields", {
      p_form_step_id: stepId,
      p_field_ids: orderedIds,
    });
    if (rpcError) throw toDbException(rpcError);
  }

  // ---- Helpers ----

  private async selectFullForm(id: string): Promise<FormFull | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("forms")
      .select(FORM_FULL_SELECT)
      .eq("id", id)
      .order("order_index", { referencedTable: "form_steps" })
      .order("order_index", { referencedTable: "form_steps.form_fields" })
      .maybeSingle();

    if (error) throw toDbException(error);
    return data as unknown as FormFull | null;
  }

  private async selectStep(
    formId: string,
    stepId: string,
  ): Promise<FormStepRow | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("form_steps")
      .select("*")
      .eq("id", stepId)
      .eq("form_id", formId)
      .maybeSingle();
    if (error) throw toDbException(error);
    return data;
  }

  private async selectField(
    formId: string,
    stepId: string,
    fieldId: string,
  ): Promise<FormFieldRow | null> {
    const step = await this.selectStep(formId, stepId);
    if (!step) return null;

    const { data, error } = await this.supabase
      .getClient()
      .from("form_fields")
      .select("*")
      .eq("id", fieldId)
      .eq("form_step_id", stepId)
      .maybeSingle();
    if (error) throw toDbException(error);
    return data;
  }

  private async selectFields(stepId: string): Promise<FormFieldRow[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from("form_fields")
      .select("*")
      .eq("form_step_id", stepId)
      .order("order_index", { ascending: true });
    if (error) throw toDbException(error);
    return data;
  }

  private async assertFormExists(formId: string): Promise<void> {
    const { data, error } = await this.supabase
      .getClient()
      .from("forms")
      .select("id")
      .eq("id", formId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Formulaire introuvable.");
  }

  private async assertServiceExists(serviceId: string): Promise<void> {
    const { data, error } = await this.supabase
      .getClient()
      .from("services")
      .select("id")
      .eq("id", serviceId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Service introuvable.");
  }

  private assertOptionsMatchType(type: FormFieldType, options?: FormFieldOption[]): void {
    const needsOptions = OPTION_BASED_TYPES.includes(type);
    if (needsOptions && (!options || options.length === 0)) {
      throw new BadRequestException(
        `Le type ${type} nécessite au moins une option.`,
      );
    }
    if (!needsOptions && options && options.length > 0) {
      throw new BadRequestException(`Le type ${type} n'accepte pas d'options.`);
    }
  }

  // La clé d'un champ doit être unique dans tout le formulaire (pas
  // seulement dans son étape) : c'est elle qui identifie la réponse
  // (form_responses) et qui est référencée par les conditions d'affichage
  // d'autres champs, quelle que soit leur étape.
  private async assertKeyAvailable(
    formId: string,
    key: string,
    excludeFieldId?: string,
  ): Promise<void> {
    const { data, error } = await this.supabase
      .getClient()
      .from("form_fields")
      .select("id, form_steps!inner(form_id)")
      .eq("key", key)
      .eq("form_steps.form_id", formId);
    if (error) throw toDbException(error);

    const conflict = (data as { id: string }[]).find((row) => row.id !== excludeFieldId);
    if (conflict) {
      throw new BadRequestException(`La clé "${key}" est déjà utilisée dans ce formulaire.`);
    }
  }

  private async assertConditionFieldExists(
    formId: string,
    fieldKey: string,
    ownKey?: string,
  ): Promise<void> {
    if (fieldKey === ownKey) {
      throw new BadRequestException("Un champ ne peut pas dépendre de lui-même.");
    }

    const { data, error } = await this.supabase
      .getClient()
      .from("form_fields")
      .select("id, form_steps!inner(form_id)")
      .eq("key", fieldKey)
      .eq("form_steps.form_id", formId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) {
      throw new BadRequestException(
        `La condition référence un champ inconnu ("${fieldKey}").`,
      );
    }
  }

  private assertSameIdSet(existingIds: string[], orderedIds: string[], label: string): void {
    const existingSet = new Set(existingIds);
    const orderedSet = new Set(orderedIds);
    const sameSize = existingSet.size === orderedSet.size && existingIds.length === orderedIds.length;
    const sameMembers = sameSize && existingIds.every((id) => orderedSet.has(id));

    if (!sameSize || !sameMembers) {
      throw new BadRequestException(
        `La liste réordonnée ne correspond pas aux ${label} existant(e)s.`,
      );
    }
  }
}
