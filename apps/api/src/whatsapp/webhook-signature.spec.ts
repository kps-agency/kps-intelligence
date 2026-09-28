import { createHmac } from "node:crypto";
import { isValidMetaSignature, safeEqual } from "./webhook-signature";

describe("isValidMetaSignature", () => {
  const secret = "app-secret";
  const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
  const sign = (payload: Buffer, key = secret) =>
    `sha256=${createHmac("sha256", key).update(payload).digest("hex")}`;

  it("accepte une signature calculée sur le corps brut exact", () => {
    expect(isValidMetaSignature(body, sign(body), secret)).toBe(true);
  });

  it("rejette un corps modifié après signature", () => {
    const tampered = Buffer.from(body.toString().replace("[]", '[{"id":"x"}]'));
    expect(isValidMetaSignature(tampered, sign(body), secret)).toBe(false);
  });

  it("rejette une signature produite avec un autre secret", () => {
    expect(isValidMetaSignature(body, sign(body, "autre-secret"), secret)).toBe(false);
  });

  it("rejette un en-tête absent, mal préfixé ou tronqué", () => {
    expect(isValidMetaSignature(body, undefined, secret)).toBe(false);
    expect(isValidMetaSignature(body, sign(body).replace("sha256=", "sha1="), secret)).toBe(false);
    expect(isValidMetaSignature(body, sign(body).slice(0, 20), secret)).toBe(false);
  });

  it("rejette tout quand le secret n'est pas configuré (fail closed)", () => {
    expect(isValidMetaSignature(body, sign(body, ""), "")).toBe(false);
  });
});

describe("safeEqual", () => {
  it("compare des chaînes sans échouer sur des longueurs différentes", () => {
    expect(safeEqual("token", "token")).toBe(true);
    expect(safeEqual("token", "tokem")).toBe(false);
    expect(safeEqual("token", "token-plus-long")).toBe(false);
  });
});
