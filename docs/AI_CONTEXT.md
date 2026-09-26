# AI_CONTEXT.md

Ce document permet à n'importe quel agent IA (ou développeur) de reprendre
ce projet sans relire tout l'historique de conversation. Il est mis à jour
à la fin de chaque phase du plan d'implémentation.

## Quoi

KPS Intelligence : système event-driven qui transforme les demandes
entrantes de KPS Agency (email, WhatsApp, site web) en opportunités puis
missions, avec analyse IA (Claude), qualification via formulaire à lien
sécurisé, matching d'équipe, devis et suivi. Spec complète : `prompt.md`
(racine du repo) — c'est la source de vérité fonctionnelle.

## Décisions techniques verrouillées

- **Monorepo** : pnpm workspaces + Turborepo (pas Nx).
- **Déploiement V1** : Docker Compose sur VPS auto-hébergé (`web`, `api`,
  `redis` conteneurisés ; Supabase reste un service distant géré).
  Conséquence : ne jamais introduire de dépendance à une plateforme
  managée type Vercel/Railway dans le code applicatif.
- **Comptes externes** : aucun n'existait au démarrage du projet. Chaque
  intégration externe (Supabase, Anthropic, email, WhatsApp) a un
  checkpoint utilisateur explicite avant d'être implémentée — jamais de
  mock à la place.
- **TypeScript strict** partout (`packages/config/base.json`).
- **Règle absolue héritée de `prompt.md`** : aucune fonctionnalité mockée
  dans un workflow final (IA, email, WhatsApp, notifications), aucun
  TODO/FIXME laissé, aucun bouton sans fonction branchée à une vraie API.

## Conventions

- Un module métier = un module NestJS (`apps/api/src/<module>`) + les
  types partagés correspondants dans `packages/types/src`.
- Tout enum de statut/catalogue métier vit dans
  `packages/types/src/enums.ts` — source unique, jamais redéfini ailleurs.
- Toute constante métier chiffrée (délais, seuils, préfixes) vit dans
  `packages/shared/src/constants.ts`.
- Toute règle métier déclenchée par un événement passe par l'Event Bus,
  jamais par un appel direct entre services (voir `WORKFLOWS.md` à partir
  de la Phase 13/15).
