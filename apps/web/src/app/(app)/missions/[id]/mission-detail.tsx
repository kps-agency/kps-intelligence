"use client";

import { PRIORITY_LABELS } from "@kps/shared";
import { MissionStatus, PriorityLevel, type MissionResponse } from "@kps/types";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Skeleton,
  Textarea,
} from "@kps/ui";
import { Pencil, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TimelineCard } from "@/components/timeline-card";
import { ApiError } from "@/lib/api-client";
import { MISSION_STATUS_LABELS, MISSION_STATUS_VARIANT } from "@/lib/mission-display";
import { formatMoney } from "@/lib/opportunity-display";
import {
  useAddMissionMember,
  useChangeMissionStatus,
  useMission,
  useMissionManagers,
  useMissionTimeline,
  useRemoveMissionMember,
  useUpdateMission,
} from "@/lib/queries/missions";
import { useTeam } from "@/lib/queries/team";
import { MissionTasksCard } from "./mission-tasks-card";

const dateFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium" });
const dateTimeFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium", timeStyle: "short" });
const NONE = "__none__";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <div className="break-words font-medium">{children}</div>
    </div>
  );
}

function StatusCard({ mission, canManage }: { mission: MissionResponse; canManage: boolean }) {
  const changeStatus = useChangeMissionStatus(mission.id);
  const [blocking, setBlocking] = useState(false);
  const [reason, setReason] = useState("");
  const error = changeStatus.error instanceof ApiError ? changeStatus.error : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Statut</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div role="group" aria-label="Statut de la mission" className="flex flex-wrap gap-2">
          {Object.values(MissionStatus).map((status) => {
            const current = status === mission.status;
            return (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={current ? "default" : "outline"}
                aria-pressed={current}
                disabled={!canManage || changeStatus.isPending}
                onClick={() => {
                  if (current) return;
                  if (status === MissionStatus.BLOCKED) {
                    setReason("");
                    setBlocking(true);
                  } else changeStatus.mutate({ status });
                }}
              >
                {MISSION_STATUS_LABELS[status]}
              </Button>
            );
          })}
        </div>
        {mission.blockedReason && <p className="text-destructive">Motif du blocage : {mission.blockedReason}</p>}
        {mission.completedAt && (
          <p className="text-muted-foreground">
            Terminée le {dateTimeFormatter.format(new Date(mission.completedAt))}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">
            {error.message}
          </p>
        )}
      </CardContent>
      <Dialog open={blocking} onOpenChange={(next) => !next && setBlocking(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mission bloquée</DialogTitle>
            <DialogDescription>
              Le chef de projet et la direction seront prévenus.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setBlocking(false);
              changeStatus.mutate({ status: MissionStatus.BLOCKED, reason: reason.trim() || null });
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="blocked-reason">Motif (facultatif)</Label>
              <Textarea
                id="blocked-reason"
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBlocking(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="destructive">
                Signaler le blocage
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function EditForm({ mission, onDone }: { mission: MissionResponse; onDone: () => void }) {
  const update = useUpdateMission(mission.id);
  const managers = useMissionManagers();
  const [values, setValues] = useState({
    title: mission.title,
    description: mission.description ?? "",
    projectManagerId: mission.projectManagerId ?? NONE,
    startDate: mission.startDate ?? "",
    endDate: mission.endDate ?? "",
    priority: mission.priority ?? PriorityLevel.MEDIUM,
    budget: mission.budget === null ? "" : String(mission.budget),
  });
  const set = (field: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((previous) => ({ ...previous, [field]: event.target.value }));
  const error = update.error instanceof ApiError ? update.error : null;

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate(
          {
            title: values.title.trim(),
            description: values.description.trim() || null,
            projectManagerId: values.projectManagerId === NONE ? null : values.projectManagerId,
            startDate: values.startDate || null,
            endDate: values.endDate || null,
            priority: values.priority,
            budget: values.budget.trim() === "" ? null : Math.round(Number(values.budget) * 100) / 100,
          },
          { onSuccess: onDone },
        );
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="mission-title">Titre</Label>
        <Input id="mission-title" required maxLength={200} value={values.title} onChange={set("title")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="mission-pm">Chef de projet</Label>
          <Select id="mission-pm" value={values.projectManagerId} onChange={set("projectManagerId")}>
            <option value={NONE}>À désigner</option>
            {managers.data?.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.fullName}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="mission-priority">Priorité</Label>
          <Select id="mission-priority" value={values.priority} onChange={set("priority")}>
            {Object.values(PriorityLevel).map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="mission-start">Début</Label>
          <Input id="mission-start" type="date" value={values.startDate} onChange={set("startDate")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="mission-end">Fin prévue</Label>
          <Input id="mission-end" type="date" value={values.endDate} onChange={set("endDate")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="mission-budget">Budget{mission.currency ? ` (${mission.currency})` : ""}</Label>
          <Input
            id="mission-budget"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={values.budget}
            onChange={set("budget")}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mission-description">Description</Label>
        <Textarea id="mission-description" rows={4} value={values.description} onChange={set("description")} />
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" disabled={update.isPending || values.title.trim() === ""}>
          {update.isPending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}

function InfoCard({ mission, canManage }: { mission: MissionResponse; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <CardTitle as="h2">Informations</CardTitle>
        {canManage && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" />
            Modifier
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <EditForm mission={mission} onDone={() => setEditing(false)} />
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Client">
                {mission.clientId ? (
                  <Link href={`/clients/${mission.clientId}`} className="text-primary underline-offset-4 hover:underline">
                    {mission.clientCompanyName}
                  </Link>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Chef de projet">{mission.projectManagerName ?? "À désigner"}</Field>
              <Field label="Service">{mission.serviceName ?? "—"}</Field>
              <Field label="Début">{mission.startDate ? dateFormatter.format(new Date(mission.startDate)) : "—"}</Field>
              <Field label="Fin prévue">{mission.endDate ? dateFormatter.format(new Date(mission.endDate)) : "—"}</Field>
              <Field label="Budget">
                {mission.budget === null ? "—" : `${formatMoney(mission.budget, mission.currency)} HT`}
              </Field>
              <Field label="Priorité">{mission.priority ? PRIORITY_LABELS[mission.priority] : "—"}</Field>
              <Field label="Origine">
                {mission.opportunityId ? (
                  <>
                    <Link
                      href={`/opportunities/${mission.opportunityId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Opportunité
                    </Link>
                    {mission.requestId && (
                      <>
                        {" · "}
                        <Link
                          href={`/requests/${mission.requestId}`}
                          className="font-mono text-primary underline-offset-4 hover:underline"
                        >
                          {mission.requestReference}
                        </Link>
                      </>
                    )}
                  </>
                ) : (
                  "Saisie manuelle"
                )}
              </Field>
            </div>
            {mission.description && (
              <div>
                <p className="text-muted-foreground">Description</p>
                <p className="whitespace-pre-wrap">{mission.description}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TeamCard({ mission, canManage }: { mission: MissionResponse; canManage: boolean }) {
  const team = useTeam();
  const add = useAddMissionMember(mission.id);
  const remove = useRemoveMissionMember(mission.id);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("");
  const candidates = (team.data ?? []).filter((member) => !mission.members.some((m) => m.userId === member.id));
  const error = [add.error, remove.error].find((e) => e instanceof ApiError) as ApiError | undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Équipe</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {mission.members.length === 0 ? (
          <p className="text-muted-foreground">Aucun collaborateur sur cette mission pour l&apos;instant.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {mission.members.map((member) => (
              <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link href={`/team/${member.userId}`} className="font-medium text-primary underline-offset-4 hover:underline">
                    {member.fullName}
                  </Link>
                  {member.roleOnMission && <span className="text-muted-foreground"> — {member.roleOnMission}</span>}
                </span>
                {canManage && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(member.userId)}
                  >
                    <UserMinus aria-hidden="true" />
                    Retirer <span className="sr-only">{member.fullName}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">
            {error.message}
          </p>
        )}
        {canManage && (
          <form
            aria-label="Ajouter un collaborateur"
            className="grid gap-3 rounded-md border p-3 sm:grid-cols-12 sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              add.mutate(
                { userId, roleOnMission: role.trim() || null },
                {
                  onSuccess: () => {
                    setUserId("");
                    setRole("");
                  },
                },
              );
            }}
          >
            <div className="grid gap-1.5 sm:col-span-5">
              <Label htmlFor="member-user">Collaborateur</Label>
              <Select id="member-user" value={userId} onChange={(event) => setUserId(event.target.value)}>
                <option value="">Choisir...</option>
                {candidates.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5 sm:col-span-5">
              <Label htmlFor="member-role">Rôle sur la mission (facultatif)</Label>
              <Input
                id="member-role"
                maxLength={100}
                placeholder="Développeur, designer..."
                value={role}
                onChange={(event) => setRole(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={add.isPending || userId === ""} className="sm:col-span-2">
              <UserPlus aria-hidden="true" />
              Ajouter
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function MissionDetail({ missionId, canManage }: { missionId: string; canManage: boolean }) {
  const mission = useMission(missionId);
  const timeline = useMissionTimeline(missionId);

  if (mission.isPending) {
    return (
      <div role="status" aria-label="Chargement de la mission" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (mission.isError) {
    const notFound = mission.error instanceof ApiError && mission.error.statusCode === 404;
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-2 pt-6 text-sm">
          <p role="alert" className="text-destructive">
            {notFound ? "Cette mission n'existe pas." : `Erreur : ${mission.error.message}`}
          </p>
          <Link href="/missions" className="text-primary underline-offset-4 hover:underline">
            Retour à la liste des missions
          </Link>
        </CardContent>
      </Card>
    );
  }

  const data = mission.data;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/missions" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Missions
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="break-words text-2xl font-semibold tracking-tight">{data.title}</h1>
          <Badge variant={MISSION_STATUS_VARIANT[data.status]}>{MISSION_STATUS_LABELS[data.status]}</Badge>
        </div>
        {data.clientCompanyName && <p className="text-muted-foreground">{data.clientCompanyName}</p>}
      </div>

      <StatusCard mission={data} canManage={canManage} />
      <InfoCard mission={data} canManage={canManage} />
      <TeamCard mission={data} canManage={canManage} />
      <MissionTasksCard mission={data} canManage={canManage} />
      <TimelineCard timeline={timeline} />
    </div>
  );
}
