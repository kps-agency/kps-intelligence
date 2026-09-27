import { CLIENT_STATUS_LABELS } from "@kps/shared";
import { ClientStatus } from "@kps/types";
import type { BadgeProps } from "@kps/ui";

// Association statut -> couleur de badge : c'est une décision de rendu
// (couplée à @kps/ui), pas une constante métier — elle vit ici plutôt
// que dans packages/shared.
export const CLIENT_STATUS_VARIANT: Record<ClientStatus, BadgeProps["variant"]> = {
  [ClientStatus.PROSPECT]: "secondary",
  [ClientStatus.ACTIVE]: "success",
  [ClientStatus.INACTIVE]: "outline",
  [ClientStatus.CHURNED]: "destructive",
};

export { CLIENT_STATUS_LABELS };
