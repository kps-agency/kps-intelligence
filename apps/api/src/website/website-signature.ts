import { createHmac, timingSafeEqual } from "node:crypto";

// Écart toléré entre l'horloge du site et celle de l'API. Au-delà, une
// requête signée est refusée : une requête interceptée ne peut pas être
// rejouée indéfiniment (l'idempotence empêche déjà tout doublon, ceci
// empêche en plus d'injecter une ancienne soumission plus tard).
export const MAX_CLOCK_SKEW_SECONDS = 300;

// Signature des sites : en-tête X-KPS-Signature = "sha256=" +
// HMAC-SHA256(secret du site, "<timestamp>.<corps brut>"), avec
// X-KPS-Timestamp = secondes Unix. Le timestamp fait partie du message
// signé, donc il ne peut pas être modifié pour contourner la fenêtre.
export function signWebsitePayload(rawBody: Buffer | string, timestamp: string, secret: string): string {
  const hmac = createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody);
  return `sha256=${hmac.digest("hex")}`;
}

export function isValidWebsiteSignature(params: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  secret: string;
  nowSeconds?: number;
}): boolean {
  const { rawBody, signatureHeader, timestampHeader, secret } = params;
  if (!signatureHeader?.startsWith("sha256=") || !timestampHeader || secret.length === 0) {
    return false;
  }
  if (!/^\d{1,12}$/.test(timestampHeader)) return false;

  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestampHeader)) > MAX_CLOCK_SKEW_SECONDS) return false;

  const received = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  const expected = Buffer.from(
    signWebsitePayload(rawBody, timestampHeader, secret).slice("sha256=".length),
    "hex",
  );
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// WEBSITE_WEBHOOK_SECRETS = "akoraweb:<secret>,autre-site:<secret>" : un
// secret par site, pour pouvoir en révoquer un sans toucher aux autres.
export function parseSiteSecrets(raw: string | undefined): Map<string, string> {
  const secrets = new Map<string, string>();
  for (const entry of (raw ?? "").split(",")) {
    const separator = entry.indexOf(":");
    if (separator <= 0) continue;
    const site = entry.slice(0, separator).trim().toLowerCase();
    const secret = entry.slice(separator + 1).trim();
    if (site && secret) secrets.set(site, secret);
  }
  return secrets;
}
