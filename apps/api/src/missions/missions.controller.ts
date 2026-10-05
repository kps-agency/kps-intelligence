import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { EventEntityType } from "@kps/types";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { userActor } from "../events/event-bus.service";
import { TimelineService } from "../events/timeline.service";
import type { AuthenticatedUser } from "../users/users.types";
import {
  AddMissionMemberDto,
  ChangeMissionStatusDto,
  CreateMissionDto,
  CreateTaskCommentDto,
  CreateTaskDto,
  ListMissionsQueryDto,
  UpdateMissionDto,
  UpdateTaskDto,
} from "./dto/mission.dto";
import { MissionsService } from "./missions.service";
import { TasksService } from "./tasks.service";

// Pas de suppression de mission : une mission abandonnée passe au statut
// « Annulée », son historique reste consultable.
@ApiTags("missions")
@ApiBearerAuth()
@Controller()
export class MissionsController {
  constructor(
    private readonly missionsService: MissionsService,
    private readonly tasksService: TasksService,
    private readonly timelineService: TimelineService,
  ) {}

  @Get("missions")
  @RequirePermissions("missions.read")
  list(@Query() query: ListMissionsQueryDto) {
    return this.missionsService.list(query);
  }

  // Déclarée avant ":id" : Nest résout les routes dans l'ordre.
  @Get("missions/managers")
  @RequirePermissions("missions.read")
  managers() {
    return this.missionsService.listManagers();
  }

  @Get("missions/:id")
  @RequirePermissions("missions.read")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.missionsService.findById(id);
  }

  @Get("missions/:id/timeline")
  @RequirePermissions("missions.read")
  async timeline(@Param("id", ParseUUIDPipe) id: string) {
    await this.missionsService.findById(id);
    return this.timelineService.forEntity(EventEntityType.MISSION, id);
  }

  @Post("missions")
  @RequirePermissions("missions.manage")
  create(@Body() dto: CreateMissionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.missionsService.create(dto, userActor(user));
  }

  @Patch("missions/:id")
  @RequirePermissions("missions.manage")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateMissionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.missionsService.update(id, dto, userActor(user));
  }

  @Patch("missions/:id/status")
  @RequirePermissions("missions.manage")
  changeStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ChangeMissionStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.missionsService.changeStatus(id, dto, userActor(user));
  }

  @Post("missions/:id/members")
  @RequirePermissions("missions.manage")
  addMember(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddMissionMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.missionsService.addMember(id, dto, userActor(user));
  }

  @Delete("missions/:id/members/:userId")
  @RequirePermissions("missions.manage")
  removeMember(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.missionsService.removeMember(id, userId, userActor(user));
  }

  @Get("missions/:id/tasks")
  @RequirePermissions("missions.read")
  tasks(@Param("id", ParseUUIDPipe) id: string) {
    return this.tasksService.list(id);
  }

  @Post("missions/:id/tasks")
  @RequirePermissions("missions.manage")
  createTask(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.create(id, dto, user);
  }

  // `missions.read` suffit pour entrer : le service n'autorise ensuite que
  // le pilote (missions.manage) ou le responsable de la tâche, pour son
  // seul statut.
  @Patch("tasks/:taskId")
  @RequirePermissions("missions.read")
  updateTask(
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.update(taskId, dto, user);
  }

  @Delete("tasks/:taskId")
  @HttpCode(204)
  @RequirePermissions("missions.manage")
  removeTask(@Param("taskId", ParseUUIDPipe) taskId: string) {
    return this.tasksService.remove(taskId);
  }

  @Get("tasks/:taskId/comments")
  @RequirePermissions("missions.read")
  comments(@Param("taskId", ParseUUIDPipe) taskId: string) {
    return this.tasksService.listComments(taskId);
  }

  @Post("tasks/:taskId/comments")
  @RequirePermissions("missions.read")
  addComment(
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() dto: CreateTaskCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.addComment(taskId, dto, user);
  }
}
