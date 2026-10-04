"use client";

import { OPPORTUNITY_STATUS_LABELS, REQUEST_STATUS_LABELS } from "@kps/shared";
import type {
  EventActorType,
  OpportunityStatus,
  RequestStatus,
  TimelineEventResponse,
} from "@kps/types";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@kps/ui";
import { Bot, History, Server, User, Zap, type LucideIcon } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";

const dateTimeFormatter = new Intl.DateTimeFormat("fr-CH", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium" });

// Les quatre origines d'un événement exigées par la section 43.
const ACTORS: Record<EventActorType, { label: string; icon: LucideIcon; className: string }> = {
  AI: { label: "IA", icon: Bot, className: "bg-primary/10 text-primary" },
  USER: { label: "Utilisateur", icon: User, className: "bg-secondary text-secondary-foreground" },
  SYSTEM: { label: "Système", icon: Server, className: "bg-muted text-muted-foreground" },
  AUTOMATION: { label: "Automatisation", icon: Zap, className: "bg-warning/10 text-warning" },
};

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "saisie manuelle",
  EMAIL: "email",
  WHATSAPP: "WhatsApp",
  WEBSITE: "site web",
  API: "API",
};

const CHANNEL_LABELS: Record<string, string> = { EMAIL: "par email", WHATSAPP: "par WhatsApp" };

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function statusLabel(value: unknown): string {
  return REQUEST_STATUS_LABELS[value as RequestStatus] ?? text(value);
}

function stageLabel(value: unknown): string {
  return OPPORTUNITY_STATUS_LABELS[value as OpportunityStatus] ?? text(value);
}

function notifiedNames(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((r: { name?: unknown }) => (typeof r?.name === "string" ? r.name : ""))
    .filter(Boolean)
    .join(", ");
}

