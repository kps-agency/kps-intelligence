# ARCHITECTURE.md — KPS Intelligence

Ce document décrit l'architecture cible du système. Il est la référence
pour toute décision structurelle ; `docs/AI_CONTEXT.md` référence ce
document et n'en duplique pas le contenu.

## 1. Vue d'ensemble

KPS Intelligence est un monorepo pnpm + Turborepo composé de deux
applications (`apps/web`, `apps/api`) et de packages partagés, adossé à
Supabase (Postgres + Auth + Storage) et Redis (BullMQ), avec Claude
(Anthropic) comme moteur d'analyse IA.

```text
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   EMAIL     │   │  WHATSAPP   │   │   WEBSITE   │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │ webhook         │ webhook          │ formulaire / API
       ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────┐
│                   apps/api (NestJS)                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────────┐ │
│  │  Ingestion  │→│  Requests   │→│   AIService     │ │
│  │ (email/wa)  │  │   module    │  │  (Claude API)   │ │
│  └────────────┘  └─────┬──────┘  └────────┬────────┘ │
│                        ▼                   ▼          │
│                 ┌─────────────┐   ┌───────────────┐  │
│                 │  Event Bus   │◄──┤  Workflow      │  │
│                 │  (events)    │   │  Engine        │  │
│                 └──────┬──────┘   └───────┬───────┘  │
│           ┌────────────┼────────────┬─────┘          │
│           ▼            ▼            ▼                │
│  ┌──────────────┐ ┌──────────┐ ┌────────────┐        │
│  │ Notification  │ │ Matching │ │  BullMQ /   │        │
│  │  Service      │ │ Service  │ │  Redis      │        │
│  └──────────────┘ └──────────┘ └────────────┘        │
└─────────────────────────────────────────────────────┘
       ▲                                    │
       │ REST (Swagger)                     ▼
┌─────────────┐                     ┌──────────────┐
│ apps/web     │                     │  Supabase     │
│ (Next.js)    │                     │  Postgres/    │
│ - dashboard  │                     │  Auth/Storage │
│ - /qualification/[token] (public)  │              │
└─────────────┘                     └──────────────┘
```

Principe directeur : **tout passe par l'API NestJS**. Le frontend Next.js
ne parle jamais directement à Supabase pour les données métier (pas de
client Supabase côté navigateur pour les tables `clients`, `requests`,
etc.) — seule l'authentification utilise le SDK Supabase Auth côté
client pour obtenir un JWT, revalidé ensuite par l'API à chaque requête.
Cela évite d'exposer la logique RLS/permissions dans deux endroits et
centralise l'audit (section 61 du prompt).

## 2. Frontend (`apps/web`)

- Next.js App Router, TypeScript strict.
- Rendu : pages authentifiées (dashboard interne) + une route publique
  sans authentification (`/qualification/[token]`).
- Données : TanStack Query pour tout appel à `apps/api` (jamais de fetch
  direct à Supabase pour les données métier).
