import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { userActor } from "../events/event-bus.service";
import { TimelineService } from "../events/timeline.service";
import type { AuthenticatedUser } from "../users/users.types";
import {
  ChangeOpportunityStageDto,
  CreateOpportunityDto,
  ListOpportunitiesQueryDto,
  OpportunityBoardQueryDto,
  UpdateOpportunityDto,
} from "./dto/opportunity.dto";
import { OpportunitiesService } from "./opportunities.service";

// Pas de suppression : une opportunité abandonnée passe à l'étape
// « Perdue », son historique reste consultable.
@ApiTags("opportunities")
@ApiBearerAuth()
@Controller("opportunities")
export class OpportunitiesController {
  constructor(
    private readonly opportunitiesService: OpportunitiesService,
    private readonly timelineService: TimelineService,
  ) {}

  @Get()
  @RequirePermissions("opportunities.read")
  list(@Query() query: ListOpportunitiesQueryDto) {
    return this.opportunitiesService.list(query);
  }

  // Déclarées avant ":id" : Nest résout les routes dans l'ordre.
  @Get("board")
  @RequirePermissions("opportunities.read")
  board(@Query() query: OpportunityBoardQueryDto) {
    return this.opportunitiesService.board(query);
  }

  @Get("owners")
  @RequirePermissions("opportunities.read")
  owners() {
    return this.opportunitiesService.listOwners();
  }

  @Get(":id")
  @RequirePermissions("opportunities.read")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.opportunitiesService.findById(id);
  }

  @Get(":id/timeline")
  @RequirePermissions("opportunities.read")
  async timeline(@Param("id", ParseUUIDPipe) id: string) {
    await this.opportunitiesService.findById(id);
    return this.timelineService.forOpportunity(id);
  }

  @Post()
  @RequirePermissions("opportunities.manage")
  create(@Body() dto: CreateOpportunityDto, @CurrentUser() user: AuthenticatedUser) {
    return this.opportunitiesService.create(dto, userActor(user));
  }

  @Patch(":id")
  @RequirePermissions("opportunities.manage")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateOpportunityDto) {
    return this.opportunitiesService.update(id, dto);
  }

  @Patch(":id/stage")
  @RequirePermissions("opportunities.manage")
  changeStage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ChangeOpportunityStageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.opportunitiesService.changeStage(id, dto, userActor(user));
  }
}
