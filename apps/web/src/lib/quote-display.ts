import { QUOTE_STATUS_LABELS } from "@kps/shared";
import { QuoteStatus } from "@kps/types";
import type { BadgeProps } from "@kps/ui";

// Couleur de badge par statut : décision de rendu, pas une constante métier.
export const QUOTE_STATUS_VARIANT: Record<QuoteStatus, BadgeProps["variant"]> = {
  [QuoteStatus.DRAFT]: "secondary",
  [QuoteStatus.SENT]: "warning",
  [QuoteStatus.ACCEPTED]: "success",
  [QuoteStatus.REJECTED]: "destructive",
  [QuoteStatus.EXPIRED]: "outline",
};

// Montant d'un devis : toujours avec les centimes.
export function formatQuoteAmount(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("fr-CH", { style: "currency", currency }).format(value);
  } catch {
    // Code de devise inconnu de l'environnement.
    return `${new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2 }).format(value)} ${currency}`;
  }
}

export { QUOTE_STATUS_LABELS };
