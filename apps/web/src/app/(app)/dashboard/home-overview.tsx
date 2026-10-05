"use client";

import { MissionStatus, OpportunityStatus, QuoteStatus } from "@kps/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@kps/ui";
import { AlertTriangle, Briefcase, FileText, Handshake, ListChecks, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useHasPermission } from "@/components/current-user-context";
import { MISSION_STATUS_LABELS, MISSION_STATUS_VARIANT, TASK_STATUS_LABELS } from "@/lib/mission-display";
import { OPPORTUNITY_STATUS_LABELS, formatMoney } from "@/lib/opportunity-display";
import { useMissions, useMyTasks } from "@/lib/queries/missions";
import { useOpportunityBoard } from "@/lib/queries/opportunities";
import { useQuotes } from "@/lib/queries/quotes";
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_VARIANT, formatQuoteAmount } from "@/lib/quote-display";

const dateFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium" });
const today = () => new Date().toISOString().slice(0, 10);
const CLOSED: string[] = [OpportunityStatus.WON, OpportunityStatus.LOST];
const linkClass = "text-primary underline-offset-4 hover:underline";

// Indicateur cliquable : un chiffre, ce qu'il compte, et une précision.
// Le chiffre reste en couleur de texte ; une alerte est dite en toutes
// lettres (et par une icône), jamais par la seule couleur.
function Tile({
  href,
  icon: Icon,
  label,
  value,
  detail,
  alert,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: number | undefined;
  detail: ReactNode;
  alert?: string | null;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex h-full flex-col gap-1 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
          {label}
        </span>
        {value === undefined ? (
          <Skeleton className="h-9 w-16" />
        ) : (
          <span className="text-3xl font-semibold tabular-nums tracking-tight">{value}</span>
        )}
        <span className="text-xs text-muted-foreground">{detail}</span>
        {alert && (
          <span className="flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertTriangle aria-hidden="true" className="size-3.5" />
            {alert}
          </span>
        )}
      </Link>
    </li>
  );
}

