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

**Phase 2 — Supabase & migrations : terminée.**

Checkpoint externe #1 franchi : projet Supabase réel créé par
l'utilisateur (`zfzwqeocpeaodlsjnjkg`). Le projet utilise le **nouveau
système de clés API Supabase** (`sb_publishable_...` / `sb_secret_...` +
endpoint JWKS) plutôt que l'ancien anon/service_role JWT — voir
`.env.example` et `SECURITY.md` pour la correspondance exacte.

Incident traité en cours de route : l'utilisateur a par deux fois collé
de vraies valeurs (clés API, mot de passe DB, `JWT_SECRET`) directement
dans `.env.example` (fichier suivi par git) au lieu de `.env` (ignoré).
Corrigé les deux fois avant tout commit — aucun secret n'est jamais entré
dans l'historique git. Point d'attention permanent pour la suite : **ne
jamais écrire de valeur réelle dans un fichier `*.example`**.

37 tables créées et migrées avec succès sur l'instance réelle via un
migration runner maison (`supabase/migrate.mjs`, `pnpm db:migrate`) —
choisi plutôt que `supabase db push` pour éviter toute dépendance à une
session CLI authentifiée (OAuth) en CI/déploiement, tout en gardant le
format de fichiers (`supabase/migrations/*.sql` horodatés) compatible
avec le CLI Supabase si on veut l'utiliser plus tard pour le développement
local (`supabase start`). Suivi des migrations appliquées dans une table
`schema_migrations` (idempotent, rejouable sans erreur).

Vérifié concrètement (pas seulement "ça compile") :
- RLS activé sur les 37 tables (deny-all) ; testé en conditions réelles :
  une requête REST avec la clé `SUPABASE_PUBLISHABLE_KEY` sur `/rest/v1/roles`
  renvoie `200 []` — la requête est acceptée mais RLS bloque toute lecture,
  bien que 8 lignes existent réellement.
- `generate_request_reference()` génère des références séquentielles
  correctes (`KPS-2026-00001`, `KPS-2026-00002`, ...).
- Seed structurel : 8 rôles, 10 services (5 `ACTIVE`, 5 `COMING_SOON`).

**Phase 3 — Auth & RBAC : terminée.**

Backend (`apps/api`) :
- `SupabaseModule` (global) : client Supabase serveur typé
  (`SupabaseClient<Database>`, types générés depuis le vrai schéma via
  `pnpm db:gen-types` → `supabase/generate-types.mjs`, wrapper de
  `supabase gen types typescript --db-url ... ` sans besoin de session CLI
  authentifiée).
- `JwtVerifierService` : vérifie les JWT Supabase Auth via
  `SUPABASE_JWKS_URL` (clés asymétriques, `jose`), aucun secret partagé.
- `JwtAuthGuard` + `PermissionsGuard`, tous deux globaux (`APP_GUARD`),
  dans cet ordre : authentification (sauf `@Public()`), puis vérification
  RBAC (sauf si aucune `@RequirePermissions(...)` déclarée). Le contexte
  RBAC (`roleKey` + `permissions: string[]`) est résolu à chaque requête
  depuis les tables réelles (`users` → `roles` → fonction SQL
  `get_role_permissions`), jamais mis en cache côté application.
- Modules `users` (`/users/me`, `/users` [users.read/users.manage],
  `/users/:id/role`) et `roles` (`/roles` [roles.read]). `UsersService.create()`
  crée un vrai utilisateur Supabase Auth (mot de passe temporaire jamais
  communiqué) puis déclenche `resetPasswordForEmail` — l'utilisateur choisit
  son propre mot de passe via l'email Supabase natif.
- Permissions Phase 3 seedées (migration `20260927100001`) : `users.read`,
  `users.manage`, `roles.read` — assignées à `SUPER_ADMIN`/`ADMIN`
  (toutes) et `DIRECTOR` (lecture seule). Aucune permission spéculative
  pour un module pas encore construit.
- `supabase/bootstrap-admin.mjs` : crée le tout premier utilisateur (rôle
  au choix) via l'API Admin Supabase — outil de bootstrap, pas une
  fonctionnalité applicative.

Frontend (`apps/web`) :
- `src/lib/supabase/{client,server}.ts` (SDK Supabase Auth uniquement,
  jamais pour des données métier), `src/middleware.ts` (protection de
  route + refresh de session), pages `/login`, `/forgot-password`,
  `/reset-password`, `/dashboard` (Server Component qui appelle
  `GET /users/me` côté serveur avec le token de session).
- Contrat partagé `CurrentUserResponse` ajouté à `packages/types` pour
  éviter de redéfinir la forme de la réponse aux deux bouts.

