import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsISO8601 } from "class-validator";
import type { ReportOverviewResponse } from "@kps/types";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { toDbException } from "../common/db-error";
import { SupabaseService } from "../supabase/supabase.service";

const MAX_PERIOD_DAYS = 366;

class ReportPeriodDto {
  @IsISO8601({ strict: true }, { message: "from doit être une date (AAAA-MM-JJ)." })
  from!: string;

  @IsISO8601({ strict: true }, { message: "to doit être une date (AAAA-MM-JJ)." })
  to!: string;
}

// Rapports (section 56). Tous les chiffres sont calculés en SQL par
// `report_overview` : l'API valide la période et transmet le résultat.
@ApiTags("reports")
@ApiBearerAuth()
@Controller("reports")
export class ReportsController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get("overview")
  @RequirePermissions("reports.read")
  async overview(@Query() query: ReportPeriodDto): Promise<ReportOverviewResponse> {
    const from = query.from.slice(0, 10);
    const to = query.to.slice(0, 10);
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (days < 0) throw new BadRequestException("La fin de la période précède son début.");
    if (days >= MAX_PERIOD_DAYS) {
      throw new BadRequestException(`La période ne peut pas dépasser ${MAX_PERIOD_DAYS} jours.`);
    }

    const { data, error } = await this.supabase.getClient().rpc("report_overview", { p_from: from, p_to: to });
    if (error) throw toDbException(error);
    return { from, to, ...(data as unknown as Omit<ReportOverviewResponse, "from" | "to">) };
  }
}
