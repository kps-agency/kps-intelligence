import type Anthropic from "@anthropic-ai/sdk";
import { PriorityLevel, RequestIntent, ServiceSlug } from "@kps/types";

// Versionné (section 20 du prompt) : toute modification du prompt ou du
// schéma d'outil ci-dessous doit incrémenter ce numéro. La version est
// persistée avec chaque analyse (ai_analyses.prompt_version) pour pouvoir
// comparer des résultats produits par des versions différentes.
export const REQUEST_ANALYSIS_PROMPT_VERSION = "request-analysis@1";

export const REQUEST_ANALYSIS_SYSTEM_PROMPT = `Tu es l'assistant d'analyse des demandes entrantes de KPS Agency, une agence spécialisée en développement de sites web, e-commerce, SEO, maintenance et applications métier.

Pour chaque demande reçue (email, WhatsApp, site web ou saisie manuelle), tu dois produire une analyse structurée en appelant l'outil fourni. Ne réponds jamais en texte libre.

Consignes :
- Détecte l'intention réelle du prospect parmi : nouvelle demande de service, client existant qui recontacte, demande de support, demande de maintenance, demande de modification sur un projet existant, demande de devis, spam, ou hors périmètre (rien à voir avec les services de l'agence).
- "service_request" : tout premier contact ou nouveau projet, même si un budget ou un délai indicatif est mentionné en passant — la plupart des demandes de service incluent ce genre de détail. Réserve "quote_request" au cas où le prospect demande explicitement un chiffrage sur un périmètre déjà discuté ou déjà bien défini (ex: "pouvez-vous me faire un devis pour X", sans qu'il s'agisse d'une première prise de contact exploratoire).
- Si l'intention est "service_request" ou "quote_request", identifie le service concerné parmi le catalogue de l'agence (site web, e-commerce, SEO, maintenance, application métier) si l'information est suffisante ; sinon laisse le service à null plutôt que de deviner.
- Pour "support_request" : identifie le service concerné seulement si le message décrit une vraie panne/incident technique (site down, bug bloquant) — dans ce cas "MAINTENANCE" est pertinent. Pour une simple question ou un contact d'un client existant sans problème technique, laisse le service à null.
- "maintenance_request" : le prospect mentionne explicitement un site/projet déjà en production (livré par KPS ou par un tiers) et souhaite un entretien régulier ou une intervention dessus. Si rien n'indique qu'un site existe déjà (juste une demande "je voudrais un contrat de maintenance" sans site existant mentionné), traite-la comme "service_request" avec service="MAINTENANCE".
- Détecte la langue (code ISO 639-1, ex: "fr", "en") et le pays si mentionnés ou déductibles.
- Résume la demande en une ou deux phrases claires, dans la langue détectée.
- Liste les informations manquantes qui empêcheraient de préparer un devis (budget, délai, périmètre précis, etc.).
- Indique un niveau de confiance entre 0 et 1 : baisse-le franchement si la demande est ambiguë, incomplète, ou si tu dois deviner. Une confiance sous 0.6 signale qu'une validation humaine est nécessaire.
- recommendedAction doit être une courte instruction actionnable pour l'équipe (ex: "SEND_QUALIFICATION_FORM", "ROUTE_TO_SUPPORT", "MANUAL_REVIEW", "MARK_AS_SPAM", "IGNORE_OUT_OF_SCOPE").`;

export const REQUEST_ANALYSIS_TOOL_NAME = "submit_request_analysis";

export const REQUEST_ANALYSIS_TOOL: Anthropic.Tool = {
  name: REQUEST_ANALYSIS_TOOL_NAME,
  description:
    "Enregistre l'analyse structurée d'une demande entrante. Doit toujours être appelé, avec tous les champs renseignés (null quand l'information est vraiment absente).",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: Object.values(RequestIntent),
        description: "Intention réelle détectée derrière la demande.",
      },
      service: {
        type: ["string", "null"],
        enum: [...Object.values(ServiceSlug), null],
        description: "Service détecté, ou null si non déterminable.",
      },
      subservice: {
        type: ["string", "null"],
        description: "Sous-catégorie libre du service (ex: ONLINE_STORE), ou null.",
      },
      language: {
        type: ["string", "null"],
        description: "Code langue ISO 639-1 détecté, ou null.",
      },
      country: { type: ["string", "null"] },
      companyName: {
        type: ["string", "null"],
        description: "Nom de la société du prospect si mentionné.",
      },
      summary: {
        type: "string",
        description: "Résumé de la demande en une ou deux phrases.",
      },
      urgency: {
        type: ["string", "null"],
        enum: [...Object.values(PriorityLevel), null],
      },
      budget: {
        type: ["string", "null"],
        description: "Budget mentionné tel quel (texte libre), ou null.",
      },
      deadline: {
        type: ["string", "null"],
        description: "Échéance mentionnée telle quelle (texte libre), ou null.",
      },
      missingInformation: {
        type: "array",
        items: { type: "string" },
        description: "Informations manquantes pour avancer (budget, délai, périmètre...).",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
      },
      recommendedAction: {
        type: "string",
        description: "Instruction actionnable courte pour l'équipe.",
      },
    },
    required: [
      "intent",
      "service",
      "subservice",
      "language",
      "country",
      "companyName",
      "summary",
      "urgency",
      "budget",
      "deadline",
      "missingInformation",
      "confidence",
      "recommendedAction",
    ],
  },
};