**Bugs réels trouvés et corrigés pendant cette phase** (aucun n'était
visible en local tant que le code n'avait pas tourné pour de vrai) :
1. `outDir` d'un tsconfig de base partagé se résolvant relativement au
   fichier qui le déclare (déjà noté Phase 0, revérifié ici).
2. `packages/types`/`packages/shared` n'avaient pas d'étape de build :
   Next.js/ts-jest transpilent du `.ts` brut à la volée, mais un `node
   dist/main.js` compilé ne le peut pas (`ERR_MODULE_NOT_FOUND`). Ajout
   d'un vrai `tsc` build (CommonJS, `dist/`) pour ces deux packages.
2bis. Sans types Supabase générés, les embeds PostgREST (`roles(key)`)
   sont typés comme tableaux par défaut, cassant tout typage fiable →
   génération des types réels (`Database`) depuis le schéma, `.env` ne
   contenant plus `NODE_ENV=development` (qui cassait le build de
   production Next.js en entrant en conflit avec sa propre gestion de
   `NODE_ENV`).
3. **`useSearchParams()` sans `<Suspense>`** faisait échouer le
   prerendering de `/login` à la build.
4. **Le plus important** : `eslint --fix` sur la règle
   `@typescript-eslint/consistent-type-imports` a converti en `import
   type` des classes injectées par constructeur (`Reflector`,
   `ConfigService`, nos propres services) et des DTO utilisés avec
   `@Body()`. Un `import type` est effacé à la compilation : NestJS perd
   la référence de classe dans `design:paramtypes`
   (`emitDecoratorMetadata`), ce qui casse silencieusement l'injection de
   dépendances ET désactive la validation `class-validator` (la
   `ValidationPipe` voit `metatype = Object` et **saute la validation sans
   erreur**). Corrigé fichier par fichier, puis règle désactivée dans
   `apps/api/eslint.config.js` (documenté en commentaire) — ne jamais
   lancer `eslint --fix` sans relire le diff sur un projet NestJS.

Vérifié en conditions réelles (pas seulement "ça compile") :
- Connexion réelle via Supabase Auth (comptes `admin@kps.agency`
  SUPER_ADMIN et `viewer@kps.agency` VIEWER créés via le script de
  bootstrap), `GET /users/me` renvoie le bon rôle/permissions pour chacun.
- `GET /users` : 200 pour admin (a `users.read`), **403** pour viewer (ne
  l'a pas) — RBAC piloté par données, pas par un `if (role === ...)`.
- Sans token : 401. `GET /roles` : 200 pour admin.
- `POST /users` avec un body invalide (email malformé, rôle inexistant) :
  **400** avec le détail des erreurs `class-validator` — confirme que la
  ValidationPipe fonctionne réellement après la correction du bug n°4.
  Avec un body valide : 201, vrai utilisateur Supabase Auth + profil créés.
- **Test e2e navigateur réel (Playwright, pas de mock)** : `/` → redirigé
  vers `/login` (non authentifié) → login réel → redirigé vers
  `/dashboard` avec le bon nom/email/rôle/permissions affichés → clic sur
  "Se déconnecter" → redirigé vers `/login` → `/dashboard` de nouveau
  inaccessible sans session.

**Phase 4 — Fondations NestJS : terminée.**

- **Swagger/OpenAPI** : `/api/docs` (UI) et `/api/docs-json`, généré via le
  plugin `@nestjs/swagger` du CLI Nest (déclaré dans `nest-cli.json`, donc
  actif avec `nest build`/`nest start`, pas avec ts-jest). Bearer auth
  documenté. Désactivé si `APP_ENV=production`.
- **Filtre d'exceptions global** (`src/common/all-exceptions.filter.ts`,
  `APP_FILTER`) : un seul format d'erreur `{statusCode, message, error,
  requestId}` pour tout (401/403/429/validation/500). Les erreurs
  inattendues sont logguées avec leur stack, jamais détaillées au client.
- **Logs structurés** (`nestjs-pino`, JSON) avec `requestId` : repris de
  `x-request-id` s'il est fourni, sinon généré, renvoyé dans la réponse.
  `authorization` et `cookie` masqués.
- **Rate limiting** (`@nestjs/throttler`, guard global) depuis
  `RATE_LIMIT_TTL`/`RATE_LIMIT_MAX`. **CORS** limité à `APP_URL`.
- Nouvelle variable : `LOG_LEVEL` (défaut `info`).

Vérifié en conditions réelles : Swagger UI accessible (200) et spec listant
les routes + le bearer + les champs de `CreateUserDto` ; `x-request-id`
généré, et repris quand fourni ; 401 sans token avec le corps normalisé et le
bon `requestId` ; 429 après dépassement de la limite (testé avec une limite
basse à 8/min) ; token absent des logs sur un appel authentifié réel
(`"authorization":"[Redacted]"`) ; 6 tests unitaires du filtre/health.

Points d'attention :
- Le compteur de rate limiting est en mémoire (par instance) : à basculer sur
  Redis (déjà prévu pour BullMQ) si l'API passe en plusieurs instances.
- Le mode dev de Next.js (`next dev`) compile les pages à la demande : la
  première navigation après un login peut prendre plusieurs secondes et
  donner l'impression que la redirection est bloquée. Le parcours complet a
  été validé sur un build de production (Phase 3). Si ça gêne en dev, tester
  avec `next build` + `next start`.

Prochaine étape : **Phase 5 — Fondations Next.js + design system**
(shadcn/ui, layout sidebar/topbar, TanStack Query, composants de base).

**Checkpoints externes** :
1. ✅ Compte Supabase — fait (Phase 2).
2. ⏳ Clé API Anthropic — requise avant Phase 8.
3. ⏳ Provider email — requis avant Phase 11.
4. ⏳ Compte Meta WhatsApp Business Cloud API — requis avant Phase 12.

## Commandes utiles

```bash
pnpm install
pnpm db:migrate    # applique les migrations SQL en attente (supabase/migrations/*.sql)
pnpm dev            # web + api en parallèle
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
