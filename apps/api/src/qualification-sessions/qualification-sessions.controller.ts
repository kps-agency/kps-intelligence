import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { CreateQualificationSessionDto } from "./dto/create-qualification-session.dto";
import { SaveFormResponseDto } from "./dto/save-form-response.dto";
import { QualificationSessionsService } from "./qualification-sessions.service";

// Flux authentifié interne (Phase 9) : remplir une qualification au nom
// d'un client depuis la fiche demande. La Phase 10 exposera en plus une
// route publique par token, au-dessus de ce même service.
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

  @Get("qualification-sessions/:id")
  @RequirePermissions("requests.read")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.sessionsService.findById(id);
  }

  @Put("qualification-sessions/:id/responses/:fieldKey")
  @RequirePermissions("requests.manage")
  async saveResponse(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("fieldKey") fieldKey: string,
    @Body() dto: SaveFormResponseDto,
  ) {
    await this.sessionsService.saveResponse(id, fieldKey, dto.value);
    return this.sessionsService.findById(id);
  }

  @Post("qualification-sessions/:id/submit")
  @RequirePermissions("requests.manage")
  submit(@Param("id", ParseUUIDPipe) id: string) {
    return this.sessionsService.submit(id);
  }
}
