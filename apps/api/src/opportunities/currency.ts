// Devise d'une opportunité, déduite du pays du client ou de la demande
// (DATABASE.md §17) : Suisse → CHF, Canada → CAD, sinon EUR. Le pays est
// une saisie libre (« CH », « Suisse », « Switzerland »...).
const COUNTRY_CURRENCIES: Record<string, string> = {
  ch: "CHF",
  che: "CHF",
  suisse: "CHF",
  switzerland: "CHF",
  schweiz: "CHF",
  svizzera: "CHF",
  ca: "CAD",
  can: "CAD",
  canada: "CAD",
};

export const DEFAULT_CURRENCY = "EUR";

export function currencyForCountry(country: string | null | undefined): string {
  if (!country) return DEFAULT_CURRENCY;
  return COUNTRY_CURRENCIES[country.trim().toLowerCase()] ?? DEFAULT_CURRENCY;
}
