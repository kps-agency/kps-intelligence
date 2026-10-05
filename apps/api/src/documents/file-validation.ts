import { DOCUMENT_ALLOWED_TYPES, DOCUMENT_MAX_SIZE_BYTES } from "@kps/shared";

// Contrôle des fichiers (section 60). Le type annoncé par le navigateur
// et l'extension ne prouvent rien : le contenu doit porter la signature
// du type déclaré, sinon un exécutable renommé en .pdf passerait.

const startsWith = (buffer: Buffer, bytes: number[], offset = 0): boolean =>
  bytes.every((byte, index) => buffer[offset + index] === byte);

const ZIP = [0x50, 0x4b, 0x03, 0x04];
// Texte : pas d'octet nul dans le premier bloc (un binaire en contient).
const looksLikeText = (buffer: Buffer): boolean => !buffer.subarray(0, 8192).includes(0);

const SIGNATURES: Record<string, (buffer: Buffer) => boolean> = {
  "application/pdf": (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]),
  "image/png": (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  "image/webp": (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b) => startsWith(b, ZIP),
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (b) => startsWith(b, ZIP),
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": (b) => startsWith(b, ZIP),
  "text/plain": looksLikeText,
  "text/csv": looksLikeText,
};

// Renvoie le message d'erreur à afficher, ou `null` si le fichier est accepté.
export function validateFile(file: { name: string; mimeType: string; content: Buffer }): string | null {
  if (file.content.length === 0) return "Le fichier est vide.";
  if (file.content.length > DOCUMENT_MAX_SIZE_BYTES) {
    return `Le fichier dépasse la taille maximale de ${DOCUMENT_MAX_SIZE_BYTES / 1024 / 1024} Mo.`;
  }
  const extensions = DOCUMENT_ALLOWED_TYPES[file.mimeType];
  if (!extensions) {
    return "Type de fichier non accepté (PDF, PNG, JPEG, WebP, Word, Excel, PowerPoint, texte ou CSV).";
  }
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!extensions.includes(extension)) {
    return "L'extension du fichier ne correspond pas à son type.";
  }
  if (!SIGNATURES[file.mimeType]!(file.content)) {
    return "Le contenu du fichier ne correspond pas à son type.";
  }
  return null;
}

// Nom d'origine reçu de multer : les octets UTF-8 y sont lus comme du
// latin1 (« Ã© » au lieu de « é »).
export function decodeOriginalName(name: string): string {
  const decoded = Buffer.from(name, "latin1").toString("utf8");
  return (decoded.includes("�") ? name : decoded).replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 200);
}

// Partie « nom » de la clé de stockage : ASCII uniquement, sans chemin.
export function storageSafeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-100);
  return cleaned || "document";
}
