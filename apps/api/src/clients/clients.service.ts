import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ClientListItemResponse,
  ClientResponse,
  ClientStatus,
  Database,
  PaginatedResponse,
  RequestSource,
} from "@kps/types";
import { toDbException } from "../common/db-error";
import { toRange } from "../common/pagination-query.dto";
import { toContainsPattern } from "../common/search";
import { SupabaseService } from "../supabase/supabase.service";
import type { CreateClientDto } from "./dto/create-client.dto";
import type { ListClientsQueryDto } from "./dto/list-clients-query.dto";
import type { UpdateClientDto } from "./dto/update-client.dto";

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];
type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"];

export function toClientResponse(row: ClientRow): ClientResponse {
  return {
    id: row.id,
    companyName: row.company_name,
    country: row.country,
    city: row.city,
    industry: row.industry,
    website: row.website,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    // Les enums Postgres générés sont des unions littérales ; nos enums
    // TypeScript (packages/types) en sont la source alignée 1:1.
    status: row.status as ClientStatus,
    source: row.source as RequestSource | null,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Champs du DTO -> colonnes. `undefined` = champ non envoyé (ignoré),
// `null` = à effacer.
function toRowFields(dto: UpdateClientDto): ClientUpdate {
  const fields: ClientUpdate = {};
  if (dto.companyName !== undefined) fields.company_name = dto.companyName as string;
  if (dto.country !== undefined) fields.country = dto.country;
  if (dto.city !== undefined) fields.city = dto.city;
  if (dto.industry !== undefined) fields.industry = dto.industry;
  if (dto.website !== undefined) fields.website = dto.website;
  if (dto.email !== undefined) fields.email = dto.email;
  if (dto.phone !== undefined) fields.phone = dto.phone;
  if (dto.whatsapp !== undefined) fields.whatsapp = dto.whatsapp;
  if (dto.status !== undefined) fields.status = dto.status as ClientUpdate["status"];
  if (dto.source !== undefined) fields.source = dto.source as ClientUpdate["source"];
  if (dto.notes !== undefined) fields.notes = dto.notes;
  return fields;
}

@Injectable()
export class ClientsService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(
    query: ListClientsQueryDto,
  ): Promise<PaginatedResponse<ClientListItemResponse>> {
    let request = this.supabase
      .getClient()
      .from("clients")
      .select("*, contacts(count)", { count: "exact" });

    if (query.status) request = request.eq("status", query.status);

    const pattern = query.search ? toContainsPattern(query.search) : null;
    if (pattern) {
      request = request.or(
        `company_name.ilike.${pattern},email.ilike.${pattern},city.ilike.${pattern}`,
      );
    }

    const [from, to] = toRange(query.page, query.limit);
    const { data, count, error } = await request
      .order("company_name", { ascending: true })
      .range(from, to);

    if (error) throw toDbException(error);

    return {
      data: data.map((row) => ({
        ...toClientResponse(row),
        contactsCount: row.contacts[0]?.count ?? 0,
      })),
      meta: { total: count ?? 0, page: query.page, limit: query.limit },
    };
  }

  async findById(id: string): Promise<ClientResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from("clients")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Client introuvable.");
    return toClientResponse(data);
  }

  async create(dto: CreateClientDto): Promise<ClientResponse> {
    const insert: ClientInsert = {
      company_name: dto.companyName,
      ...toRowFields(dto),
    };

    const { data, error } = await this.supabase
      .getClient()
      .from("clients")
      .insert(insert)
      .select("*")
      .single();

    if (error) throw toDbException(error);
    return toClientResponse(data);
  }

  async update(id: string, dto: UpdateClientDto): Promise<ClientResponse> {
    if (dto.companyName === null) {
      throw new BadRequestException("Le nom de la société ne peut pas être vide.");
    }
    if (dto.status === null) {
      throw new BadRequestException("Le statut ne peut pas être vide.");
    }

    const fields = toRowFields(dto);
    if (Object.keys(fields).length === 0) {
      throw new BadRequestException("Aucun champ à modifier.");
    }

    const { data, error } = await this.supabase
      .getClient()
      .from("clients")
      .update(fields)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Client introuvable.");
    return toClientResponse(data);
  }
}
