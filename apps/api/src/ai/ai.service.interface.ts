import type { RequestAnalysisResult } from "@kps/types";

export const AI_SERVICE = Symbol("AI_SERVICE");

export interface RequestAnalysisInput {
  subject: string;
  originalMessage: string | null;
  language: string | null;
  country: string | null;
}

// Abstraction fournisseur (section 20 du prompt) : seule `analyzeRequest`
// est implémentée pour l'instant (Phase 8). Les autres méthodes du
// catalogue (classifyRequest, analyzeQualification, suggestMatchingProfiles,
// generateClientResponse, generateFollowUp...) seront ajoutées à cette
// interface quand les phases correspondantes les rendront nécessaires.
export interface AIService {
  analyzeRequest(input: RequestAnalysisInput): Promise<RequestAnalysisResult>;
  getModel(): string;
  getPromptVersion(): string;
}
