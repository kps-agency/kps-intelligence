import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import { toDbException } from "../common/db-error";

// Visibilité opérationnelle minimale sur le polling IMAP (section 67 —
// traçabilité) : pas de tableau de bord complet, juste de quoi vérifier
// que l'ingestion tourne et voir la dernière erreur le cas échéant.
@ApiTags("email")
@ApiBearerAuth()
@Controller("email-ingestion")
export class EmailStatusController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get("status")
  @RequirePermissions("email.read")
  async status() {
    const { data, error } = await this.supabase
      .getClient()
      .from("email_ingestion_state")
      .select("last_uid, last_polled_at, last_error")
      .eq("id", true)
      .maybeSingle();
    if (error) throw toDbException(error);

    return {
      lastUid: data?.last_uid ?? 0,
      lastPolledAt: data?.last_polled_at ?? null,
      lastError: data?.last_error ?? null,
    };
  }
}
