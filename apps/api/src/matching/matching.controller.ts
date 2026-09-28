import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsUUID } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { userActor } from "../events/event-bus.service";
import type { AuthenticatedUser } from "../users/users.types";
import { MatchingService } from "./matching.service";

class AssignTeamMemberDto {
  @IsUUID("4", { message: "userId doit être un UUID." })
  userId!: string;
}

@ApiTags("matching")
@ApiBearerAuth()
@Controller("requests/:id")
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Get("matching")
  @RequirePermissions("requests.read")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.matchingService.get(id);
  }

  @Post("matching")
  @RequirePermissions("matching.manage")
  run(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.matchingService.run(id, userActor(user));
  }

  @Post("team-members")
  @RequirePermissions("matching.manage")
  assign(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignTeamMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.matchingService.assign(id, dto.userId, userActor(user));
  }

  @Delete("team-members/:userId")
  @RequirePermissions("matching.manage")
  unassign(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.matchingService.unassign(id, userId, userActor(user));
  }
}
