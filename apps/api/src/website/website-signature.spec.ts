import { isValidWebsiteSignature, parseSiteSecrets, signWebsitePayload } from "./website-signature";

describe("isValidWebsiteSignature", () => {
  const secret = "site-secret";
  const now = 1_790_000_000;
  const timestamp = String(now);
  const body = Buffer.from('{"externalId":"42","formType":"quote"}');

  const check = (overrides: Partial<Parameters<typeof isValidWebsiteSignature>[0]> = {}) =>
    isValidWebsiteSignature({
      rawBody: body,
      signatureHeader: signWebsitePayload(body, timestamp, secret),
      timestampHeader: timestamp,
      secret,
      nowSeconds: now,
      ...overrides,
    });

  it("accepte une signature calculée sur le timestamp et le corps brut exact", () => {
    expect(check()).toBe(true);
  });

  it("rejette un corps modifié après signature", () => {
    expect(check({ rawBody: Buffer.from('{"externalId":"43","formType":"quote"}') })).toBe(false);
  });

  it("rejette un timestamp modifié après signature", () => {
    expect(check({ timestampHeader: String(now - 10) })).toBe(false);
  });

  it("rejette une signature produite avec un autre secret", () => {
    expect(check({ signatureHeader: signWebsitePayload(body, timestamp, "autre-secret") })).toBe(false);
  });

  it("rejette une requête trop ancienne ou trop dans le futur (rejeu)", () => {
    expect(check({ nowSeconds: now + 301 })).toBe(false);
    expect(check({ nowSeconds: now - 301 })).toBe(false);
    expect(check({ nowSeconds: now + 299 })).toBe(true);
  });

  it("rejette des en-têtes absents, mal préfixés ou malformés", () => {
    expect(check({ signatureHeader: undefined })).toBe(false);
    expect(check({ timestampHeader: undefined })).toBe(false);
    expect(check({ timestampHeader: "abc" })).toBe(false);
    expect(
      check({ signatureHeader: signWebsitePayload(body, timestamp, secret).replace("sha256=", "sha1=") }),
    ).toBe(false);
  });

  it("rejette tout quand le secret n'est pas configuré (fail closed)", () => {
    expect(check({ secret: "", signatureHeader: signWebsitePayload(body, timestamp, "") })).toBe(false);
  });
});

describe("parseSiteSecrets", () => {
  it("lit un secret par site, en ignorant les entrées invalides", () => {
    const secrets = parseSiteSecrets(" Akoraweb:abc:def , autre:xyz, :orphelin, vide:, sans-separateur");
    expect([...secrets.entries()]).toEqual([
      ["akoraweb", "abc:def"],
      ["autre", "xyz"],
    ]);
  });

  it("renvoie une table vide sans configuration", () => {
    expect(parseSiteSecrets(undefined).size).toBe(0);
  });
});
