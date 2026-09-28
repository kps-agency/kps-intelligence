import { Controller, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { userActor } from "../events/event-bus.service";
import type { AuthenticatedUser } from "../users/users.types";
import { QualificationAnalysisService } from "./qualification-analysis.service";

// Relance manuelle de l'analyse des réponses (l'analyse automatique est
// déclenchée par le workflow `qualification-analysis`).
@ApiTags("requests")
@ApiBearerAuth()
@Controller("requests/:id/qualification-analysis")
export class QualificationAnalysisController {
  constructor(private readonly service: QualificationAnalysisService) {}

  @Post()
  @RequirePermissions("requests.manage")
  analyze(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.analyze(id, userActor(user));
  }
}
