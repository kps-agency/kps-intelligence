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

**Phase 5 — Fondations Next.js + design system : terminée.**

- **`packages/ui`** : Button, Card, Badge, Input/Select/Label, Table, Dialog,
  Sheet, DropdownMenu, Skeleton, Avatar (Radix + cva + `cn`). Tokens de
  couleur dans `globals.css` (dont `success`/`warning`), plugin
  `tailwindcss-animate` dans le preset. `packages/ui` n'a pas de build :
  seul `apps/web` le consomme, via `transpilePackages`.
- **Shell** (`apps/web/src/components`) : sidebar fixe desktop, tiroir
  mobile (Sheet), topbar avec menu utilisateur, lien d'évitement « Aller au
  contenu », groupe Administration épinglé en bas de la sidebar. Toutes les
  routes de la section 57 sont listées dans `lib/navigation.ts` ; les 12
  modules non livrés sont **désactivés avec leur phase** (pas de pages
  vides). Groupe de routes `(app)` : son layout résout l'utilisateur et
  gère les états d'échec (`session-rejected`, `no-profile`,
  `api-unavailable`).
- **Données** : `apiFetch` + `ApiError` (avec `requestId`), TanStack Query,
  contrats partagés dans `packages/types/src/api-contracts.ts`,
  `ROLE_LABELS` dans `packages/shared`.
- **Vraie page `/settings`** (gestion des utilisateurs, avec les endpoints de
  la Phase 3) : tableau, création via dialogue (React Hook Form + Zod),
  changement de rôle, états chargement/erreur/vide, boutons et sélecteurs
  masqués selon `users.manage`, page « Accès refusé » sans `users.read`.
  Elle sert de premier consommateur réel de Table/Dialog/Badge/mutations.
- Pages de connexion migrées sur `@kps/ui` ; titre de page via gabarit
  `%s · KPS Intelligence`.

**Décisions / écarts au plan** :
- **Timeline et Kanban non livrés en Phase 5** (le plan les prévoyait en
  « squelettes »). Sans données réelles ils seraient du code mort invérifiable ;
  ils seront écrits avec leur premier usage réel (Timeline Phase 13, Kanban
  Phase 17).
- **Pas de mode sombre** (le preset Tailwind est prêt : `darkMode: "class"`),
  pas de cloche de notifications (Phase 14) : aucune fonctionnalité factice.
- Le shadcn CLI n'est pas utilisé : composants écrits à la main dans le même
  style, pour éviter la complexité du CLI en monorepo.

**Faille corrigée en cours de phase** : côté API (Phase 3), un `ADMIN`
pouvait se promouvoir `SUPER_ADMIN` (ou en créer un). Ajout de
`assertCanAssignRole` (voir `SECURITY.md`) — 6 tests unitaires + 4 attaques
vérifiées en réel avec un compte `ADMIN`.

**Bugs réels trouvés par le test navigateur** (invisibles au typecheck) :
1. Le nom accessible du tableau était sur la région et pas sur le `<table>`.
2. Après fermeture du dialogue (Échap), le focus retombait sur `<body>` : le
   bouton d'ouverture n'était pas le `DialogTrigger`. Corrigé en faisant
   posséder le déclencheur par `CreateUserDialog`.
3. « Paramètres » (seule entrée utile) était sous 12 entrées « Bientôt » :
   hors écran sur mobile (844 px) et à 800 px de haut → groupe épinglé.
4. Tableau tronqué sur mobile (rôle coupé, scroll latéral invisible) →
   colonnes secondaires masquées sous `md`, statut sous le nom.
5. Risque de boucle de redirection : un 401 de l'API alors que Supabase
   juge la session valide renverrait vers `/login`, puis le middleware vers
   `/dashboard`… → traité comme un écran d'état, pas une redirection.

Vérifié en conditions réelles (Playwright sur build de production, 47+
contrôles) : parcours complet login → dashboard → paramètres → création →
changement de rôle persisté → déconnexion ; RBAC UI (SUPER_ADMIN / ADMIN /
VIEWER) ; **axe (WCAG 2.0/2.1 A+AA) sans aucune violation** sur /login,
/dashboard, /settings, dialogue ouvert, tiroir mobile ouvert et « Accès
refusé » ; navigation clavier (lien d'évitement au 1er Tab, Échap +
retour du focus) ; aucun scroll horizontal à 390 px.

