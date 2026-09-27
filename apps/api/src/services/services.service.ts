import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Database, ServiceResponse, ServiceSlug, ServiceStatus } from "@kps/types";
import { toDbException } from "../common/db-error";
import { SupabaseService } from "../supabase/supabase.service";
import type { UpdateServiceDto } from "./dto/update-service.dto";

type ServiceRow = Database["public"]["Tables"]["services"]["Row"];
type ServiceUpdate = Database["public"]["Tables"]["services"]["Update"];
type ServiceWithForm = ServiceRow & {
  qualification_form: { id: string; name: string } | null;
};

const SERVICE_SELECT =
  "*, qualification_form:forms!services_qualification_form_id_fkey(id, name)";

function toResponse(row: ServiceWithForm): ServiceResponse {
  return {
    id: row.id,
    slug: row.slug as ServiceSlug,
    name: row.name,
    description: row.description,
    status: row.status as ServiceStatus,
    qualificationFormId: row.qualification_form_id,
    qualificationFormName: row.qualification_form?.name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class ServicesService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(): Promise<ServiceResponse[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from("services")
      .select(SERVICE_SELECT)
      .order("name", { ascending: true });

    if (error) throw toDbException(error);
    return (data as ServiceWithForm[]).map(toResponse);
  }

  async findById(id: string): Promise<ServiceResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from("services")
      .select(SERVICE_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Service introuvable.");
    return toResponse(data as ServiceWithForm);
  }

  async update(id: string, dto: UpdateServiceDto): Promise<ServiceResponse> {
    if (dto.name === null) {
      throw new BadRequestException("Le nom ne peut pas être vide.");
    }

    if (dto.qualificationFormId) {
      const { data: form, error: formError } = await this.supabase
        .getClient()
        .from("forms")
        .select("id")
        .eq("id", dto.qualificationFormId)
        .maybeSingle();
      if (formError) throw toDbException(formError);
      if (!form) throw new NotFoundException("Formulaire introuvable.");
    }

    const fields: ServiceUpdate = {};
    if (dto.name !== undefined) fields.name = dto.name;
    if (dto.description !== undefined) fields.description = dto.description;
    if (dto.status !== undefined) fields.status = dto.status;
    if (dto.qualificationFormId !== undefined) {
      fields.qualification_form_id = dto.qualificationFormId;
    }

    if (Object.keys(fields).length === 0) {
      throw new BadRequestException("Aucun champ à modifier.");
    }

    const { data, error } = await this.supabase
      .getClient()
      .from("services")
      .update(fields)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Service introuvable.");
    return this.findById(id);
  }
}
