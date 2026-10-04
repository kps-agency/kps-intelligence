import type { BadgeProps } from "@kps/ui";
import type { WorkflowConditionOperator, WorkflowRunStatus } from "@kps/types";

// Libellés d'affichage des workflows (décisions de rendu, pas des
// constantes métier). Le vocabulaire (champs, actions) vient de l'API.

export const EVENT_LABELS: Record<string, string> = {
  REQUEST_RECEIVED: "Demande reçue",
  SERVICE_DETECTED: "Service identifié par l'IA",
  QUALIFICATION_REQUIRED: "Qualification requise",
  QUALIFICATION_LINK_SENT: "Formulaire envoyé",
  QUALIFICATION_LINK_OPENED: "Formulaire ouvert",
  FORM_STARTED: "Formulaire commencé",
  FORM_COMPLETED: "Formulaire complété",
  QUALIFICATION_LINK_REVOKED: "Lien révoqué",
  QUALIFICATION_LINK_EXPIRED: "Lien expiré",
  REQUEST_QUALIFIED: "Demande qualifiée",
  MATCHING_COMPLETED: "Matching terminé",
  OPPORTUNITY_CREATED: "Opportunité créée",
  OPPORTUNITY_STAGE_CHANGED: "Opportunité : changement d'étape",
  OPPORTUNITY_WON: "Opportunité gagnée",
  OPPORTUNITY_LOST: "Opportunité perdue",
};

export const OPERATOR_LABELS: Record<WorkflowConditionOperator, string> = {
  eq: "=",
  neq: "≠",
  in: "parmi",
  notIn: "hors de",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  exists: "renseigné",
  notExists: "non renseigné",
};

export const VALUE_LABELS: Record<string, string> = {
  SENT: "Envoyé",
  CREATED: "Créé",
  OPENED: "Ouvert",
  IN_PROGRESS: "En cours",
  COMPLETED: "Complété",
  EMAIL: "email",
  WHATSAPP: "WhatsApp",
  MANUAL: "saisie manuelle",
  QUALIFIED: "Qualifiée",
  MATCHING: "Recherche d'équipe",
  ASSIGNED: "Assignée",
};

export const RUN_STATUS: Record<WorkflowRunStatus, { label: string; variant: BadgeProps["variant"] }> = {
  PENDING: { label: "En file", variant: "secondary" },
  RUNNING: { label: "En cours", variant: "secondary" },
  WAITING: { label: "En attente", variant: "warning" },
  COMPLETED: { label: "Terminée", variant: "success" },
  FAILED: { label: "Échec", variant: "destructive" },
  CANCELLED: { label: "Annulée", variant: "outline" },
};

export function formatDelay(minutes: number): string {
  if (minutes === 0) return "Immédiatement";
  if (minutes < 1) return `Après ${Math.round(minutes * 60)} s`;
  if (minutes % 1440 === 0) return `Après ${minutes / 1440} j`;
  if (minutes % 60 === 0) return `Après ${minutes / 60} h`;
  return `Après ${minutes} min`;
}

export function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (typeof value === "number") return value <= 1 && value > 0 ? `${Math.round(value * 100)} %` : String(value);
  if (typeof value === "string") return VALUE_LABELS[value] ?? value;
  return "";
}
