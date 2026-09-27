import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ContactResponse, Database, PaginatedResponse } from "@kps/types";
import { toDbException } from "../common/db-error";
import { toRange } from "../common/pagination-query.dto";
import { toWordPatterns } from "../common/search";
import { SupabaseService } from "../supabase/supabase.service";
import type { CreateContactDto } from "./dto/create-contact.dto";
import type { ListContactsQueryDto } from "./dto/list-contacts-query.dto";
import type { UpdateContactDto } from "./dto/update-contact.dto";

type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];
type ContactUpdate = Database["public"]["Tables"]["contacts"]["Update"];
type ContactWithClient = ContactRow & { clients: { company_name: string } | null };

const CONTACT_SELECT = "*, clients(company_name)";

function toContactResponse(row: ContactWithClient): ContactResponse {
  return {
    id: row.id,
    clientId: row.client_id,
    clientCompanyName: row.clients?.company_name ?? null,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    position: row.position,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class ContactsService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(
    query: ListContactsQueryDto,
  ): Promise<PaginatedResponse<ContactResponse>> {
    let request = this.supabase
      .getClient()
      .from("contacts")
      .select(CONTACT_SELECT, { count: "exact" });

    if (query.clientId) request = request.eq("client_id", query.clientId);

    // Chaque mot doit matcher au moins un champ ; les appels `.or()`
    // successifs s'enchaînent en AND (comportement standard de
    // postgrest-js), donc "Bob Durand" exige qu'un champ contienne "Bob"
    // ET qu'un champ (éventuellement différent) contienne "Durand".
    for (const pattern of query.search ? toWordPatterns(query.search) : []) {
      request = request.or(
        `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`,
      );
    }

    const [from, to] = toRange(query.page, query.limit);
    const { data, count, error } = await request
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .range(from, to);

    if (error) throw toDbException(error);

    return {
      data: (data as ContactWithClient[]).map(toContactResponse),
      meta: { total: count ?? 0, page: query.page, limit: query.limit },
    };
  }

  // Un client a peu de contacts : liste complète, principal en premier.
  async listByClient(clientId: string): Promise<ContactResponse[]> {
    await this.assertClientExists(clientId);

    const { data, error } = await this.supabase
      .getClient()
      .from("contacts")
      .select(CONTACT_SELECT)
      .eq("client_id", clientId)
      .order("is_primary", { ascending: false })
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });

    if (error) throw toDbException(error);
    return (data as ContactWithClient[]).map(toContactResponse);
  }

  async findById(id: string): Promise<ContactResponse> {
    const row = await this.selectById(id);
    if (!row) throw new NotFoundException("Contact introuvable.");
    return toContactResponse(row);
  }

  async create(clientId: string, dto: CreateContactDto): Promise<ContactResponse> {
    await this.assertClientExists(clientId);
    const client = this.supabase.getClient();

    const { data: inserted, error } = await client
      .from("contacts")
      .insert({
        client_id: clientId,
        first_name: dto.firstName,
        last_name: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        whatsapp: dto.whatsapp,
        position: dto.position,
        is_primary: false,
      })
      .select("id")
      .single();
    if (error) throw toDbException(error);

    // Principal si demandé, ou si le client n'en a pas encore (son premier
    // contact). La désignation passe par la fonction SQL atomique : deux
    // créations simultanées aboutissent à exactement un principal.
    const { data: existingPrimary, error: primaryError } = await client
      .from("contacts")
      .select("id")
      .eq("client_id", clientId)
      .eq("is_primary", true)
      .limit(1);
    if (primaryError) throw toDbException(primaryError);

    if (dto.isPrimary || existingPrimary.length === 0) {
      await this.setPrimary(inserted.id);
    }

    return this.findById(inserted.id);
  }

  async update(id: string, dto: UpdateContactDto): Promise<ContactResponse> {
    if (dto.firstName === null) {
      throw new BadRequestException("Le prénom ne peut pas être vide.");
    }
    if (dto.lastName === null) {
      throw new BadRequestException("Le nom ne peut pas être vide.");
    }

    const fields: ContactUpdate = {};
    if (dto.firstName !== undefined) fields.first_name = dto.firstName;
    if (dto.lastName !== undefined) fields.last_name = dto.lastName;
    if (dto.email !== undefined) fields.email = dto.email;
    if (dto.phone !== undefined) fields.phone = dto.phone;
    if (dto.whatsapp !== undefined) fields.whatsapp = dto.whatsapp;
    if (dto.position !== undefined) fields.position = dto.position;

    if (Object.keys(fields).length === 0 && !dto.isPrimary) {
      throw new BadRequestException("Aucun champ à modifier.");
    }

    if (Object.keys(fields).length > 0) {
      const { data, error } = await this.supabase
        .getClient()
        .from("contacts")
        .update(fields)
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw toDbException(error);
      if (!data) throw new NotFoundException("Contact introuvable.");
    }

    if (dto.isPrimary) await this.setPrimary(id);

    return this.findById(id);
  }

  async remove(id: string): Promise<void> {
    const contact = await this.selectById(id);
    if (!contact) throw new NotFoundException("Contact introuvable.");
    const client = this.supabase.getClient();

    const { error } = await client.from("contacts").delete().eq("id", id);
    if (error) throw toDbException(error);

    // Si on retire le contact principal, le plus ancien des restants
    // reprend le rôle : un client qui a des contacts en a toujours un
    // principal.
    if (contact.is_primary) {
      const { data: remaining, error: remainingError } = await client
        .from("contacts")
        .select("id")
        .eq("client_id", contact.client_id)
        .order("created_at", { ascending: true })
        .limit(1);
      if (remainingError) throw toDbException(remainingError);
      const next = remaining[0];
      if (next) await this.setPrimary(next.id);
    }
  }

  private async selectById(id: string): Promise<ContactWithClient | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("contacts")
      .select(CONTACT_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw toDbException(error);
    return data as ContactWithClient | null;
  }

  private async assertClientExists(clientId: string): Promise<void> {
    const { data, error } = await this.supabase
      .getClient()
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Client introuvable.");
  }

  private async setPrimary(contactId: string): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .rpc("set_primary_contact", { p_contact_id: contactId });
    if (error) throw toDbException(error);
  }
}