Points d'attention connus :
- Chaque rendu de page appelle `GET /users/me` (≈0,2–2 s : 2 allers-retours
  Supabase). Correct mais perfectible : un cache court du contexte RBAC côté
  API serait le levier. À traiter si ça se ressent en usage.
- Environnement de dev : le port 3000 est occupé sur la machine de dev par un
  processus étranger au projet. Le web tourne sur 3010 ; l'API doit alors
  être lancée avec `APP_URL=http://localhost:3010` (CORS), le navigateur
  appelant maintenant l'API directement.
- Comptes de test créés dans le projet Supabase : `admin@kps.agency`
  (SUPER_ADMIN) et `viewer@kps.agency` (VIEWER). `ui-admin@kps.agency`
  (ADMIN) est recréable via `node supabase/bootstrap-admin.mjs`.

**Phase 6 — Clients & Contacts : terminée.**

Backend (`apps/api`) :
- Modules `clients` (`GET/POST /clients`, `GET/PATCH /clients/:id`) et
  `contacts` (`GET/POST /clients/:clientId/contacts`, `GET/PATCH/DELETE
  /contacts/:id`, `GET /contacts` transverse). Permissions dédiées
  (`clients.read/manage`, `contacts.read/manage`) seedées uniquement sur
  les rôles qui en ont l'usage (migration `20260927200001`).
- **Pas de suppression de client** (il porte l'historique commercial) :
  archivage par statut. Les contacts, eux, sont supprimables.
- Contact principal : bascule atomique via la fonction SQL
  `set_primary_contact` (verrou sur la ligne du client), jamais deux
  appels séparés — testé avec deux bascules concurrentes réelles. Un
  index unique en base (`uniq_contacts_primary_per_client`, posé dès la
  Phase 0) interdit deux principaux même en contournant l'API. L'API
  n'accepte que `isPrimary: true` en entrée : on désigne un nouveau
  principal, on ne retire jamais le statut directement (empêche un client
  sans principal).
- `AllExceptionsFilter` étendu avec `toDbException` (`apps/api/src/common/db-error.ts`) :
  toute erreur Postgres/PostgREST est traduite en exception HTTP propre,
  jamais renvoyée telle quelle au client (repris aussi dans `users`/`roles`,
  qui fuyaient le message brut avant cette phase).
- Recherche : `toContainsPattern`/`toWordPatterns`
  (`apps/api/src/common/search.ts`) neutralisent la syntaxe de filtre
  PostgREST (`,()"\*%`) pour empêcher l'injection de conditions
  supplémentaires via le paramètre `search`.
- **34 tests d'intégration réels** (`apps/api/test/crm.e2e-spec.ts`, contre
  la vraie base, `pnpm --filter @kps/api test:e2e` — nécessite
  `E2E_ADMIN_*`/`E2E_VIEWER_*` dans `.env`) : RBAC, RLS, validation,
  pagination/tri/recherche, cycle de vie contact (principal automatique,
  bascule, contrainte unique, suppression avec transfert du rôle
  principal), cascade de suppression, non-fuite des erreurs base.

Frontend (`apps/web`) : pages `/clients`, `/clients/[id]` (infos éditables
+ contacts), `/contacts` (liste transverse) ; composants `Textarea` et
`ConfirmDialog` ajoutés à `packages/ui`. `PaginationControls` et
`useDebouncedValue` réutilisables pour toute future liste paginée.

**Trois bugs réels trouvés et corrigés par le test navigateur** (pas par
le typecheck) :
1. **Accessibilité** : `aria-label` sur un `<div>` sans `role` (invalide
   pour ARIA) sur les 4 zones de chargement (`role="status"` manquant) —
   présent depuis la Phase 5 (`users-admin.tsx`), jamais détecté parce que
   le test précédent n'avait jamais capturé l'état de chargement lui-même.
2. **Recherche de contacts cassée pour un nom complet** : prénom et nom
   sont deux colonnes ; chercher "Bob Durand" ne matchait aucune des deux
   entièrement → 0 résultat alors que le contact existe. Corrigé en
   découpant la recherche en mots (chaque mot doit matcher un champ,
   `toWordPatterns`).
