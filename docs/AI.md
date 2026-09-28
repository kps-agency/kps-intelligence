# AI.md — AIService (Claude)

Squelette créé en Phase 1. `analyzeRequest` implémenté et branché en
Phase 8. Les autres méthodes du catalogue seront ajoutées à l'interface
`AIService` au fur et à mesure des phases qui en ont besoin (voir
`apps/api/src/ai/ai.service.interface.ts`).

## Abstraction

```text
AIService (interface)                     -- apps/api/src/ai/ai.service.interface.ts
  analyzeRequest(input): RequestAnalysisResult
  analyzeQualification(input): QualificationAnalysisResult   -- Phase 16, section 40
  extractRequiredSkills(input): string[]                     -- Phase 16, section 48
  getModel(): string
  getPromptVersion(): string

AnthropicAiService implements AIService   -- apps/api/src/ai/anthropic-ai.service.ts
```

Aucun appelant ne dépend directement du SDK Anthropic — uniquement de
l'interface `AIService`, injectée via le container NestJS sous le token
`AI_SERVICE` (`apps/api/src/ai/ai.module.ts`). Changer de fournisseur =
ajouter une nouvelle classe qui implémente `AIService`, zéro changement
chez les appelants (`RequestsService`).

Méthodes du catalogue section 20 pas encore implémentées :
`classifyRequest`, `extractEntities`, `generateSummary`,
`generateClientResponse`, `generateFollowUp` — elles arriveront avec les
phases qui les motivent. `suggestMatchingProfiles` est volontairement
remplacé par `extractRequiredSkills` + un score déterministe (voir
Matching ci-dessous).

## Prompts versionnés

```text
apps/api/src/ai/prompts/
  request-analysis.ts        -- "request-analysis@1"
  qualification-analysis.ts  -- "qualification-analysis@1" (réponses du formulaire)
                             -- "required-skills@1" (compétences requises)
```

Chaque fichier exporte une constante de version — toute modification du
prompt ou du schéma d'outil en production doit l'incrémenter. La version
est persistée avec chaque analyse (`ai_analyses.prompt_version`), donc on
peut toujours savoir quelle version a produit quel résultat.

## Analyse des réponses de qualification (section 40, Phase 16)

Déclenchée par le workflow `qualification-analysis` (`FORM_COMPLETED`) ou
manuellement (`POST /requests/:id/qualification-analysis`). Claude reçoit
la demande et les réponses **lisibles** (libellés des champs et des
options). Sortie `QualificationAnalysisResult` : verdict
`QUALIFIED`/`UNQUALIFIED`/`NEEDS_REVIEW`, complexité, urgence, résumé,
informations manquantes, étape suivante, confiance, et **compétences
requises choisies dans le catalogue `skills`** (le schéma d'outil les
restreint par `enum`, et la sortie est revérifiée côté serveur).

Décision : confiance ≥ 0,6 et verdict tranché → statut `QUALIFIED` ou
`UNQUALIFIED` appliqué par l'IA (la qualification est automatisable,
section 6) ; sinon statut `QUALIFYING` et notification « Qualification à
valider » au responsable. L'IA ne décide jamais par-dessus une décision
déjà prise (statut déjà au-delà de la qualification).

## Matching (section 48)

L'IA détermine **quelles compétences** le projet exige (analyse des
réponses, ou `extractRequiredSkills` si la demande a été qualifiée à la
main) ; le **score** est ensuite calculé de façon déterministe
(`apps/api/src/matching/matching-score.ts`) : compétences × niveau (70),
expérience similaire (10), disponibilité (15), langue du prospect (5).
Choix délibéré plutôt qu'un score généré par le modèle : reproductible,
auditable, et chaque point est justifié dans l'explication (« + Next.js
(niveau 5/5, 6 ans) », « − disponibilité limitée »). Le résultat est une
recommandation ; l'affectation reste humaine.

## Sortie structurée forcée (tool use)

