import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EventType, TaskStatus } from "@kps/types";
import type { Database, PriorityLevel, TaskCommentResponse, TaskResponse } from "@kps/types";
import { toDbException } from "../common/db-error";
import { userActor } from "../events/event-bus.service";
import { SupabaseService } from "../supabase/supabase.service";
import type { AuthenticatedUser } from "../users/users.types";
import type { CreateTaskCommentDto, CreateTaskDto, UpdateTaskDto } from "./dto/mission.dto";
import { MissionsService } from "./missions.service";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];
type Person = { first_name: string; last_name: string };
type TaskWithLinks = TaskRow & { assignee: Person | null; task_comments: { count: number }[] };

const TASK_SELECT =
  "*, assignee:users!tasks_assignee_id_fkey(first_name, last_name), task_comments(count)";
const MANAGE = "missions.manage";

const fullName = (person: Person | null): string | null =>
  person ? `${person.first_name} ${person.last_name}` : null;

function toResponse(row: TaskWithLinks): TaskResponse {
  return {
    id: row.id,
    missionId: row.mission_id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    priority: row.priority as PriorityLevel | null,
    assigneeId: row.assignee_id,
    assigneeName: fullName(row.assignee),
    dueDate: row.due_date,
    completedAt: row.completed_at,
    commentCount: row.task_comments[0]?.count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Tâches d'une mission (section 53). Le pilotage (création, attribution,
// échéance) relève de `missions.manage` ; le responsable d'une tâche peut
// en faire avancer le statut, et toute l'équipe de la mission peut la
// commenter.
@Injectable()
export class TasksService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly missions: MissionsService,
  ) {}

  async list(missionId: string): Promise<TaskResponse[]> {
    await this.missions.findById(missionId);
    const { data, error } = await this.supabase
      .getClient()
      .from("tasks")
      .select(TASK_SELECT)
      .eq("mission_id", missionId)
      .order("created_at", { ascending: true });
    if (error) throw toDbException(error);
    return (data as unknown as TaskWithLinks[]).map(toResponse);
  }

  async create(missionId: string, dto: CreateTaskDto, user: AuthenticatedUser): Promise<TaskResponse> {
    const mission = await this.missions.findById(missionId);
    if (dto.assigneeId) this.assertOnTeam(mission, dto.assigneeId);

    const { data, error } = await this.supabase
      .getClient()
      .from("tasks")
      .insert({
        mission_id: missionId,
        title: dto.title,
        description: dto.description ?? null,
        assignee_id: dto.assigneeId ?? null,
        due_date: dto.dueDate ?? null,
        priority: dto.priority,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw toDbException(error);

    const task = await this.findById(data.id);
    const actor = userActor(user);
    await this.missions.emit(EventType.TASK_CREATED, mission, actor, { taskId: task.id, taskTitle: task.title });
    if (task.assigneeId) {
      await this.missions.emit(EventType.TASK_ASSIGNED, mission, actor, {
        taskId: task.id,
        taskTitle: task.title,
        userId: task.assigneeId,
        userName: task.assigneeName ?? "",
        dueDate: task.dueDate,
      });
    }
    return task;
  }

  async update(taskId: string, dto: UpdateTaskDto, user: AuthenticatedUser): Promise<TaskResponse> {
    const current = await this.findById(taskId);
    const mission = await this.missions.findById(current.missionId);

    if (!user.permissions.includes(MANAGE)) {
      // Les champs absents d'un DTO instancié valent `undefined`.
      const onlyStatus = Object.entries(dto).every(([key, value]) => key === "status" || value === undefined);
      if (current.assigneeId !== user.id || !onlyStatus) {
        throw new ForbiddenException(
          "Vous ne pouvez modifier que le statut des tâches qui vous sont confiées.",
        );
      }
    }

    const fields: TaskUpdate = {};
    if (dto.title !== undefined) fields.title = dto.title;
    if (dto.description !== undefined) fields.description = dto.description;
    if (dto.dueDate !== undefined) fields.due_date = dto.dueDate;
    if (dto.priority !== undefined) fields.priority = dto.priority;
    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId !== null) this.assertOnTeam(mission, dto.assigneeId);
      fields.assignee_id = dto.assigneeId;
    }
    if (dto.status !== undefined && dto.status !== current.status) {
      fields.status = dto.status;
      fields.completed_at = dto.status === TaskStatus.DONE ? new Date().toISOString() : null;
    }
    if (Object.keys(fields).length === 0) {
      if (dto.status !== undefined) return current;
      throw new BadRequestException("Aucun champ à modifier.");
    }

    const { error } = await this.supabase.getClient().from("tasks").update(fields).eq("id", taskId);
    if (error) throw toDbException(error);

    const task = await this.findById(taskId);
    const actor = userActor(user);
    if (fields.status !== undefined) {
      await this.missions.emit(EventType.TASK_STATUS_CHANGED, mission, actor, {
        taskId,
        taskTitle: task.title,
        from: current.status,
        to: task.status,
      });
    }
    if (task.assigneeId && task.assigneeId !== current.assigneeId) {
      await this.missions.emit(EventType.TASK_ASSIGNED, mission, actor, {
        taskId,
        taskTitle: task.title,
        userId: task.assigneeId,
        userName: task.assigneeName ?? "",
        dueDate: task.dueDate,
      });
    }
    return task;
  }

  async remove(taskId: string): Promise<void> {
    const { data, error } = await this.supabase.getClient().from("tasks").delete().eq("id", taskId).select("id");
    if (error) throw toDbException(error);
    if (data.length === 0) throw new NotFoundException("Tâche introuvable.");
  }

  async listComments(taskId: string): Promise<TaskCommentResponse[]> {
    await this.findById(taskId);
    const { data, error } = await this.supabase
      .getClient()
      .from("task_comments")
      .select("id, author_id, body, created_at, users(first_name, last_name)")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (error) throw toDbException(error);
    return data.map((comment) => ({
      id: comment.id,
      authorId: comment.author_id,
      authorName: fullName(comment.users as Person | null),
      body: comment.body,
      createdAt: comment.created_at,
    }));
  }

  async addComment(taskId: string, dto: CreateTaskCommentDto, user: AuthenticatedUser): Promise<TaskCommentResponse[]> {
    const task = await this.findById(taskId);
    const mission = await this.missions.findById(task.missionId);
    const onTeam =
      mission.projectManagerId === user.id || mission.members.some((member) => member.userId === user.id);
    if (!user.permissions.includes(MANAGE) && !onTeam) {
      throw new ForbiddenException("Seule l'équipe de la mission peut commenter ses tâches.");
    }
    const { error } = await this.supabase
      .getClient()
      .from("task_comments")
      .insert({ task_id: taskId, author_id: user.id, body: dto.body });
    if (error) throw toDbException(error);
    return this.listComments(taskId);
  }

  private async findById(taskId: string): Promise<TaskResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from("tasks")
      .select(TASK_SELECT)
      .eq("id", taskId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Tâche introuvable.");
    return toResponse(data as unknown as TaskWithLinks);
  }

  // Une tâche se confie à quelqu'un de la mission : son équipe ou son
  // chef de projet.
  private assertOnTeam(
    mission: { projectManagerId: string | null; members: { userId: string }[] },
    userId: string,
  ): void {
    if (mission.projectManagerId !== userId && !mission.members.some((member) => member.userId === userId)) {
      throw new BadRequestException("Ajoutez d'abord ce collaborateur à l'équipe de la mission.");
    }
  }
}
