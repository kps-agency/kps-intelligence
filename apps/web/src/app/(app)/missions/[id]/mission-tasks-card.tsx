"use client";

import { PRIORITY_LABELS } from "@kps/shared";
import { PriorityLevel, TaskStatus, type MissionResponse, type TaskResponse } from "@kps/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Skeleton,
  Textarea,
} from "@kps/ui";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useCurrentUser } from "@/components/current-user-context";
import { ApiError } from "@/lib/api-client";
import { TASK_STATUS_LABELS, TASK_STATUS_VARIANT } from "@/lib/mission-display";
import {
  useAddTaskComment,
  useCreateTask,
  useDeleteTask,
  useMissionTasks,
  useTaskComments,
  useUpdateTask,
} from "@/lib/queries/missions";
import { PRIORITY_VARIANT } from "@/lib/request-display";

const dateFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium" });
const dateTimeFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium", timeStyle: "short" });
const today = () => new Date().toISOString().slice(0, 10);

// Personnes à qui une tâche peut être confiée : l'équipe et le chef de projet.
function assignees(mission: MissionResponse): { id: string; name: string }[] {
  const people = mission.members.map((member) => ({ id: member.userId, name: member.fullName }));
  if (mission.projectManagerId && !people.some((p) => p.id === mission.projectManagerId)) {
    people.push({ id: mission.projectManagerId, name: mission.projectManagerName ?? "" });
  }
  return people;
}