- Formulaires : React Hook Form + Zod, schémas Zod dérivés/alignés sur les
  DTO `class-validator` du backend (les deux sont dans `packages/types`
  quand c'est un contrat partagé — cf. `API.md`).
- UI : `packages/ui` (shadcn/ui), thème dans `packages/config/tailwind-preset.js`.
- Auth : middleware Next.js qui vérifie la session Supabase et redirige
  vers `/login` si absente ; le contrôle d'autorisation fin (RBAC) reste
  côté API — le frontend n'affiche/masque que des éléments d'UI, il ne
  décide jamais d'une permission.

## 3. Backend (`apps/api`)

- NestJS modulaire, un module par domaine métier (liste complète : voir
  `prompt.md` section 9 et le mapping de phases dans `AI_CONTEXT.md`).
- Chaque module suit la même structure interne :
  ```text
  <module>/
    <module>.module.ts
    <module>.controller.ts
    <module>.service.ts
    dto/
    entities/ (types partagés avec packages/types quand pertinent)
    <module>.controller.spec.ts
    <module>.service.spec.ts
  ```
- Validation : `class-validator` + `class-transformer`, `ValidationPipe`
  global (`whitelist: true`, `forbidNonWhitelisted: true`).
- Erreurs : filtre d'exception global qui normalise les réponses d'erreur
  et log structuré avec `requestId`.
- Auth : guard global qui vérifie le JWT Supabase, peuplé dans le
  contexte de requête (`request.user`) ; guards `@Roles()`/`@Permissions()`
  au niveau controller/handler pour le RBAC (matrice stockée en DB, voir
  `DATABASE.md` §RBAC).
- Accès données : un repository/service par module utilise le client
  Supabase avec la **service role key** côté serveur uniquement (jamais
  exposée) ; RLS reste activé en base comme filet de sécurité (voir
  `SECURITY.md`).
- Asynchrone : BullMQ + Redis pour tout traitement non instantané (analyse
  IA, envoi email/WhatsApp, relances, matching, génération de documents/
  rapports) — voir `prompt.md` section 62 pour la liste des jobs.

## 4. Colonne vertébrale event-driven

- Table `events` : trace immuable de tout ce qui se passe dans le
  système (catalogue complet en section 4 du prompt, repris dans
  `packages/types/src/enums.ts::EventType`).
- `EventBus` (service NestJS) : point d'émission unique. Un service métier
  qui produit un effet notable **émet un événement**, il n'appelle jamais
  directement `NotificationService` ou `MatchingService` — ce sont des
  handlers qui s'abonnent aux événements (voir `WORKFLOWS.md`).
- `WorkflowEngine` : consomme les événements, évalue des règles
  configurables (trigger → condition → action), stockées en base
  (`workflows`), et produit des `workflow_runs`.
- La timeline d'une demande (`prompt.md` section 43) est une simple
  lecture de `events` filtrée par `entity_type='request'` et
  `entity_id=<id>`, jamais une table dupliquée.

## 5. IA (Claude)

- `AIService` (interface + implémentation `AnthropicAIService`) dans
  `apps/api/src/ai/` — abstraction volontaire pour pouvoir changer de
  fournisseur sans toucher aux appelants (voir `prompt.md` section 7).
- Prompts versionnés dans `apps/api/src/ai/prompts/*.ts`, jamais de prompt
  inline dans un service métier.
- Détail complet des méthodes et du format de sortie : `AI.md` (rempli en
  Phase 8).

## 6. Multi-canal (Email / WhatsApp)

- Deux modules d'ingestion (`email`, `whatsapp`) qui partagent le même
  contrat de sortie vers `requests` : ils ne connaissent que "comment
  transformer un message externe en `CreateRequestDto`", tout le reste
  (analyse IA, qualification) est identique quel que soit le canal.
- Idempotence : `conversation_messages.external_message_id` est unique —
  un message déjà vu ne recrée jamais de `request`.

## 7. Déploiement

- Cible V1 : Docker Compose sur VPS auto-hébergé.
- Services conteneurisés : `web`, `api`, `redis`.
- Supabase reste un service managé distant (Postgres/Auth/Storage) — pas
  de conteneur Postgres local en production (voir `prompt.md` section 74).
- Détail complet : `DEPLOYMENT.md` (rempli en Phase 25).

## 8. Documents connexes

| Document | Contenu | Rempli en |
|---|---|---|
| `DATABASE.md` | Schéma PostgreSQL complet | Phase 1 (ce lot) |
| `API.md` | Contrats REST, DTO, conventions Swagger | Phase 4+ |
| `AI.md` | Méthodes `AIService`, format des prompts/réponses | Phase 8 |
| `WORKFLOWS.md` | Catalogue d'événements, règles de workflow | Phase 13/15 |
| `NOTIFICATIONS.md` | Matrice de règles de notification | Phase 14 |
| `SECURITY.md` | RBAC, RLS, secrets, audit | Phase 1 (squelette) → Phase 25 (final) |
| `DEPLOYMENT.md` | Docker Compose, CI/CD, VPS | Phase 25 |
| `TESTING.md` | Stratégie de tests par couche | Phase 24 |
