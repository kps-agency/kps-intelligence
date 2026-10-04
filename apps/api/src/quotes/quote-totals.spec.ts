import { computeQuoteTotals } from "@kps/shared";
import { formatAmount, formatDate, formatPercent } from "./quote-document";

describe("computeQuoteTotals", () => {
  it("arrondit chaque ligne au centime, puis applique remise globale et taxe", () => {
    const totals = computeQuoteTotals(
      [
        { quantity: 10, unitPrice: 1200, discountPercent: 0 },
        { quantity: 1, unitPrice: 999.99, discountPercent: 10 },
        { quantity: 2.5, unitPrice: 80.4, discountPercent: 0 },
      ],
      5,
      8.1,
    );
    expect(totals).toEqual({
      lineTotals: [12000, 899.99, 201],
      subtotal: 13100.99,
      discount: 655.05,
      taxAmount: 1008.12,
      total: 13454.06,
    });
  });

  it("devis vide, remise totale et taxe nulle", () => {
    expect(computeQuoteTotals([], 10, 8.1)).toEqual({
      lineTotals: [],
      subtotal: 0,
      discount: 0,
      taxAmount: 0,
      total: 0,
    });
    expect(computeQuoteTotals([{ quantity: 3, unitPrice: 50, discountPercent: 100 }], 0, 20).total).toBe(0);
    expect(computeQuoteTotals([{ quantity: 3, unitPrice: 33.33, discountPercent: 0 }], 0, 0).total).toBe(99.99);
  });

  it("n'accumule pas d'erreur de virgule flottante (1.005 → 1.01)", () => {
    expect(computeQuoteTotals([{ quantity: 1, unitPrice: 1.005, discountPercent: 0 }], 0, 0).subtotal).toBe(1.01);
    expect(computeQuoteTotals([{ quantity: 3, unitPrice: 0.1, discountPercent: 0 }], 0, 0).subtotal).toBe(0.3);
  });
});

describe("mise en forme du PDF", () => {
  it("montants, dates et pourcentages", () => {
    expect(formatAmount(13454.06)).toBe("13 454.06");
    expect(formatAmount(1234567.5)).toBe("1 234 567.50");
    expect(formatAmount(-655.05)).toBe("-655.05");
    expect(formatAmount(0)).toBe("0.00");
    expect(formatDate("2026-12-05")).toBe("05.12.2026");
    expect(formatPercent(8.1)).toBe("8.1 %");
    expect(formatPercent(5)).toBe("5 %");
    expect(formatPercent(7.25)).toBe("7.25 %");
  });
});
