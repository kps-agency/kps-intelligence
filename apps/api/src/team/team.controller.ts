import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import type { AuthenticatedUser } from "../users/users.types";
import {
  CreateSkillDto,
  UpdateAvailabilityDto,
  UpdateTeamProfileDto,
  UpdateTeamSkillsDto,
} from "./dto/team.dto";
import { TeamService } from "./team.service";

// Modification : son propre profil pour tout utilisateur connecté, celui
// des autres avec team.manage (vérifié dans le service, qui connaît la
// cible).
@ApiTags("team")
@ApiBearerAuth()
@Controller()
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get("team")
  @RequirePermissions("team.read")
  list() {
    return this.teamService.list();
  }

  @Get("team/:id")
  @RequirePermissions("team.read")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.teamService.findById(id);
  }

  @Put("team/:id/profile")
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamProfileDto,
  ) {
    return this.teamService.updateProfile(user, id, dto);
  }

  @Put("team/:id/skills")
  updateSkills(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamSkillsDto,
  ) {
    return this.teamService.updateSkills(user, id, dto);
  }

  @Put("team/:id/availability")
  updateAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.teamService.updateAvailability(user, id, dto);
  }

  @Get("skills")
  @RequirePermissions("team.read")
  listSkills() {
    return this.teamService.listSkills();
  }

  @Post("skills")
  @RequirePermissions("team.manage")
  createSkill(@Body() dto: CreateSkillDto) {
    return this.teamService.createSkill(dto);
  }
}