`analyzeRequest` n'utilise jamais de texte libre reparsé : l'appel à
`messages.create` force `tool_choice: { type: "tool", name:
"submit_request_analysis" }`, avec un `input_schema` JSON qui correspond
exactement à `RequestAnalysisResult` (`packages/types/src/api-contracts.ts`).
Claude ne peut renvoyer que cette forme ; un appel sans bloc `tool_use`
est traité comme un échec (voir Gestion d'erreur ci-dessous).

## Format de sortie — `RequestAnalysisResult`

```json
{
  "intent": "SERVICE_REQUEST",
  "service": "ECOMMERCE",
  "subservice": "ONLINE_STORE",
  "language": "fr",
  "country": "Switzerland",
  "companyName": "ABC SA",
  "summary": "Création d'une boutique en ligne",
  "urgency": "MEDIUM",
  "budget": null,
  "deadline": null,
  "missingInformation": ["budget", "deadline", "number_of_products"],
  "confidence": 0.94,
  "recommendedAction": "SEND_QUALIFICATION_FORM"
}
```

`intent` (enum `RequestIntent`) : `SERVICE_REQUEST`, `EXISTING_CLIENT`,
`SUPPORT_REQUEST`, `MAINTENANCE_REQUEST`, `MODIFICATION_REQUEST`,
`QUOTE_REQUEST`, `SPAM`, `OUT_OF_SCOPE`.

Le prompt système précise explicitement les frontières entre catégories
proches, ajustées empiriquement pendant les tests de la Phase 8 (7
fixtures réelles, section 71) :

- `SERVICE_REQUEST` vs `QUOTE_REQUEST` : un premier contact reste
  `SERVICE_REQUEST` même s'il mentionne un budget indicatif ;
  `QUOTE_REQUEST` est réservé à un chiffrage explicitement demandé sur un
  périmètre déjà discuté.
- `service` sur un `SUPPORT_REQUEST` : renseigné seulement pour une vraie
  panne/incident technique (alors `MAINTENANCE` est pertinent) ; laissé à
  `null` pour un contact client sans problème technique.
- `MAINTENANCE_REQUEST` vs `SERVICE_REQUEST` (service=`MAINTENANCE`) : la
  première suppose qu'un site/projet existant est explicitement mentionné ;
  sans ça, une demande de contrat de maintenance est un `SERVICE_REQUEST`
  classique.

## Déclenchement

- **Synchrone à la création** (`RequestsService.create`, source MANUAL) :
  aucune file d'attente asynchrone n'existe encore dans le projet (BullMQ
  arrivera avec les phases suivantes), donc l'analyse tourne dans le cycle
  de la requête HTTP `POST /requests` elle-même. Un échec n'empêche jamais
  la création (voir Gestion d'erreur).
- **Re-déclenchement manuel** : `POST /requests/:id/analyze`
  (permission `requests.manage`) — utile après un échec, une confiance
  faible, ou si la demande a été modifiée depuis.
- **Historique** : `GET /requests/:id/analyses` (permission
  `requests.read`) — renvoie toutes les analyses de la demande, la plus
  récente en premier. Chaque re-déclenchement ajoute une ligne, n'écrase
  jamais la précédente (`docs/DATABASE.md` §4bis).

Sur un `COMPLETED`, `RequestsService` met aussi à jour
`requests.detected_service_id` (résolu depuis `result.service` via
`services.slug`), `detected_subservice`, `ai_confidence`, `status`
(`ANALYZED`), et renseigne `language`/`country`/`urgency` seulement s'ils
n'étaient pas déjà fixés par un humain.

## Seuil de confiance et Human in the Loop

`AI_LOW_CONFIDENCE_THRESHOLD = 0.6` (`packages/shared/src/constants.ts`,
partagé backend/frontend). Sous ce seuil, la demande reste utilisable mais
`RequestsService` logue un avertissement et le frontend
(`request-analysis-card.tsx`) affiche un bandeau « confiance faible —
validation humaine requise » au-dessus du résultat.

## Gestion d'erreur (section 68)

```text
Appel Claude
 → échec (réseau, 5xx, pas de bloc tool_use)
 → retry (maxRetries: 2 dans le SDK, backoff intégré)
 → échec persistant
 → ai_analyses : ligne FAILED, error = message générique
 → la demande garde son état, aucune exception ne remonte au client
```

Le détail brut de l'erreur (message Anthropic, éventuellement des
fragments sensibles) est logué côté serveur uniquement — jamais renvoyé
au client ni stocké dans `ai_analyses.error`, qui ne contient qu'un
message générique invitant à un traitement manuel.

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

Chaque fixture a un `expected.intent`/`expected.service` et est testée par
`apps/api/test/ai.e2e-spec.ts` avec de vrais appels à l'API Anthropic
(aucun mock). Un cas volontairement vague (« il me faudrait un truc pour
mon activité ») vérifie que l'analyse aboutit quand même, avec des
`missingInformation` non vides, sans figer de valeur de confiance précise
(sortie non déterministe d'un vrai modèle).