3. **Condition de course dans l'invalidation TanStack Query** (le plus
   subtil) : `invalidateContacts` appelait `invalidateQueries` sur
   `["clients","contacts",clientId]` PUIS sur `["clients"]`, qui la
   recouvre déjà par préfixe — deux requêtes concurrentes pour la même
   donnée, dont la plus lente pouvait écraser la plus fraîche. Symptôme :
   après avoir désigné un nouveau contact principal, l'ancien restait
   parfois affiché comme principal. Repéré uniquement après plusieurs
   exécutions du test (pas systématique), confirmé par traçage réseau
   horodaté, corrigé en supprimant l'invalidation redondante. Revérifié
   sur plusieurs exécutions consécutives après correction.

Point d'attention infrastructure (pas un bug produit) : des exécutions
répétées et rapprochées du test navigateur ont fini par déclencher un
ralentissement du endpoint de login Supabase Auth (jusqu'à ~27s au lieu de
~1s) — limitation de débit côté Supabase liée au volume de connexions de
test, pas à l'application (confirmé : `/health`, qui ne dépend pas de
Supabase Auth, répondait en 3ms pendant le ralentissement). À espacer les
campagnes de tests e2e si ça se reproduit.

**Phase 7 — Requests (objet central) + inbox manuelle : terminée.**