function describe(event: TimelineEventResponse): string {
  const p = event.payload;
  switch (event.type) {
    case "REQUEST_RECEIVED":
      return `Demande reçue (${SOURCE_LABELS[text(p.source)] ?? text(p.source)})`;
    case "REQUEST_ANALYSIS_STARTED":
      return "Analyse IA démarrée";
    case "REQUEST_ANALYSIS_COMPLETED":
      return typeof p.confidence === "number"
        ? `Analyse IA terminée (confiance ${Math.round(p.confidence * 100)} %)`
        : "Analyse IA terminée";
    case "AI_ANALYSIS_FAILED":
      return "Échec de l'analyse IA — traitement manuel requis";
    case "SERVICE_DETECTED":
      return `Service identifié : ${text(p.serviceName)}`;
    case "QUALIFICATION_REQUIRED":
      return `Qualification requise (${text(p.serviceName)})`;
    case "QUALIFICATION_LINK_CREATED":
      return p.regenerated ? "Lien de qualification régénéré" : "Lien de qualification créé";
    case "QUALIFICATION_LINK_SENT":
      return CHANNEL_LABELS[text(p.channel)]
        ? `Lien de qualification envoyé ${CHANNEL_LABELS[text(p.channel)]}`
        : "Lien de qualification marqué comme envoyé";
    case "QUALIFICATION_LINK_OPENED":
      return "Formulaire ouvert par le prospect";
    case "FORM_STARTED":
      return "Formulaire commencé";
    case "FORM_PROGRESS_UPDATED":
      return `Formulaire complété à ${String(p.progressPercent)} %`;
    case "FORM_COMPLETED":
      return "Qualification terminée";
    case "QUALIFICATION_LINK_EXTENDED":
      return p.expiresAt
        ? `Lien prolongé jusqu'au ${dateFormatter.format(new Date(text(p.expiresAt)))}`
        : "Lien prolongé";
    case "QUALIFICATION_LINK_EXPIRED":
      return "Lien de qualification expiré";
    case "QUALIFICATION_LINK_REVOKED":
      return "Lien de qualification révoqué";
    case "CONVERSATION_MESSAGE_RECEIVED":
      return `Nouveau message du prospect ${CHANNEL_LABELS[text(p.channel)] ?? ""}`.trim();
    case "REQUEST_QUALIFIED":
      return "Demande qualifiée";
    case "REQUEST_UNQUALIFIED":
      return "Demande non qualifiée";
    case "REQUEST_CLOSED":
      return "Demande clôturée";
    case "REQUEST_STATUS_CHANGED":
      return `Statut : ${statusLabel(p.from)} → ${statusLabel(p.to)}`;
    case "QUALIFICATION_ANALYSIS_STARTED":
      return "Analyse des réponses démarrée";
    case "QUALIFICATION_ANALYSIS_COMPLETED":
      return p.needsReview
        ? "Réponses analysées — validation humaine requise"
        : `Réponses analysées (confiance ${Math.round(Number(p.confidence) * 100)} %)`;
    case "MATCHING_STARTED":
      return "Matching équipe démarré";
    case "MATCHING_COMPLETED":
      return Array.isArray(p.top) && p.top.length > 0
        ? `Matching terminé : ${(p.top as { name?: string; score?: number }[])
            .map((c) => `${c.name ?? ""} ${c.score ?? 0} %`)
            .join(", ")}`
        : "Matching terminé : aucun profil disponible";
    case "TEAM_MEMBER_ASSIGNED":
      return `${text(p.userName)} affecté(e) à la demande`;
    case "TEAM_MEMBER_UNASSIGNED":
      return `${text(p.userName)} retiré(e) de la demande`;
    case "QUALIFICATION_REMINDER_SENT":
      return `Relance envoyée ${CHANNEL_LABELS[text(p.channel)] ?? ""}`.trim();
    case "OPPORTUNITY_CREATED":
      return `Opportunité créée (${stageLabel(p.status)})`;
    case "OPPORTUNITY_STAGE_CHANGED":
      return `Opportunité : ${stageLabel(p.from)} → ${stageLabel(p.to)}`;
    case "OPPORTUNITY_WON":
      return "Opportunité gagnée";
    case "OPPORTUNITY_LOST":
      return text(p.lostReason) ? `Opportunité perdue : ${text(p.lostReason)}` : "Opportunité perdue";
    case "REQUEST_ASSIGNED":
      return `Demande assignée à ${text(p.assignedUserName) || "un utilisateur"}`;
    case "TEAM_NOTIFIED":
      return `Notifié (${text(p.label).toLowerCase()}) : ${notifiedNames(p.recipients)}`;
    default:
      return event.type;
  }
}

// Historique d'une demande ou d'une opportunité (section 43) : le même
// rendu, quelle que soit la source des événements.
export function TimelineCard({ timeline }: { timeline: UseQueryResult<TimelineEventResponse[]> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2 text-base">
          <History aria-hidden="true" className="size-4" />
          Historique
        </CardTitle>
      </CardHeader>
      <CardContent>
        {timeline.isPending && (
          <div role="status" aria-label="Chargement de l'historique" className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}

        {timeline.isError && (
          <p role="alert" className="text-sm text-destructive">
            {"Impossible de charger l'historique."}
          </p>
        )}

        {timeline.data && timeline.data.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun événement enregistré.</p>
        )}

        {timeline.data && timeline.data.length > 0 && (
          <ol className="relative flex flex-col gap-4 border-l pl-6">
            {timeline.data.map((event) => {
              const actor = ACTORS[event.actorType];
              const Icon = actor.icon;
              return (
                <li key={event.id} className="relative">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[2.3rem] flex size-7 items-center justify-center rounded-full ring-4 ring-background ${actor.className}`}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <p className="text-sm font-medium">{describe(event)}</p>
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={event.createdAt}>
                      {dateTimeFormatter.format(new Date(event.createdAt))}
                    </time>
                    {" · "}
                    {event.actorName ?? actor.label}
                    {event.actorName && <span className="sr-only"> ({actor.label})</span>}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
