// Contenu complet d'un devis à un instant donné : ce que le PDF affiche,
// et ce que `quote_versions.snapshot` fige à chaque envoi (une version
// envoyée se régénère à l'identique, même si le client, l'entreprise ou
// le devis changent ensuite).
export interface QuoteDocument {
  reference: string;
  version: number;
  title: string;
  notes: string | null;
  currency: string;
  issuedOn: string;
  validUntil: string | null;
  discountPercent: number;
  taxRate: number;
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
  sentTo: string | null;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    total: number;
  }[];
  client: {
    companyName: string;
    contactName: string | null;
    city: string | null;
    country: string | null;
  };
  company: {
    legalName: string;
    address: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
    vatNumber: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    iban: string | null;
    quoteTerms: string | null;
  };
}

// Les polices standard d'un PDF n'ont pas l'espace fine insécable que
// produit Intl en français : séparateur de milliers posé à la main.
export function formatAmount(value: number): string {
  const [integer, decimals] = Math.abs(value).toFixed(2).split(".");
  const grouped = (integer as string).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${value < 0 ? "-" : ""}${grouped}.${decimals}`;
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

export function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0$/, "")} %`;
}
