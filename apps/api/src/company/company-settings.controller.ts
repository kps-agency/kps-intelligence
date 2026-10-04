import { Body, Controller, Get, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import type { AuthenticatedUser } from "../users/users.types";
import { UpdateCompanySettingsDto } from "./company-settings.dto";
import { CompanySettingsService } from "./company-settings.service";

@ApiTags("company-settings")
@ApiBearerAuth()
@Controller("company-settings")
export class CompanySettingsController {
  constructor(private readonly service: CompanySettingsService) {}

  // Lisible par quiconque consulte les devis : ce sont les mentions qui
  // figurent sur leurs PDF.
  @Get()
  @RequirePermissions("quotes.read")
  get() {
    return this.service.get();
  }

  @Put()
  @RequirePermissions("settings.manage")
  update(@Body() dto: UpdateCompanySettingsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(dto, user.id);
  }
}