**Incident d'infrastructure traité en préalable** : la connexion directe à
Postgres (`db.<ref>.supabase.co`, IPv6 uniquement) s'est révélée
franchement injoignable (`ENETUNREACH`, pas une simple lenteur) depuis le
réseau de développement — confirmé que ce n'était pas un problème de
résolution DNS (`nslookup` et `dns.resolve6()` réussissaient tous les
deux) mais une vraie absence de route IPv6. `DATABASE_URL` pointe
désormais sur le **Session Pooler** (IPv4,
`aws-1-eu-west-1.pooler.supabase.com`), l'option recommandée par Supabase
pour ce cas — cf. `.env.example`. `supabase/migrate.mjs` garde des
tentatives avec backoff pour les blips réseau ordinaires (insuffisantes
seules pour ce problème précis, qui n'était pas transitoire).

Backend (`apps/api`) :
- Module `requests` (`GET/POST /requests`, `GET/PATCH /requests/:id`).
  Permissions `requests.read`/`requests.manage` sur le même schéma que le
  CRM (Phase 6) — SALES en est le propriétaire principal. **Pas de
  suppression** : la demande est l'objet central de tout le pipeline, son
  historique doit rester traçable.
- Source figée à `MANUAL` côté serveur (jamais un champ du DTO) —
  EMAIL/WHATSAPP/WEBSITE arriveront par webhook aux Phases 11-12, jamais
  via ce endpoint. Référence (`KPS-AAAA-NNNNN`) et statut par défaut
  (`NEW`) gérés par la base (Phase 2).
- Lien client/contact validé activement : `contactId` exige `clientId`,
  et le contact doit appartenir à ce client précis (`assertClientContactMatch`,
  réutilisé création + modification). Changer de client sans préciser de
  nouveau contact délie automatiquement l'ancien (évite un contact
  orphelin d'un autre client). `clientId: null` délie aussi le contact.
- Correction de schéma : `requests.subject` n'avait pas de contrainte
  `NOT NULL` en base alors que l'API l'exige partout (migration
  `20260927300002` — 0 ligne affectée, table encore vide à ce moment).
- **27 tests d'intégration réels** (`apps/api/test/requests.e2e-spec.ts`,
  contre la vraie base) : RBAC, RLS, validation, lien client/contact
  (dont le cas de contact n'appartenant pas au bon client), cycle de vie
  complet, pagination/recherche/filtres, non-fuite d'erreurs. Cumulé avec
  le CRM : **61 tests d'intégration** au total.

Frontend (`apps/web`) : pages `/requests` (liste avec recherche/filtre par
statut) et `/requests/[id]` (fiche éditable : sujet, message, statut,
priorité, urgence, liaison client/contact avec le même sélecteur que le
formulaire de création). Libellés français des 20 statuts et des niveaux
de priorité ajoutés à `packages/shared` (`REQUEST_STATUS_LABELS`,
`PRIORITY_LABELS`), regroupés en couleurs de badge sémantiques plutôt que
20 couleurs distinctes (`apps/web/src/lib/request-display.ts`).

**Bug de synchronisation trouvé dans le test navigateur, pas dans
l'app** : le script attendait une requête réseau `/contacts` après
sélection d'un client dans le formulaire de demande, mais TanStack Query
sert parfois cette donnée depuis son cache (si le client a été consulté
dans les 30 dernières secondes) sans requête réseau — comportement
voulu (`staleTime`), pas un défaut. Le test attendait le mauvais signal ;
corrigé pour attendre le résultat visible plutôt qu'un appel réseau
supposé. Accessoirement confirmé au passage : Playwright considère les
`<option>` HTML comme "hidden" pour son test de visibilité stricte même
quand elles existent bel et bien — ne jamais `waitFor({state:"visible"})`
dessus, `selectOption()` gère déjà l'attente correctement en interne.

Vérifié en conditions réelles (Playwright sur build de production, 21+
contrôles, 3 exécutions consécutives sans échec) : création avec
client+contact liés, changement de statut/priorité/urgence persistés,
déliaison du client, recherche par sujet et par référence, filtre par
statut, RBAC SUPER_ADMIN/VIEWER, axe sans violation, mobile sans scroll
horizontal.

## Phase 8 — Claude AI (AIService)

Checkpoint externe #2 franchi : clé API Anthropic workspace-scoped créée
avec l'utilisateur (deux itérations — la première clé n'était pas
rattachée à un workspace, la deuxième a buté sur un solde de crédits
insuffisant avant que l'utilisateur ajoute des crédits).

Backend (`apps/api/src/ai/`) :
- `AIService` (interface, token `AI_SERVICE`) + `AnthropicAiService`
  (`@anthropic-ai/sdk`), injectée dans `RequestsService`. `analyzeRequest`
  force la sortie via `tool_choice` (jamais de texte libre reparsé) — le
  schéma de l'outil correspond exactement à `RequestAnalysisResult`
  (`packages/types`). Prompt versionné dans
  `ai/prompts/request-analysis.ts` (`request-analysis@1`).
- Nouvelle table `ai_analyses` (migration `20260927400001`, une ligne par
  appel réel à Claude, jamais écrasée — voir `docs/DATABASE.md` §4bis).
- `RequestsService.create` déclenche l'analyse **de façon synchrone** :
  aucune file d'attente asynchrone n'existe encore dans le projet, donc
  l'appel Claude fait partie du cycle de la requête HTTP `POST /requests`
  elle-même. Un échec (réseau, pas de `tool_use`, retries épuisés) ne
  bloque jamais la création : une ligne `ai_analyses` `FAILED` est
  persistée avec un message générique, la demande reste utilisable
  (section 68 du prompt). Nouveaux endpoints :
  `POST /requests/:id/analyze` (re-déclenchement manuel,
  `requests.manage`) et `GET /requests/:id/analyses` (historique complet,
  `requests.read`).
- Sur un succès, `requests.detected_service_id` (résolu par slug),
  `detected_subservice`, `ai_confidence`, `status` (`ANALYZED`) sont mis à
  jour ; `language`/`country`/`urgency` uniquement s'ils n'étaient pas déjà
  fixés par un humain.
- Seuil de confiance basse partagé backend/frontend :
  `AI_LOW_CONFIDENCE_THRESHOLD = 0.6` dans `packages/shared` (une seule
  source de vérité, pas de duplication du nombre magique).

**Ambiguïtés de classification trouvées et corrigées par de vrais appels
à Claude, pas par intuition** — le prompt système a été affiné trois fois
après des échecs de test bien réels (7 fixtures de la section 71) :
1. `SERVICE_REQUEST` vs `QUOTE_REQUEST` : un premier contact avec un
   budget indicatif mentionné (cas fréquent en vrai) était parfois
   classé `QUOTE_REQUEST`. Clarifié : `QUOTE_REQUEST` seulement pour un
   chiffrage demandé sur un périmètre déjà discuté.
2. `service` sur un `SUPPORT_REQUEST` mentionnant un site existant était
   instable (`null`/`ECOMMERCE`/`MAINTENANCE` selon les runs). Clarifié :
   `MAINTENANCE` seulement pour une vraie panne/incident technique.
3. `MAINTENANCE_REQUEST` vs `SERVICE_REQUEST` (service=`MAINTENANCE`) :
   une demande de contrat de maintenance sans site existant mentionné
   partait parfois en `MAINTENANCE_REQUEST` au lieu de `SERVICE_REQUEST`.
   Clarifié dans le prompt, et la fixture correspondante réécrite pour
   mentionner explicitement un site déjà livré par KPS (lève l'ambiguïté
   réelle plutôt que de la contourner par une assertion trop souple).

**14 tests d'intégration réels** (`apps/api/test/ai.e2e-spec.ts`, avec de
vrais appels à l'API Anthropic — aucun mock) : classification des 7
fixtures, cas volontairement ambigu (vérifie l'absence de crash et des
`missingInformation` non vides plutôt qu'une confiance figée — sortie non
déterministe d'un vrai modèle), historique après re-déclenchement, 404,
RBAC, non-fuite d'erreur. Les 27 tests `requests.e2e-spec.ts` existants
ont dû être ajustés : la création d'une demande MANUAL passe désormais
directement à `ANALYZED` (plus `NEW`) et `urgency` peut être déduite par
l'IA plutôt que rester `null` — comportement voulu de la Phase 8, pas une
régression.

Frontend : `request-analysis-card.tsx` sur `/requests/[id]` — résultat de
la dernière analyse (intention, résumé, confiance, informations
manquantes, action recommandée), bandeau d'avertissement si confiance
< 0.6, bouton de re-déclenchement (ADMIN/SALES uniquement), historique
compact des analyses précédentes. Champ « Service détecté » ajouté à la
fiche demande. Vérifié en conditions réelles (Playwright sur build de
production, avec de vrais appels Claude en direct pendant le test) :
création → analyse visible → re-déclenchement → historique à 2 entrées →
VIEWER lit sans pouvoir re-déclencher, axe sans violation.

## Phase 9 — Services & formulaires de qualification (form builder)

Pas de checkpoint externe requis.

Backend :
- `ServicesModule` : le catalogue de services (10 lignes, pré-seedé en
  Phase 2) n'a pas de création/suppression — seulement `GET /services`,
  `GET /services/:id`, `PATCH /services/:id` (description, statut,
  `qualificationFormId`).
- `FormsModule` : form builder générique (`forms`/`form_steps`/
  `form_fields`) — CRUD complet sur les formulaires, étapes et champs,
  jamais codé en dur côté frontend. Deux fonctions SQL
  (`reorder_form_steps`, `reorder_form_fields`, migration `500001`)
  réordonnent de façon atomique via un décalage hors-portée puis une
  réassignation en un seul appel — évite la collision transitoire d'une
  permutation en deux `UPDATE` séparés sur une colonne à contrainte
  unique. La clé d'un champ (`form_fields.key`) doit être unique à
  l'échelle du **formulaire entier** (contrôlé en application, la
  contrainte DB ne couvre que l'étape) puisque `conditionalLogic` et les
  réponses la référencent sans préciser l'étape.
- Les **5 formulaires de qualification réels** (sections 25-29,
  migration `500002`) sont des données construites avec ce builder
  (`forms`/`form_steps`/`form_fields`), publiées (`PUBLISHED`) et liées
  à leur service. Le formulaire WEBSITE reprend aussi l'exemple exact de
  logique conditionnelle de la section 30 (« Avez-vous déjà un site ? »
  OUI → URL, NON → objectif).
- `QualificationSessionsModule` : `qualification_sessions`/
  `form_responses` (autosave, section 32) exposés uniquement via des
  routes **authentifiées** pour l'instant (`POST
  /requests/:id/qualification-sessions`, `GET
  /qualification-sessions/:id`, `PUT .../responses/:fieldKey`, `POST
  .../submit`) — remplir une qualification au nom d'un client depuis la
  fiche demande. Un token est réellement généré et haché
  (`crypto.randomBytes` + SHA-256) à la création, mais n'est exposé
  nulle part encore : la Phase 10 ajoutera la route publique par token
  au-dessus de ce même service, sans dupliquer la logique. La création
  est idempotente (une session `CREATED`/`IN_PROGRESS` existante pour le
  même couple demande/formulaire est réutilisée). La soumission valide
  côté serveur que tous les champs requis **visibles** ont une réponse
  non vide avant de passer à `COMPLETED`.

**Bugs réels trouvés et corrigés pendant les tests** (aucun mock — chaque
bug est apparu en frappant la vraie base ou le vrai navigateur) :
- Deux relations existent entre `forms` et `services`
  (`forms.service_id` et `services.qualification_form_id`, sens
  inverses) : un `.select("*, services(name)")` sans précision était
  rejeté par PostgREST (`PGRST201`, relation ambiguë). Corrigé avec le
  nom de contrainte explicite (`services!forms_service_id_fkey`).
- Le DTO `SaveFormResponseDto.value` utilisait `@IsDefined()`, qui dans
  class-validator traite `null` comme "non défini" et le rejette — cassait
  justement le cas d'usage qu'il devait permettre (effacer une réponse).
  Remplacé par `@IsOptional()`.
- `form_responses.value` est `not null` en base : y écrire `null` pour
  "effacer" échouait (contrainte violée). Corrigé en **supprimant** la
  ligne plutôt qu'en y écrivant un null SQL.
- `.env` avait `APP_URL=http://localhost:3001` alors que `apps/web`
  tourne réellement sur le port 3000 (`dev`/`start` le fixent tous les
  deux) — la CORS allow-origin de l'API ne correspondait donc jamais à
  l'origine réelle du navigateur, bloquant silencieusement **tous** les
  appels API du frontend. Trouvé uniquement parce que le test Playwright
  frappait le vrai navigateur (une requête curl directe à l'API ne
  l'aurait jamais révélé). Corrigé dans `.env`.
- Un bug de test (pas applicatif) : `run = \`E2E-FORMS-${Date.now()}\``
  contenait des majuscules, invalides dans un slug de formulaire
  (`CreateFormDto` exige minuscules/chiffres/tirets) — faisait échouer en
  cascade toute la suite `forms.e2e-spec.ts` dès la création du premier
  formulaire de test.

**48 tests d'intégration réels** sur 3 nouveaux fichiers
(`services.e2e-spec.ts`, `forms.e2e-spec.ts`,
`qualification-sessions.e2e-spec.ts`) : catalogue, RBAC, validations
(options requises pour SELECT/RADIO/..., clé mal formée, clé dupliquée
dans le formulaire, condition référençant un champ inconnu), cycle de vie
complet form→step→field→reorder→publish, session
CREATED→IN_PROGRESS→COMPLETED avec coercion de valeur par type (nombre,
option valide, effacement), 404/400/403 et non-fuite d'erreur. Les 75
tests des phases précédentes (requests/crm/ai) repassés sans régression.

Frontend : `/services` (catalogue, configuration par dialogue),
`/forms` (liste, création) et `/forms/[id]` (builder complet : étapes et
champs avec réorganisation ▲▼, création/édition/suppression, éditeur
d'options texte simple `valeur|Libellé`, sélecteur de condition
d'affichage, publication). Sur `/requests/[id]`, une carte « Qualification »
démarre ou reprend une session sur le formulaire du service détecté (ou
un autre, au choix) ; le runner
(`/requests/[id]/qualification/[sessionId]`) rend dynamiquement le
formulaire multi-étapes avec barre de progression, logique conditionnelle
évaluée en direct, autosave (au blur pour le texte, immédiat pour les
choix), et un écran de résumé en lecture seule une fois `COMPLETED` (y
compris après rechargement de la page, restauré depuis la session).

Vérifié en conditions réelles (Playwright sur build de production, 23
contrôles) : catalogue de services et formulaires réels, création
complète d'un formulaire avec un champ conditionnel construit et testé de
bout en bout dans le navigateur (masqué avant réponse, apparaît après
« Oui »), publication, démarrage d'une qualification depuis une vraie
demande, soumission, restauration après rechargement, RBAC VIEWER sur les
trois surfaces (services/forms/qualification), axe sans violation sur
les 4 nouvelles pages (un `aria-progressbar-name` manquant trouvé et
corrigé).

Prochaine étape : **Phase 10 — Qualification links (page publique)**.
Pas de checkpoint externe requis.

**Checkpoints externes** :
1. ✅ Compte Supabase — fait (Phase 2).
2. ✅ Clé API Anthropic — fait (Phase 8).
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
