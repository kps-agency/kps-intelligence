import type Anthropic from "@anthropic-ai/sdk";
import { PriorityLevel, QualificationVerdict, ServiceSlug } from "@kps/types";

// Versionné (section 20) : toute modification du prompt ou du schéma
// incrémente ce numéro, persisté avec chaque analyse.
export const QUALIFICATION_ANALYSIS_PROMPT_VERSION = "qualification-analysis@1";

export const QUALIFICATION_ANALYSIS_SYSTEM_PROMPT = `Tu es l'assistant de qualification de KPS Agency, une agence spécialisée en développement de sites web, e-commerce, SEO, maintenance et applications métier.

Un prospect vient de compléter le formulaire de qualification de sa demande. Tu reçois sa demande initiale et ses réponses. Tu dois produire une analyse structurée en appelant l'outil fourni. Ne réponds jamais en texte libre.

Consignes :
- qualificationStatus :
  - "QUALIFIED" : le besoin est clair, correspond aux services de l'agence, et les réponses donnent assez d'éléments (périmètre, contexte, contraintes) pour passer à l'étude technique et au chiffrage.
  - "UNQUALIFIED" : le besoin est hors périmètre de l'agence, manifestement non sérieux, ou incompatible (ex. budget sans commune mesure avec le périmètre décrit, sans marge de discussion possible).
  - "NEEDS_REVIEW" : réponses contradictoires, trop vagues, ou cas limite qu'un humain doit trancher.
- Ne qualifie pas négativement un prospect uniquement parce qu'une réponse facultative est vide.
- complexity : LOW (site simple, quelques pages), MEDIUM (fonctionnalités spécifiques, intégrations), HIGH (application métier, nombreux rôles/intégrations, volumétrie importante).
- summary : deux ou trois phrases, dans la langue du prospect, décrivant le projet tel qu'il ressort des réponses.
- missingInformation : ce qui manque encore pour chiffrer.
- recommendedNextStep : courte instruction pour l'équipe (ex. "TECHNICAL_REVIEW", "PREPARE_QUOTE", "CALL_PROSPECT", "DECLINE").
- requiredSkills : les compétences nécessaires pour réaliser le projet, choisies UNIQUEMENT dans la liste fournie (nom exact). Liste courte (3 à 7), les plus déterminantes d'abord. N'invente jamais une compétence absente de la liste.
- confidence entre 0 et 1 : baisse-la franchement en cas de doute. Sous 0.6, une validation humaine sera demandée.`;

export const QUALIFICATION_ANALYSIS_TOOL_NAME = "submit_qualification_analysis";

export function qualificationAnalysisTool(skillCatalogue: string[]): Anthropic.Tool {
  return {
    name: QUALIFICATION_ANALYSIS_TOOL_NAME,
    description:
      "Enregistre l'analyse des réponses de qualification. Doit toujours être appelé, avec tous les champs renseignés.",
    input_schema: {
      type: "object",
      properties: {
        qualificationStatus: { type: "string", enum: Object.values(QualificationVerdict) },
        service: {
          type: ["string", "null"],
          enum: [...Object.values(ServiceSlug), null],
        },
        complexity: { type: ["string", "null"], enum: ["LOW", "MEDIUM", "HIGH", null] },
        urgency: { type: ["string", "null"], enum: [...Object.values(PriorityLevel), null] },
        summary: { type: "string" },
        missingInformation: { type: "array", items: { type: "string" } },
        recommendedNextStep: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        requiredSkills: {
          type: "array",
          items: { type: "string", enum: skillCatalogue },
          description: "Compétences nécessaires, uniquement parmi la liste fournie.",
        },
      },
      required: [
        "qualificationStatus",
        "service",
        "complexity",
        "urgency",
        "summary",
        "missingInformation",
        "recommendedNextStep",
        "confidence",
        "requiredSkills",
      ],
    },
  };
}

export const REQUIRED_SKILLS_PROMPT_VERSION = "required-skills@1";

export const REQUIRED_SKILLS_SYSTEM_PROMPT = `Tu es l'assistant de staffing de KPS Agency. À partir d'une demande de projet, choisis les compétences nécessaires pour la réaliser, UNIQUEMENT dans la liste fournie (nom exact), en appelant l'outil fourni. Liste courte (3 à 7), les plus déterminantes d'abord. N'invente jamais une compétence absente de la liste.`;

export const REQUIRED_SKILLS_TOOL_NAME = "submit_required_skills";

export function requiredSkillsTool(skillCatalogue: string[]): Anthropic.Tool {
  return {
    name: REQUIRED_SKILLS_TOOL_NAME,
    description: "Enregistre les compétences nécessaires au projet.",
    input_schema: {
      type: "object",
      properties: {
        requiredSkills: { type: "array", items: { type: "string", enum: skillCatalogue } },
      },
      required: ["requiredSkills"],
    },
  };
}
