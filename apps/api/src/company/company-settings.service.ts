import { Injectable } from "@nestjs/common";
import type { CompanySettingsResponse, Database } from "@kps/types";
import { toDbException } from "../common/db-error";
import { SupabaseService } from "../supabase/supabase.service";
import type { UpdateCompanySettingsDto } from "./company-settings.dto";

type Row = Database["public"]["Tables"]["company_settings"]["Row"];

function toResponse(row: Row): CompanySettingsResponse {
  return {
    legalName: row.legal_name,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    country: row.country,
    vatNumber: row.vat_number,
    email: row.email,
    phone: row.phone,
    website: row.website,
    iban: row.iban,
    defaultTaxRate: Number(row.default_tax_rate),
    quoteValidityDays: row.quote_validity_days,
    quoteTerms: row.quote_terms,
    updatedAt: row.updated_at,
  };
}

// Identité de l'émetteur des devis : une seule ligne en base, créée vide
// par la migration et renseignée par un administrateur.
@Injectable()
export class CompanySettingsService {
  constructor(private readonly supabase: SupabaseService) {}

  async get(): Promise<CompanySettingsResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from("company_settings")
      .select("*")
      .eq("id", true)
      .single();
    if (error) throw toDbException(error);
    return toResponse(data);
  }

  async update(dto: UpdateCompanySettingsDto, userId: string): Promise<CompanySettingsResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from("company_settings")
      .update({
        legal_name: dto.legalName,
        address: dto.address,
        postal_code: dto.postalCode,
        city: dto.city,
        country: dto.country,
        vat_number: dto.vatNumber,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        iban: dto.iban,
        default_tax_rate: dto.defaultTaxRate,
        quote_validity_days: dto.quoteValidityDays,
        quote_terms: dto.quoteTerms,
        updated_by: userId,
      })
      .eq("id", true)
      .select("*")
      .single();
    if (error) throw toDbException(error);
    return toResponse(data);
  }
}