function NewTaskForm({ mission }: { mission: MissionResponse }) {
  const create = useCreateTask(mission.id);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<PriorityLevel>(PriorityLevel.MEDIUM);
  const error = create.error instanceof ApiError ? create.error : null;

  return (
    <form
      aria-label="Nouvelle tâche"
      className="grid gap-3 rounded-md border p-3 sm:grid-cols-12 sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate(
          { title: title.trim(), assigneeId: assigneeId || null, dueDate: dueDate || null, priority },
          {
            onSuccess: () => {
              setTitle("");
              setDueDate("");
            },
          },
        );
      }}
    >
      <div className="grid gap-1.5 sm:col-span-4">
        <Label htmlFor="new-task-title">Nouvelle tâche</Label>
        <Input
          id="new-task-title"
          required
          maxLength={200}
          autoComplete="off"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5 sm:col-span-3">
        <Label htmlFor="new-task-assignee">Responsable</Label>
        <Select id="new-task-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
          <option value="">Personne</option>
          {assignees(mission).map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="new-task-due">Échéance</Label>
        <Input id="new-task-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="new-task-priority">Priorité</Label>
        <Select
          id="new-task-priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value as PriorityLevel)}
        >
          {Object.values(PriorityLevel).map((value) => (
            <option key={value} value={value}>
              {PRIORITY_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" size="icon" disabled={create.isPending || title.trim() === ""} aria-label="Ajouter la tâche">
        <Plus aria-hidden="true" />
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive sm:col-span-12">
          {error.message}
        </p>
      )}
    </form>
  );
}

function CommentsDialog({
  mission,
  task,
  canComment,
  onClose,
}: {
  mission: MissionResponse;
  task: TaskResponse;
  canComment: boolean;
  onClose: () => void;
}) {
  const comments = useTaskComments(task.id);
  const add = useAddTaskComment(mission.id, task.id);
  const [body, setBody] = useState("");
  const error = add.error instanceof ApiError ? add.error : null;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription>
            {task.assigneeName ? `Confiée à ${task.assigneeName}` : "Sans responsable"}
            {task.dueDate && ` — échéance le ${dateFormatter.format(new Date(task.dueDate))}`}
          </DialogDescription>
        </DialogHeader>
        {task.description && <p className="whitespace-pre-wrap text-sm">{task.description}</p>}

        <section aria-label="Commentaires" className="flex flex-col gap-3 text-sm">
          {comments.isPending && <Skeleton className="h-10" />}
          {comments.data?.length === 0 && <p className="text-muted-foreground">Aucun commentaire.</p>}
          {comments.data && comments.data.length > 0 && (
            <ol className="flex flex-col gap-3">
              {comments.data.map((comment) => (
                <li key={comment.id} className="rounded-md bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">
                    {comment.authorName ?? "Utilisateur supprimé"} ·{" "}
                    <time dateTime={comment.createdAt}>{dateTimeFormatter.format(new Date(comment.createdAt))}</time>
                  </p>
                  <p className="whitespace-pre-wrap break-words">{comment.body}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {canComment ? (
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              add.mutate(body.trim(), { onSuccess: () => setBody("") });
            }}
          >
            <Label htmlFor="task-comment">Ajouter un commentaire</Label>
            <Textarea
              id="task-comment"
              rows={3}
              maxLength={3000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error.message}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={add.isPending || body.trim() === ""}>
                {add.isPending ? "Envoi..." : "Commenter"}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Seule l&apos;équipe de la mission peut commenter ses tâches.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Tâches d'une mission (section 53). Le pilote crée, attribue et supprime ;
// le responsable d'une tâche en fait avancer le statut.
export function MissionTasksCard({ mission, canManage }: { mission: MissionResponse; canManage: boolean }) {
  const { id: currentUserId } = useCurrentUser();
  const tasks = useMissionTasks(mission.id);
  const update = useUpdateTask(mission.id);
  const remove = useDeleteTask(mission.id);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const onTeam =
    mission.projectManagerId === currentUserId || mission.members.some((member) => member.userId === currentUserId);
  const openTask = tasks.data?.find((task) => task.id === openTaskId) ?? null;
  const error = [update.error, remove.error].find((e) => e instanceof ApiError) as ApiError | undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">
          Tâches{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {mission.tasksDone}/{mission.tasksTotal} terminée(s)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {mission.tasksTotal > 0 && (
          <div
            role="img"
            aria-label={`Avancement : ${mission.tasksDone} tâche(s) terminée(s) sur ${mission.tasksTotal}`}
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.round((mission.tasksDone / mission.tasksTotal) * 100)}%` }}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">
            {error.message}
          </p>
        )}
        {tasks.isPending && <Skeleton className="h-16" />}
        {tasks.isError && (
          <p role="alert" className="text-destructive">
            Impossible de charger les tâches.
          </p>
        )}
        {tasks.data?.length === 0 && <p className="text-muted-foreground">Aucune tâche pour l&apos;instant.</p>}
        {tasks.data && tasks.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {tasks.data.map((task) => {
              const canChangeStatus = canManage || task.assigneeId === currentUserId;
              const open = task.status !== TaskStatus.DONE && task.status !== TaskStatus.CANCELLED;
              const late = open && task.dueDate !== null && task.dueDate < today();
              return (
                <li
                  key={task.id}
                  className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="break-words font-medium">{task.title}</span>
                      {!canChangeStatus && (
                        <Badge variant={TASK_STATUS_VARIANT[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>
                      )}
                      {task.priority && task.priority !== PriorityLevel.MEDIUM && (
                        <Badge variant={PRIORITY_VARIANT[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {task.assigneeName ?? "Sans responsable"}
                      {task.dueDate && (
                        <>
                          {" · "}
                          <span className={late ? "font-semibold text-destructive" : undefined}>
                            {late ? "En retard — " : ""}échéance le {dateFormatter.format(new Date(task.dueDate))}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {canChangeStatus && (
                      <Select
                        aria-label={`Statut de « ${task.title} »`}
                        value={task.status}
                        disabled={update.isPending}
                        onChange={(event) =>
                          update.mutate({ taskId: task.id, status: event.target.value as TaskStatus })
                        }
                        className="h-9 w-32"
                      >
                        {Object.values(TaskStatus).map((value) => (
                          <option key={value} value={value}>
                            {TASK_STATUS_LABELS[value]}
                          </option>
                        ))}
                      </Select>
                    )}
                    <Button type="button" variant="ghost" size="sm" onClick={() => setOpenTaskId(task.id)}>
                      <MessageSquare aria-hidden="true" />
                      {task.commentCount}
                      <span className="sr-only"> commentaire(s) sur « {task.title} »</span>
                    </Button>
                    {canManage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={remove.isPending}
                        aria-label={`Supprimer « ${task.title} »`}
                        onClick={() => remove.mutate(task.id)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {canManage && <NewTaskForm mission={mission} />}
      </CardContent>
      {openTask && (
        <CommentsDialog
          mission={mission}
          task={openTask}
          canComment={canManage || onTeam}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </Card>
  );
}
