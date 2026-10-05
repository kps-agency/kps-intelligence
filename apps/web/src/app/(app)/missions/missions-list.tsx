"use client";

import { MissionStatus } from "@kps/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kps/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCurrentUser } from "@/components/current-user-context";
import { PaginationControls } from "@/components/pagination-controls";
import { ApiError } from "@/lib/api-client";
import { MISSION_STATUS_LABELS, MISSION_STATUS_VARIANT } from "@/lib/mission-display";
import { useClients } from "@/lib/queries/clients";
import { useCreateMission, useMissions } from "@/lib/queries/missions";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const LIMIT = 20;
const dateFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium" });

function CreateMissionDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const clients = useClients({ page: 1, limit: 100 });
  const create = useCreateMission();
  const error = create.error instanceof ApiError ? create.error : null;

  function handleOpenChange(next: boolean) {
    if (!next) {
      setTitle("");
      setClientId("");
      create.reset();
    }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="shrink-0">
          <Plus aria-hidden="true" />
          Nouvelle mission
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle mission</DialogTitle>
          <DialogDescription>
            Saisie manuelle — une opportunité gagnée crée la sienne automatiquement.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate(
              { title: title.trim(), clientId: clientId || null },
              { onSuccess: (mission) => router.push(`/missions/${mission.id}`) },
            );
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="new-mission-title">Titre</Label>
            <Input
              id="new-mission-title"
              required
              maxLength={200}
              autoComplete="off"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-mission-client">Client</Label>
            <Select id="new-mission-client" value={clientId} onChange={(event) => setClientId(event.target.value)}>
              <option value="">Aucun</option>
              {clients.data?.data.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </Select>
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={create.isPending || title.trim() === ""}>
              {create.isPending ? "Création..." : "Créer la mission"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MissionsList({ canManage }: { canManage: boolean }) {
  const { id: currentUserId } = useCurrentUser();
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<MissionStatus | "">("");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput);

  const missions = useMissions({
    page,
    limit: LIMIT,
    search: search || undefined,
    status: status || undefined,
    memberId: mine ? currentUserId : undefined,
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="search"
              placeholder="Rechercher une mission..."
              aria-label="Rechercher une mission"
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setPage(1);
              }}
              className="sm:max-w-xs"
            />
            <Select
              aria-label="Filtrer par statut"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as MissionStatus | "");
                setPage(1);
              }}
              className="sm:w-44"
            >
              <option value="">Tous les statuts</option>
              {Object.values(MissionStatus).map((value) => (
                <option key={value} value={value}>
                  {MISSION_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={mine}
                onChange={(event) => {
                  setMine(event.target.checked);
                  setPage(1);
                }}
              />
              Mes missions
            </label>
          </div>
          {canManage && <CreateMissionDialog />}
        </div>

        {missions.isPending && (
          <div role="status" aria-label="Chargement des missions" className="flex flex-col gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        )}
        {missions.isError && (
          <p role="alert" className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            Impossible de charger les missions : {missions.error.message}
          </p>
        )}
        {missions.isSuccess && missions.data.data.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {search || status || mine ? "Aucune mission ne correspond à ces critères." : "Aucune mission pour l'instant."}
          </p>
        )}

        {missions.isSuccess && missions.data.data.length > 0 && (
          <>
            <Table aria-label="Liste des missions">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Mission</TableHead>
                  <TableHead className="hidden sm:table-cell">Client</TableHead>
                  <TableHead className="hidden md:table-cell">Chef de projet</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Tâches</TableHead>
                  <TableHead className="hidden lg:table-cell">Fin prévue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missions.data.data.map((mission) => (
                  <TableRow key={mission.id}>
                    <TableCell className="max-w-64">
                      <Link
                        href={`/missions/${mission.id}`}
                        className="break-words font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {mission.title}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {mission.clientCompanyName ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {mission.projectManagerName ?? "À désigner"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={MISSION_STATUS_VARIANT[mission.status]}>
                        {MISSION_STATUS_LABELS[mission.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {mission.tasksDone}/{mission.tasksTotal}
                      <span className="sr-only"> tâche(s) terminée(s)</span>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                      {mission.endDate ? dateFormatter.format(new Date(mission.endDate)) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationControls meta={missions.data.meta} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
