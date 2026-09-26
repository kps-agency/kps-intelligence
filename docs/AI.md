# AI.md — AIService (Claude)

Squelette créé en Phase 1. Rempli en Phase 8 avec les prompts réels, les
schémas de sortie exacts et les métriques de confiance observées.

## Abstraction

```text
AIService (interface)
  analyzeRequest(request): RequestAnalysis
  classifyRequest(request): Classification
  extractEntities(text): ExtractedEntities
  analyzeQualification(session, responses): QualificationAnalysis
  generateSummary(entity): string
  suggestMatchingProfiles(request, candidates): MatchingSuggestion[]
  generateClientResponse(context): string
  generateFollowUp(context): string

AnthropicAIService implements AIService   -- apps/api/src/ai/anthropic-ai.service.ts
```

Aucun appelant ne dépend directement du SDK Anthropic — uniquement de
l'interface `AIService`, injectée via le container NestJS. Changer de
fournisseur = ajouter une nouvelle classe, zéro changement chez les
appelants.

## Prompts versionnés

```text
apps/api/src/ai/prompts/
  request-analysis.ts
  classification.ts
  qualification.ts
  matching.ts
  email.ts
  whatsapp.ts
  summary.ts
```

Chaque fichier exporte une constante `PROMPT_VERSION` et le template —
toute modification de prompt en production doit incrémenter la version et
être traçable dans `events`/`audit_logs` (quel prompt a produit quel
résultat).

## Format de sortie attendu — `analyzeRequest`

Repris de `prompt.md` section 19 :

```json
{
  "intent": "service_request",
  "service": "ECOMMERCE",
  "subservice": "ONLINE_STORE",
  "language": "fr",
  "country": "Switzerland",
  "company_name": "ABC SA",
  "summary": "Création d'une boutique en ligne",
  "urgency": "medium",
  "budget": null,
  "deadline": null,
  "missing_information": ["budget", "deadline", "number_of_products"],
  "confidence": 0.94,
  "recommended_action": "SEND_QUALIFICATION_FORM"
}
```

Intents supplémentaires à détecter (section 19) : `existing_client`,
`support_request`, `maintenance_request`, `modification_request`,
`quote_request`, `spam`, `out_of_scope`.

## Format de sortie attendu — `analyzeQualification`

```json
{
  "qualification_status": "QUALIFIED",
  "service": "BUSINESS_APPLICATION",
  "complexity": "HIGH",
  "urgency": "MEDIUM",
  "summary": "...",
  "missing_information": [],
  "recommended_next_step": "TECHNICAL_REVIEW",
  "confidence": 0.91
}
```

## Seuil de confiance et Human in the Loop

Seuil par défaut (à ajuster empiriquement en Phase 8/71) :
`confidence < 0.6` → `AI_ANALYSIS_LOW_CONFIDENCE`, la demande reste en
statut nécessitant une validation humaine, notification au responsable
plutôt que passage automatique à l'étape suivante (cf. `prompt.md`
section 6/40).

## Gestion d'erreur (section 68)

```text
Appel Claude
 → échec
 → retry (backoff exponentiel, 3 tentatives)
 → échec persistant
 → événement AI_ANALYSIS_FAILED
 → notification responsable
 → request reste en AI_ANALYZING avec flag manuel
```

Jamais de fallback vers une réponse simulée : un échec IA est un échec
visible, pas masqué par une valeur par défaut plausible.

## Fixtures de test (Phase 8/71)

```text
apps/api/test/fixtures/ai/
  website-request.json
  ecommerce-request.json
  seo-request.json
  maintenance-request.json
  business-app-request.json
  support-request.json
  spam-request.json
```
