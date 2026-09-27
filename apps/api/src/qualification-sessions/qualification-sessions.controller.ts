import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { CreateQualificationSessionDto } from "./dto/create-qualification-session.dto";
import { ExtendQualificationSessionDto } from "./dto/extend-qualification-session.dto";
import { SaveFormResponseDto } from "./dto/save-form-response.dto";
import { QualificationSessionsService } from "./qualification-sessions.service";

// Flux authentifié interne : remplir une qualification au nom d'un
// client depuis la fiche demande (Phase 9), plus la gestion admin du
// lien public (Phase 10, section 37) — révoquer/prolonger/régénérer.
// La Phase 10 ajoute par ailleurs PublicQualificationController, qui
// consomme le même QualificationSessionsService par token plutôt que
// par id, sans authentification.
@ApiTags("qualification-sessions")
@ApiBearerAuth()
@Controller()
export class QualificationSessionsController {
  constructor(private readonly sessionsService: QualificationSessionsService) {}

  @Post("requests/:requestId/qualification-sessions")
  @RequirePermissions("requests.manage")
  create(
    @Param("requestId", ParseUUIDPipe) requestId: string,
    @Body() dto: CreateQualificationSessionDto,
  ) {
    return this.sessionsService.create(requestId, dto.formId);
  }

  @Get("requests/:requestId/qualification-sessions")
  @RequirePermissions("requests.read")
  list(@Param("requestId", ParseUUIDPipe) requestId: string) {
    return this.sessionsService.list(requestId);
  }

  @Get("qualification-sessions/:id")
  @RequirePermissions("requests.read")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.sessionsService.findById(id);
  }

  @Put("qualification-sessions/:id/responses/:fieldKey")
  @RequirePermissions("requests.manage")
  saveResponse(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("fieldKey") fieldKey: string,
    @Body() dto: SaveFormResponseDto,
  ) {
    return this.sessionsService.saveResponse(id, fieldKey, dto.value);
  }

  @Post("qualification-sessions/:id/submit")
  @RequirePermissions("requests.manage")
  submit(@Param("id", ParseUUIDPipe) id: string) {
    return this.sessionsService.submit(id);
  }

  @Post("qualification-sessions/:id/mark-sent")
  @RequirePermissions("requests.manage")
  markSent(@Param("id", ParseUUIDPipe) id: string) {
    return this.sessionsService.markSent(id);
  }

  @Post("qualification-sessions/:id/revoke")
  @RequirePermissions("requests.manage")
  revoke(@Param("id", ParseUUIDPipe) id: string) {
    return this.sessionsService.revoke(id);
  }

  @Post("qualification-sessions/:id/extend")
  @RequirePermissions("requests.manage")
  extend(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ExtendQualificationSessionDto) {
    return this.sessionsService.extend(id, dto.days);
  }

  @Post("qualification-sessions/:id/regenerate")
  @RequirePermissions("requests.manage")
  regenerate(@Param("id", ParseUUIDPipe) id: string) {
    return this.sessionsService.regenerate(id);
  }
}
