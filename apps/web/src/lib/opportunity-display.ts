import { OPPORTUNITY_PIPELINE, OPPORTUNITY_STATUS_LABELS } from "@kps/shared";
import { OpportunityStatus, type OpportunityResponse } from "@kps/types";
import type { BadgeProps } from "@kps/ui";

// Couleur de badge par étape : décision de rendu (couplée à @kps/ui), pas
// une constante métier.
export const OPPORTUNITY_STATUS_VARIANT: Record<OpportunityStatus, BadgeProps["variant"]> = {
  [OpportunityStatus.NEW]: "secondary",
  [OpportunityStatus.QUALIFIED]: "secondary",
  [OpportunityStatus.PROPOSAL_REQUIRED]: "warning",
  [OpportunityStatus.PROPOSAL_SENT]: "warning",
  [OpportunityStatus.NEGOTIATION]: "warning",
  [OpportunityStatus.WON]: "success",
  [OpportunityStatus.LOST]: "destructive",
};

// Une devise saisie à la main peut ne pas être un code ISO connu de
// l'environnement : on retombe alors sur « montant CODE ».
export function formatMoney(value: number, currency: string | null): string {
  if (currency) {
    try {
      return new Intl.NumberFormat("fr-CH", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      // Code de devise inconnu : format générique ci-dessous.
    }
  }
  const amount = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 0 }).format(value);
  return currency ? `${amount} ${currency}` : amount;
}

// Le prospect d'une demande entrante n'a pas toujours de fiche client.
export function opportunityParty(opportunity: OpportunityResponse): string {
  return opportunity.clientCompanyName ?? opportunity.contactFullName ?? "Prospect sans fiche client";
}

export { OPPORTUNITY_PIPELINE, OPPORTUNITY_STATUS_LABELS };
