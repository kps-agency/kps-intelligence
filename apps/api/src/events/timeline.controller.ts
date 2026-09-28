import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { TimelineService } from "./timeline.service";

@ApiTags("events")
@ApiBearerAuth()
@Controller("requests/:id/timeline")
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  @Get()
  @RequirePermissions("requests.read")
  forRequest(@Param("id", ParseUUIDPipe) id: string) {
    return this.timelineService.forRequest(id);
  }
}
