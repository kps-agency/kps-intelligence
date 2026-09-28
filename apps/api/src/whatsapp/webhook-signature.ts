import { createHmac, timingSafeEqual } from "node:crypto";

// Meta signe chaque webhook : en-tête X-Hub-Signature-256 =
// "sha256=" + HMAC-SHA256(app secret, corps brut). Le calcul doit porter
// sur les octets exacts reçus, jamais sur un JSON re-sérialisé.
export function isValidMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=") || appSecret.length === 0) return false;

  const received = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
