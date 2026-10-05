import { decodeOriginalName, storageSafeName, validateFile } from "./file-validation";

const PDF = Buffer.from("%PDF-1.7\n...");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);

describe("validateFile", () => {
  it("accepte un fichier dont type, extension et contenu concordent", () => {
    expect(validateFile({ name: "Cahier des charges.PDF", mimeType: "application/pdf", content: PDF })).toBeNull();
    expect(validateFile({ name: "logo.png", mimeType: "image/png", content: PNG })).toBeNull();
    expect(validateFile({ name: "notes.txt", mimeType: "text/plain", content: Buffer.from("Bonjour") })).toBeNull();
  });

  it("refuse un exécutable renommé, même annoncé comme PDF", () => {
    expect(validateFile({ name: "facture.pdf", mimeType: "application/pdf", content: EXE })).toContain("contenu");
    expect(validateFile({ name: "notes.txt", mimeType: "text/plain", content: EXE })).toContain("contenu");
  });

  it("refuse un type inconnu, une extension discordante, un fichier vide ou trop gros", () => {
    expect(validateFile({ name: "outil.exe", mimeType: "application/x-msdownload", content: EXE })).toContain("non accepté");
    expect(validateFile({ name: "image.png", mimeType: "application/pdf", content: PDF })).toContain("extension");
    expect(validateFile({ name: "vide.pdf", mimeType: "application/pdf", content: Buffer.alloc(0) })).toContain("vide");
    const big = Buffer.concat([PDF, Buffer.alloc(15 * 1024 * 1024)]);
    expect(validateFile({ name: "gros.pdf", mimeType: "application/pdf", content: big })).toContain("15 Mo");
  });
});

describe("noms de fichier", () => {
  it("restaure les accents d'un nom reçu en latin1 et retire les séparateurs de chemin", () => {
    expect(decodeOriginalName(Buffer.from("Résumé été.pdf", "utf8").toString("latin1"))).toBe("Résumé été.pdf");
    expect(decodeOriginalName("../../etc/passwd")).toBe(".._.._etc_passwd");
  });

  it("produit une clé de stockage ASCII, sans chemin", () => {
    expect(storageSafeName("Résumé été (v2).pdf")).toBe("Resume-ete-v2-.pdf");
    expect(storageSafeName("../../etc/passwd")).toBe("etc-passwd");
    expect(storageSafeName("日本語")).toBe("document");
  });
});
