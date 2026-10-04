"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { OpportunityStatus } from "@kps/types";
import type { OpportunityBoardColumn, OpportunityResponse } from "@kps/types";
import { Badge, Input, Select, Skeleton, cn } from "@kps/ui";
import { GripVertical } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCurrentUser } from "@/components/current-user-context";
import { ApiError } from "@/lib/api-client";
import {
  OPPORTUNITY_PIPELINE,
  OPPORTUNITY_STATUS_LABELS,
  formatMoney,
  opportunityParty,
} from "@/lib/opportunity-display";
import {
  useChangeOpportunityStage,
  useOpportunityBoard,
  useOpportunityOwners,
  type BoardParams,
} from "@/lib/queries/opportunities";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { CreateOpportunityDialog } from "./create-opportunity-dialog";
import { LostReasonDialog } from "./lost-reason-dialog";

const dateFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium" });

const stageLabel = (id: unknown) => OPPORTUNITY_STATUS_LABELS[id as OpportunityStatus] ?? "";
const cardTitle = (data: unknown) => (data as { opportunity?: OpportunityResponse })?.opportunity?.title ?? "";

// Souris : la colonne sous le pointeur. Clavier (pas de pointeur) : la
// colonne que la carte recouvre.
const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : rectIntersection(args);
};

// Au clavier, flèche gauche/droite = colonne précédente/suivante (et non
// un déplacement de quelques pixels).
const columnCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const direction = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  if (direction === 0) return undefined;
  event.preventDefault();

  const { active, over, droppableRects, collisionRect } = context;
  const current =
    (over?.id as OpportunityStatus | undefined) ??
    (active?.data.current as { opportunity?: OpportunityResponse } | undefined)?.opportunity?.status;
  const index = current ? OPPORTUNITY_PIPELINE.indexOf(current) : -1;
  const target = OPPORTUNITY_PIPELINE[index + direction];
  const rect = target ? droppableRects.get(target) : undefined;
  if (!rect || !collisionRect) return undefined;
  return { x: rect.left + (rect.width - collisionRect.width) / 2, y: rect.top + 56 };
};

const announcements: Announcements = {
  onDragStart: ({ active }) => `Carte « ${cardTitle(active.data.current)} » saisie.`,
  onDragOver: ({ over }) => (over ? `Au-dessus de la colonne ${stageLabel(over.id)}.` : undefined),
  onDragEnd: ({ active, over }) =>
    over
      ? `Carte « ${cardTitle(active.data.current)} » déposée dans la colonne ${stageLabel(over.id)}.`
      : "Déplacement annulé.",
  onDragCancel: () => "Déplacement annulé.",
};

const screenReaderInstructions = {
  draggable:
    "Pour déplacer la carte, appuyez sur Espace ou Entrée, changez de colonne avec les flèches gauche et droite, puis appuyez de nouveau sur Espace ou Entrée pour déposer. Échap annule.",
};

