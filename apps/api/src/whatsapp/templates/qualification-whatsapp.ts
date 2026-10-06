import type { ProspectLanguage } from "@kps/shared";

// Message WhatsApp de qualification (section 36 du prompt), texte exact de
// la spec. Envoyé en message texte libre : autorisé par Meta uniquement
// dans les 24 h qui suivent le dernier message du prospect — c'est le cas
// ici puisqu'il part en réponse immédiate à un message entrant. Une
// relance hors de cette fenêtre (Phase 15) exigera un template approuvé
// par Meta.

export interface QualificationWhatsappParams {
  contactFirstName: string | null;
  serviceName: string;
  qualificationUrl: string;
  // Langue du prospect (section 65) ; français par défaut.
  language?: ProspectLanguage;
}

export function renderQualificationWhatsapp(params: QualificationWhatsappParams): string {
  if (params.language === "en") {
    return [
      params.contactFirstName ? `Hello ${params.contactFirstName} 👋` : "Hello 👋",
      "",
      `Thank you for your request about ${params.serviceName}.`,
      "",
      "To better understand your needs,",
      "we invite you to complete our form:",
      "",
      `👉 ${params.qualificationUrl}`,
      "",
      "This will help us get back to you",
      "more quickly.",
      "",
      "KPS Agency",
    ].join("\n");
  }
  const greeting = params.contactFirstName ? `Bonjour ${params.contactFirstName} 👋` : "Bonjour 👋";
  return [
    greeting,
    "",
    `Merci pour votre demande concernant ${params.serviceName}.`,
    "",
    "Pour mieux comprendre votre besoin,",
    "nous vous invitons à compléter notre formulaire :",
    "",
    `👉 ${params.qualificationUrl}`,
    "",
    "Cela nous permettra de vous répondre",
    "plus rapidement.",
    "",
    "KPS Agency",
  ].join("\n");
}
