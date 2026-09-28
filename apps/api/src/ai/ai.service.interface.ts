import type { QualificationAnalysisResult, RequestAnalysisResult } from "@kps/types";

export const AI_SERVICE = Symbol("AI_SERVICE");

export interface RequestAnalysisInput {
  subject: string;
  originalMessage: string | null;
  language: string | null;
  country: string | null;
}

export interface QualificationAnalysisInput {
  subject: string;
  originalMessage: string | null;
  detectedService: string | null;
  // Réponses du formulaire, lisibles : « libellé du champ » → valeur.
  responses: { label: string; value: string }[];
  skillCatalogue: string[];
}

export interface RequiredSkillsInput {
  subject: string;
  originalMessage: string | null;
  detectedService: string | null;
  skillCatalogue: string[];
}

// Abstraction fournisseur (section 20 du prompt). Les autres méthodes du
// catalogue (generateClientResponse, generateFollowUp...) seront ajoutées
// quand les phases correspondantes les rendront nécessaires.
export interface AIService {
  analyzeRequest(input: RequestAnalysisInput): Promise<RequestAnalysisResult>;
  // Section 40 : analyse des réponses du formulaire de qualification.
  analyzeQualification(input: QualificationAnalysisInput): Promise<QualificationAnalysisResult>;
  // Section 48 : compétences nécessaires, parmi le catalogue.
  extractRequiredSkills(input: RequiredSkillsInput): Promise<string[]>;
  getModel(): string;
  getPromptVersion(): string;
}