- Après chaque phase : `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
  doivent être verts avant de passer à la phase suivante.

## Plan d'implémentation

Le plan détaillé (26 phases : Phase 0 à Phase 25, avec livrables et
definition of done par phase) est conservé dans l'historique de
conversation ayant produit ce repo. Résumé de la séquence :

0. Scaffolding monorepo · 1. Doc d'architecture & schéma DB (checkpoint
   utilisateur) · 2. Supabase & migrations (checkpoint compte Supabase) ·
   3. Auth & RBAC · 4. Fondations NestJS · 5. Fondations Next.js + design
   system · 6. Clients & contacts · 7. Requests (source MANUAL) · 8. Claude
   AI / AIService (checkpoint clé Anthropic) · 9. Services & formulaires de
   qualification · 10. Qualification links (page publique) · 11. Email
   (checkpoint provider email) · 12. WhatsApp (checkpoint Meta) · 13.
   Events & Event Bus · 14. Notifications · 15. Workflow Engine · 16.
   Matching équipe · 17. Opportunités · 18. Devis · 19. Missions & tâches ·
   20. Documents · 21. Dashboard & Reports · 22. i18n & RGPD · 23. Audit &
   Observabilité · 24. Tests complets · 25. Sécurité, Docker/CI-CD,
   production readiness.

Definition of Done finale (section 84 de `prompt.md`) : le scénario complet
prospect → email/WhatsApp/site → request → Claude → service identifié →
équipe notifiée → formulaire → lien sécurisé → progression trackée →
soumission → notif → analyse Claude → qualification → notif → matching →
notif → opportunité → devis → validation → mission → équipe affectée →
suivi → reporting doit fonctionner réellement, avec chaque étape
persistée, sécurisée, auditable, testée et visible dans la timeline.

## État actuel

**Phase 0 — Scaffolding monorepo : terminée.**

Validé : `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build` passent tous en vert à la racine (Turborepo, 6 packages :
`@kps/api`, `@kps/web`, `@kps/ui`, `@kps/types`, `@kps/shared`,
`@kps/config`).

Piège relevé et corrigé : un `outDir` défini dans un tsconfig de base
partagé (`packages/config/nestjs.json`) se résout relativement au fichier
où il est déclaré, pas au tsconfig qui l'étend — `nest build` compilait
donc silencieusement dans `packages/config/dist` au lieu de
`apps/api/dist`. Toujours définir `outDir`/`rootDir` dans le tsconfig de
l'app elle-même, jamais dans un config de base partagé.

Créé :
- Structure `apps/`, `packages/{ui,types,shared,config}`, `supabase/`,
  `infrastructure/`, `docs/`, `tests/`.
- `package.json` racine + `pnpm-workspace.yaml` + `turbo.json`.
- `packages/config` : `base.json` (tsconfig strict), `nestjs.json`,
  `nextjs.json`, `eslint-base.js` (flat config typescript-eslint +
  prettier), `tailwind-preset.js` (thème SaaS B2B).
- `packages/types` : enums métier complets extraits de `prompt.md`
  (`UserRole`, `ServiceSlug`, `RequestSource`, `RequestStatus`,
  `QualificationSessionStatus`, `OpportunityStatus`, `MissionStatus`,
  `FormFieldType`, `NotificationChannel`, `EventActorType`, `EventType`).
- `packages/shared` : constantes métier (`QUALIFICATION_LINK_DEFAULT_EXPIRY_DAYS`,
  `REQUEST_REFERENCE_PREFIX`, `APP_NAME`).
- `packages/ui` : scaffold vide (composants réels prévus Phase 5).
- `.env.example` complet (toutes les variables prévues par `prompt.md`
  section 73 + JWT/rate-limit).
- `.gitignore`, `README.md`, `docs/AI_CONTEXT.md` (ce fichier).

**Phase 1 — Documentation d'architecture : terminée.**

Créé : `docs/ARCHITECTURE.md` (archi globale, frontend, backend, event bus,
IA, multi-canal, déploiement), `docs/DATABASE.md` (schéma PostgreSQL
complet : RBAC, CRM, services, requests, formulaires dynamiques +
qualification, events/workflows, notifications, matching, opportunités/
devis, missions/tâches, documents, conversations, audit — avec stratégie
RLS deny-all et 4 points ouverts listés en fin de document), squelettes
`docs/API.md`, `docs/AI.md`, `docs/WORKFLOWS.md`, `docs/NOTIFICATIONS.md`,
`docs/SECURITY.md`.

Décision structurelle clé prise en Phase 1 : le frontend ne parle jamais
directement à Supabase pour les données métier — tout passe par
`apps/api` (service role key côté serveur uniquement), RLS activé partout
en base comme filet de sécurité (deny-all pour anon/authenticated). La
page publique de qualification passe aussi par l'API, pas par un accès
Supabase direct côté navigateur.

Les 4 points ouverts de la section 17 ont été tranchés par défaut
(l'utilisateur n'a pas eu d'avis spécifique) : devise déduite du pays du
client (pas de défaut fixe), `priority`/`urgency` conservés comme deux
axes indépendants, association polymorphe conservée pour `documents`,
référence `KPS-{AAAA}-{NNNNN}` via une table compteur par année
(`request_reference_counters`) plutôt qu'une séquence Postgres globale.

Prochaine étape : **Phase 2 — Supabase & migrations** (checkpoint externe
#1 : créer le projet Supabase avec l'utilisateur — voir ci-dessous).

**Checkpoints externes en attente** (aucun n'est requis avant la Phase 2
au plus tôt) :
1. Compte Supabase — requis avant Phase 2.
2. Clé API Anthropic — requise avant Phase 8.
3. Provider email — requis avant Phase 11.
4. Compte Meta WhatsApp Business Cloud API — requis avant Phase 12.

## Commandes utiles

```bash
pnpm install
pnpm dev            # web + api en parallèle
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