function CardBody({ opportunity }: { opportunity: OpportunityResponse }) {
  return (
    <>
      <p className="text-muted-foreground">{opportunityParty(opportunity)}</p>
      <p>
        <span className="font-medium">
          {opportunity.estimatedValue === null
            ? "Valeur à estimer"
            : formatMoney(opportunity.estimatedValue, opportunity.currency)}
        </span>
        {opportunity.probability !== null && (
          <span className="text-muted-foreground"> · {opportunity.probability} %</span>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        {opportunity.ownerName ?? "Sans responsable"}
        {opportunity.expectedCloseDate &&
          ` · clôture le ${dateFormatter.format(new Date(opportunity.expectedCloseDate))}`}
      </p>
    </>
  );
}

function OpportunityCard({
  opportunity,
  canManage,
  onMove,
}: {
  opportunity: OpportunityResponse;
  canManage: boolean;
  onMove: (opportunity: OpportunityResponse, status: OpportunityStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: opportunity.id,
    data: { opportunity },
    disabled: !canManage,
    attributes: { roleDescription: "carte déplaçable" },
  });

  return (
    <li
      ref={setNodeRef}
      {...(canManage ? listeners : {})}
      className={cn(
        "flex flex-col gap-1.5 rounded-md border bg-card p-3 text-sm shadow-sm",
        canManage && "cursor-grab",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-1">
        {canManage && (
          // Seule cette poignée démarre un déplacement au clavier ; à la
          // souris, toute la carte se saisit.
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            aria-label={`Déplacer « ${opportunity.title} »`}
            className="-ml-1.5 rounded p-0.5 text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
        )}
        <Link
          href={`/opportunities/${opportunity.id}`}
          className="min-w-0 break-words font-medium text-primary underline-offset-4 hover:underline"
        >
          {opportunity.title}
        </Link>
      </div>
      <CardBody opportunity={opportunity} />
      {canManage && (
        // Alternative au glisser-déposer : indispensable sur mobile et
        // plus directe au clavier.
        <Select
          aria-label={`Étape de « ${opportunity.title} »`}
          value={opportunity.status}
          onChange={(event) => onMove(opportunity, event.target.value as OpportunityStatus)}
          className="mt-1 h-8 text-xs"
        >
          {OPPORTUNITY_PIPELINE.map((status) => (
            <option key={status} value={status}>
              {OPPORTUNITY_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      )}
    </li>
  );
}

function BoardColumn({
  column,
  canManage,
  onMove,
}: {
  column: OpportunityBoardColumn;
  canManage: boolean;
  onMove: (opportunity: OpportunityResponse, status: OpportunityStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  const headingId = `column-${column.status}`;

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cn(
        "flex w-72 shrink-0 snap-start flex-col gap-2 rounded-lg border bg-muted/40 p-2",
        isOver && "ring-2 ring-ring",
      )}
    >
      <header className="px-1">
        <div className="flex items-center justify-between gap-2">
          <h2 id={headingId} className="text-sm font-semibold">
            {OPPORTUNITY_STATUS_LABELS[column.status]}
          </h2>
          <Badge variant="outline">
            {column.count}
            <span className="sr-only"> opportunité(s)</span>
          </Badge>
        </div>
        <p className="min-h-4 text-xs text-muted-foreground">
          {column.totals.map((total) => (
            <span key={total.currency} className="mr-2 inline-block">
              {formatMoney(total.value, total.currency)}
              <span title="Valeur pondérée par la probabilité">
                {" "}
                (pondéré {formatMoney(total.weightedValue, total.currency)})
              </span>
            </span>
          ))}
        </p>
      </header>

      {column.items.length === 0 ? (
        <p className="px-1 py-4 text-center text-xs text-muted-foreground">Aucune opportunité</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {column.items.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              canManage={canManage}
              onMove={onMove}
            />
          ))}
        </ul>
      )}
      {column.count > column.items.length && (
        <p className="px-1 text-xs text-muted-foreground">
          + {column.count - column.items.length} autre(s) — affinez la recherche pour les voir.
        </p>
      )}
    </section>
  );
}

// Pipeline commercial en Kanban (section 50). Déplacer une carte change
// réellement l'étape en base ; l'affichage est mis à jour tout de suite et
// revient en arrière si l'API refuse.
export function OpportunityBoard({ canManage }: { canManage: boolean }) {
  const { id: currentUserId } = useCurrentUser();
  const [search, setSearch] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [dragged, setDragged] = useState<OpportunityResponse | null>(null);
  const [pendingLost, setPendingLost] = useState<OpportunityResponse | null>(null);

  const params: BoardParams = {
    search: useDebouncedValue(search.trim()) || undefined,
    ownerUserId: ownerUserId || undefined,
  };
  const board = useOpportunityBoard(params);
  const owners = useOpportunityOwners();
  const changeStage = useChangeOpportunityStage(params);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Appui maintenu : un simple glissement du doigt doit rester un défilement.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates }),
  );

  function move(opportunity: OpportunityResponse, status: OpportunityStatus) {
    if (opportunity.status === status) return;
    if (status === OpportunityStatus.LOST) {
      setPendingLost(opportunity);
      return;
    }
    changeStage.mutate({ id: opportunity.id, status });
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragged(null);
    const opportunity = (event.active.data.current as { opportunity?: OpportunityResponse } | undefined)
      ?.opportunity;
    if (opportunity && event.over) move(opportunity, event.over.id as OpportunityStatus);
  }

  const error = changeStage.error instanceof ApiError ? changeStage.error : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="search"
          placeholder="Rechercher (titre, client, référence)..."
          aria-label="Rechercher une opportunité"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="sm:max-w-xs"
        />
        <Select
          aria-label="Filtrer par responsable"
          value={ownerUserId}
          onChange={(event) => setOwnerUserId(event.target.value)}
          className="sm:max-w-xs"
        >
          <option value="">Tous les responsables</option>
          {owners.data?.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.id === currentUserId ? `${owner.fullName} (moi)` : owner.fullName}
            </option>
          ))}
        </Select>
        {canManage && (
          <div className="sm:ml-auto">
            <CreateOpportunityDialog />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Déplacement refusé : {error.message}
        </p>
      )}

      {board.isPending && (
        <div role="status" aria-label="Chargement du pipeline" className="flex gap-3 overflow-hidden">
          <Skeleton className="h-64 w-72 shrink-0" />
          <Skeleton className="h-64 w-72 shrink-0" />
          <Skeleton className="h-64 w-72 shrink-0" />
        </div>
      )}
      {board.isError && (
        <p role="alert" className="text-sm text-destructive">
          Impossible de charger le pipeline.
        </p>
      )}

      {board.data && (
        <DndContext
          id="opportunity-board"
          sensors={sensors}
          collisionDetection={collisionDetection}
          accessibility={{ announcements, screenReaderInstructions }}
          onDragStart={(event) =>
            setDragged(
              (event.active.data.current as { opportunity?: OpportunityResponse } | undefined)?.opportunity ??
                null,
            )
          }
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragged(null)}
        >
          {/* Focalisable : une zone défilante doit rester atteignable au
              clavier même quand elle ne contient aucun lien. `relative` :
              sans lui, les textes `sr-only` (positionnés en absolu) des
              colonnes hors écran échappent au défilement de la zone et
              élargissent toute la page sur mobile. */}
          <div
            role="region"
            aria-label="Pipeline des opportunités"
            tabIndex={0}
            className="relative -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:-mx-8 md:px-8"
          >
            {board.data.columns.map((column) => (
              <BoardColumn key={column.status} column={column} canManage={canManage} onMove={move} />
            ))}
          </div>
          <DragOverlay>
            {dragged && (
              <div className="flex w-[17rem] cursor-grabbing flex-col gap-1.5 rounded-md border bg-card p-3 text-sm shadow-lg">
                <p className="break-words font-medium">{dragged.title}</p>
                <CardBody opportunity={dragged} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <LostReasonDialog
        title={pendingLost?.title ?? null}
        onCancel={() => setPendingLost(null)}
        onConfirm={(lostReason) => {
          if (pendingLost) changeStage.mutate({ id: pendingLost.id, status: OpportunityStatus.LOST, lostReason });
          setPendingLost(null);
        }}
      />
    </div>
  );
}
