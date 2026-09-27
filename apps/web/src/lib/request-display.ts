import { PRIORITY_LABELS, REQUEST_STATUS_LABELS } from "@kps/shared";
import { PriorityLevel, RequestStatus } from "@kps/types";
import type { BadgeProps } from "@kps/ui";

// Association statut/priorité -> couleur de badge : décision de rendu
// (couplée à @kps/ui), pas une constante métier — vit ici plutôt que
// dans packages/shared. Regroupement sémantique plutôt qu'une couleur
// par statut (20 couleurs distinctes seraient illisibles).
export const REQUEST_STATUS_VARIANT: Record<RequestStatus, BadgeProps["variant"]> = {
  [RequestStatus.NEW]: "secondary",
  [RequestStatus.RECEIVED]: "secondary",
  [RequestStatus.AI_ANALYZING]: "secondary",
  [RequestStatus.ANALYZED]: "secondary",
  [RequestStatus.FORM_PENDING]: "secondary",
  [RequestStatus.FORM_SENT]: "secondary",
  [RequestStatus.WAITING_CLIENT]: "secondary",
  [RequestStatus.RESPONSE_RECEIVED]: "secondary",
  [RequestStatus.QUALIFYING]: "secondary",
  [RequestStatus.QUALIFIED]: "success",
  [RequestStatus.UNQUALIFIED]: "destructive",
  [RequestStatus.MATCHING]: "secondary",
  [RequestStatus.ASSIGNED]: "success",
  [RequestStatus.QUOTE_PENDING]: "warning",
  [RequestStatus.QUOTE_SENT]: "warning",
  [RequestStatus.NEGOTIATION]: "warning",
  [RequestStatus.WON]: "success",
  [RequestStatus.LOST]: "destructive",
  [RequestStatus.CONVERTED_TO_MISSION]: "success",
  [RequestStatus.CLOSED]: "outline",
};

export const PRIORITY_VARIANT: Record<PriorityLevel, BadgeProps["variant"]> = {
  [PriorityLevel.LOW]: "outline",
  [PriorityLevel.MEDIUM]: "secondary",
  [PriorityLevel.HIGH]: "warning",
  [PriorityLevel.URGENT]: "destructive",
};

export { PRIORITY_LABELS, REQUEST_STATUS_LABELS };
