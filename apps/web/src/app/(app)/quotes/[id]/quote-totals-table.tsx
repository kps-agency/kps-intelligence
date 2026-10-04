import type { QuoteTotals } from "@kps/types";
import { formatQuoteAmount } from "@/lib/quote-display";

const formatPercent = (value: number) => `${new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 2 }).format(value)} %`;

export function QuoteTotalsTable({
  caption,
  currency,
  discountPercent,
  taxRate,
  totals,
}: {
  caption: string;
  currency: string;
  discountPercent: number;
  taxRate: number;
  totals: QuoteTotals;
}) {
  const rows: [string, number][] = [["Sous-total HT", totals.subtotal]];
  if (totals.discount > 0) {
    rows.push([`Remise ${formatPercent(discountPercent)}`, -totals.discount]);
    rows.push(["Total HT", totals.subtotal - totals.discount]);
  }
  rows.push([`TVA ${formatPercent(taxRate)}`, totals.taxAmount]);

  return (
    <table className="w-full self-start text-sm">
      <caption className="mb-2 text-left text-sm font-semibold">{caption}</caption>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row" className="py-1 text-left font-normal text-muted-foreground">
              {label}
            </th>
            <td className="py-1 text-right">{formatQuoteAmount(value, currency)}</td>
          </tr>
        ))}
        <tr className="border-t">
          <th scope="row" className="py-2 text-left font-semibold">
            Total TTC
          </th>
          <td className="py-2 text-right text-base font-semibold">{formatQuoteAmount(totals.total, currency)}</td>
        </tr>
      </tbody>
    </table>
  );
}
