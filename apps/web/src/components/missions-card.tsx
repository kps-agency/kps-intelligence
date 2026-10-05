"use client";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@kps/ui";
import { Briefcase } from "lucide-react";
import Link from "next/link";
import { useHasPermission } from "@/components/current-user-context";
import { ApiError } from "@/lib/api-client";
import { MISSION_STATUS_LABELS, MISSION_STATUS_VARIANT } from "@/lib/mission-display";
import { useCreateMission, useMissions } from "@/lib/queries/missions";

// Mission d'une opportunité (créée automatiquement quand elle est gagnée)
// ou missions d'un client (section 49).
export function MissionsCard({ opportunityId, clientId }: { opportunityId?: string; clientId?: string }) {
  const canRead = useHasPermission("missions.read");
  const canManage = useHasPermission("missions.manage");
  const missions = useMissions({ page: 1, limit: 50, opportunityId, clientId }, canRead, !!opportunityId);
  const create = useCreateMission();

  if (!canRead) return null;
  const error = create.error instanceof ApiError ? create.error : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <CardTitle as="h2" className="flex items-center gap-2">
          <Briefcase aria-hidden="true" className="size-4" />
          {opportunityId ? "Mission" : "Missions"}
        </CardTitle>
        {opportunityId && canManage && missions.data?.data.length === 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={create.isPending}
            onClick={() => create.mutate({ opportunityId })}
            className="shrink-0"
          >
            {create.isPending ? "Création..." : "Créer la mission"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {missions.isPending && <Skeleton className="h-5 w-2/3" />}
        {missions.isError && (
          <p role="alert" className="text-destructive">
            Impossible de charger les missions.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">
            {error.message}
          </p>
        )}
        {missions.data &&
          (missions.data.data.length === 0 ? (
            <p className="text-muted-foreground">
              {opportunityId
                ? "Aucune mission pour l'instant : elle est créée automatiquement quand l'opportunité est gagnée."
                : "Aucune mission pour ce client."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {missions.data.data.map((mission) => (
                <li key={mission.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link
                      href={`/missions/${mission.id}`}
                      className="break-words font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {mission.title}
                    </Link>
                    <Badge variant={MISSION_STATUS_VARIANT[mission.status]}>
                      {MISSION_STATUS_LABELS[mission.status]}
                    </Badge>
                  </span>
                  <span className="text-muted-foreground">
                    {mission.tasksDone}/{mission.tasksTotal} tâche(s)
                    {mission.projectManagerName && ` · ${mission.projectManagerName}`}
                  </span>
                </li>
              ))}
            </ul>
          ))}
      </CardContent>
    </Card>
  );
}