function Section({ title, href, linkLabel, children }: { title: string; href: string; linkLabel: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle as="h2" className="text-base">
          {title}
        </CardTitle>
        <Link href={href} className={`shrink-0 text-sm ${linkClass}`}>
          {linkLabel}
        </Link>
      </CardHeader>
      <CardContent className="text-sm">{children}</CardContent>
    </Card>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-muted-foreground">{children}</p>;

// Accueil : l'activité commerciale et de delivery en un coup d'œil. Chaque
// bloc n'apparaît que si l'utilisateur a le droit de lire le module.
export function HomeOverview() {
  const canOpportunities = useHasPermission("opportunities.read");
  const canQuotes = useHasPermission("quotes.read");
  const canMissions = useHasPermission("missions.read");

  const board = useOpportunityBoard({}, canOpportunities);
  const sentQuotes = useQuotes({ page: 1, limit: 1, status: QuoteStatus.SENT }, canQuotes);
  const draftQuotes = useQuotes({ page: 1, limit: 1, status: QuoteStatus.DRAFT }, canQuotes);
  const recentQuotes = useQuotes({ page: 1, limit: 5 }, canQuotes);
  const activeMissions = useMissions({ page: 1, limit: 5, status: MissionStatus.IN_PROGRESS }, canMissions);
  const blockedMissions = useMissions({ page: 1, limit: 5, status: MissionStatus.BLOCKED }, canMissions);
  const plannedMissions = useMissions({ page: 1, limit: 1, status: MissionStatus.PLANNED }, canMissions);
  const myTasks = useMyTasks(canMissions);

  if (!canOpportunities && !canQuotes && !canMissions) return null;

  const open = canOpportunities ? board.data?.columns.filter((column) => !CLOSED.includes(column.status)) : undefined;
  const weighted = new Map<string, number>();
  for (const column of open ?? []) {
    for (const total of column.totals) {
      weighted.set(total.currency, (weighted.get(total.currency) ?? 0) + total.weightedValue);
    }
  }
  const lateTasks = myTasks.data?.filter((task) => task.dueDate !== null && task.dueDate < today()).length ?? 0;
  const blocked = blockedMissions.data?.meta.total ?? 0;
  const missionsShown = [...(blockedMissions.data?.data ?? []), ...(activeMissions.data?.data ?? [])].slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <ul aria-label="Indicateurs" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {canOpportunities && (
          <Tile
            href="/opportunities"
            icon={Handshake}
            label="Opportunités en cours"
            value={open?.reduce((sum, column) => sum + column.count, 0)}
            detail={
              weighted.size === 0
                ? "Aucune valeur estimée"
                : `Pondéré : ${[...weighted].map(([currency, value]) => formatMoney(value, currency)).join(" · ")}`
            }
          />
        )}
        {canQuotes && (
          <Tile
            href="/quotes"
            icon={FileText}
            label="Devis en attente de réponse"
            value={sentQuotes.data?.meta.total}
            detail={`${draftQuotes.data?.meta.total ?? 0} brouillon(s) à finaliser`}
          />
        )}
        {canMissions && (
          <Tile
            href="/missions"
            icon={Briefcase}
            label="Missions en cours"
            value={activeMissions.data?.meta.total}
            detail={`${plannedMissions.data?.meta.total ?? 0} planifiée(s)`}
            alert={blocked > 0 ? `${blocked} mission(s) bloquée(s)` : null}
          />
        )}
        {canMissions && (
          <Tile
            href="/missions"
            icon={ListChecks}
            label="Mes tâches ouvertes"
            value={myTasks.data?.length}
            detail="Confiées à vous, toutes missions confondues"
            alert={lateTasks > 0 ? `${lateTasks} en retard` : null}
          />
        )}
      </ul>

      <div className="grid gap-6 lg:grid-cols-2">
        {canMissions && (
          <Section title="Mes tâches" href="/missions" linkLabel="Toutes les missions">
            {myTasks.isPending && <Skeleton className="h-16" />}
            {myTasks.isError && <p role="alert" className="text-destructive">Impossible de charger vos tâches.</p>}
            {myTasks.data?.length === 0 && <Empty>Aucune tâche ouverte ne vous est confiée.</Empty>}
            {myTasks.data && myTasks.data.length > 0 && (
              <ul className="flex flex-col divide-y">
                {myTasks.data.slice(0, 6).map((task) => {
                  const late = task.dueDate !== null && task.dueDate < today();
                  return (
                    <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <Link href={`/missions/${task.missionId}`} className={`break-words font-medium ${linkClass}`}>
                          {task.title}
                        </Link>
                        <span className="block text-xs text-muted-foreground">{task.missionTitle}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {TASK_STATUS_LABELS[task.status]}
                        {task.dueDate && (
                          <>
                            {" · "}
                            <span className={late ? "font-semibold text-destructive" : undefined}>
                              {late ? "en retard — " : ""}
                              {dateFormatter.format(new Date(task.dueDate))}
                            </span>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}

        {canMissions && (
          <Section title="Missions en cours" href="/missions" linkLabel="Toutes les missions">
            {(activeMissions.isPending || blockedMissions.isPending) && <Skeleton className="h-16" />}
            {activeMissions.data && blockedMissions.data && missionsShown.length === 0 && (
              <Empty>Aucune mission en cours.</Empty>
            )}
            {missionsShown.length > 0 && (
              <ul className="flex flex-col divide-y">
                {missionsShown.map((mission) => (
                  <li key={mission.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <Link href={`/missions/${mission.id}`} className={`break-words font-medium ${linkClass}`}>
                        {mission.title}
                      </Link>
                      <Badge variant={MISSION_STATUS_VARIANT[mission.status]}>{MISSION_STATUS_LABELS[mission.status]}</Badge>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {mission.tasksDone}/{mission.tasksTotal} tâche(s) · {mission.projectManagerName ?? "chef de projet à désigner"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {canOpportunities && (
          <Section title="Pipeline commercial" href="/opportunities" linkLabel="Ouvrir le Kanban">
            {board.isPending && <Skeleton className="h-24" />}
            {board.isError && <p role="alert" className="text-destructive">Impossible de charger le pipeline.</p>}
            {board.data && (
              <table className="w-full">
                <caption className="sr-only">Opportunités par étape</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="pb-1 font-normal">Étape</th>
                    <th scope="col" className="pb-1 text-right font-normal">Nombre</th>
                    <th scope="col" className="pb-1 text-right font-normal">Valeur estimée</th>
                  </tr>
                </thead>
                <tbody>
                  {board.data.columns.map((column) => (
                    <tr key={column.status} className="border-t">
                      <th scope="row" className="py-1.5 text-left font-normal">
                        {OPPORTUNITY_STATUS_LABELS[column.status]}
                      </th>
                      <td className="py-1.5 text-right font-medium tabular-nums">{column.count}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {column.totals.length === 0
                          ? "—"
                          : column.totals.map((total) => formatMoney(total.value, total.currency)).join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        )}

        {canQuotes && (
          <Section title="Derniers devis" href="/quotes" linkLabel="Tous les devis">
            {recentQuotes.isPending && <Skeleton className="h-16" />}
            {recentQuotes.isError && <p role="alert" className="text-destructive">Impossible de charger les devis.</p>}
            {recentQuotes.data?.data.length === 0 && <Empty>Aucun devis pour l&apos;instant.</Empty>}
            {recentQuotes.data && recentQuotes.data.data.length > 0 && (
              <ul className="flex flex-col divide-y">
                {recentQuotes.data.data.map((quote) => (
                  <li key={quote.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <Link href={`/quotes/${quote.id}`} className={`font-mono text-xs font-medium ${linkClass}`}>
                        {quote.reference}
                      </Link>
                      <span className="break-words">{quote.clientCompanyName}</span>
                      <Badge variant={QUOTE_STATUS_VARIANT[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</Badge>
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatQuoteAmount(quote.total, quote.currency)} TTC
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}
