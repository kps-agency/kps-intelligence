import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { UpdateServiceDto } from "./dto/update-service.dto";
import { ServicesService } from "./services.service";

// Catalogue fixe (ServiceSlug), pré-seedé en base (migration 000016) :
// pas de POST/DELETE, seulement lecture et configuration.
@ApiTags("services")
@ApiBearerAuth()
@Controller("services")
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @RequirePermissions("services.read")
  list() {
    return this.servicesService.list();
  }

  @Get(":id")
  @RequirePermissions("services.read")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.servicesService.findById(id);
  }

  @Patch(":id")
  @RequirePermissions("services.manage")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(id, dto);
  }
}
