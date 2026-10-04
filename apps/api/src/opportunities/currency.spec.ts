import { currencyForCountry } from "./currency";

describe("currencyForCountry", () => {
  it("reconnaît la Suisse et le Canada quelle que soit la saisie", () => {
    expect(currencyForCountry("CH")).toBe("CHF");
    expect(currencyForCountry(" Suisse ")).toBe("CHF");
    expect(currencyForCountry("switzerland")).toBe("CHF");
    expect(currencyForCountry("Canada")).toBe("CAD");
  });

  it("retombe sur l'euro pour tout autre pays ou sans pays", () => {
    expect(currencyForCountry("France")).toBe("EUR");
    expect(currencyForCountry("Sénégal")).toBe("EUR");
    expect(currencyForCountry(null)).toBe("EUR");
    expect(currencyForCountry("")).toBe("EUR");
  });
});
