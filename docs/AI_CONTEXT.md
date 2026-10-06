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

## Phase 10 — Qualification links (page publique)

Pas de checkpoint externe requis.

Backend (`apps/api/src/qualification-sessions/`) :
- Nouvelle route publique **sans authentification**
  (`@Public()`) : `PublicQualificationController`
  (`GET/PUT/POST /public/qualification/:token/...`) — résout la session
  par `token_hash` (jamais par id) et consomme le **même**
  `QualificationSessionsService` que les routes authentifiées de la
  Phase 9, pas de logique dupliquée. Contrat de réponse volontairement
  restreint (`PublicQualificationSessionResponse`) : statut, expiration,
  prénom du contact, nom du service, référence de la demande, formulaire,
  réponses — jamais de score IA ni de champ interne (section 34).
- `POST /requests/:id/qualification-sessions` **fait maintenant toujours
  tourner le token** : une session active existante pour ce couple
  demande/formulaire est réutilisée (réponses déjà enregistrées
  conservées) mais reçoit un nouveau token et une URL fraîche —
  `QualificationSessionCreatedResponse.qualificationUrl` est la **seule**
  occasion de récupérer le lien en clair (seul son hash SHA-256 est
  stocké, jamais le token brut).
- Gestion admin du lien (section 37) : `mark-sent` (CREATED→SENT),
  `revoke` (→CANCELLED), `extend` (prolonge l'expiration, réactive un
  lien EXPIRED avec un statut cohérent avec son avancement réel),
  `regenerate` (fait tourner le token sans perdre les réponses déjà
  saisies). Nouvel endpoint `GET /requests/:id/qualification-sessions`
  (liste, la plus récente en premier) pour le suivi côté fiche demande.
- Suivi (section 38) : colonnes `sent_at`/`opened_at` ajoutées (migration
  `600001`/`600002`), plus `progressPercent` calculé (réponses
  enregistrées / total des champs du formulaire, toutes étapes
  confondues). Pas de tâche planifiée dans le projet pour expirer les
  liens : l'expiration est **auto-corrigée à la lecture**
  (`withEffectiveStatus`) — quiconque consulte une session expirée la
  voit, et la persiste, comme `EXPIRED`.
- Ouvrir le lien public (même en lecture seule) fait passer
  `CREATED`/`SENT` → `OPENED` une seule fois (`opened_at` déjà renseigné
  = pas de re-déclenchement) — jamais sur les lectures authentifiées, qui
  ne comptent pas comme une ouverture par le prospect.

**Bug d'environnement réel trouvé, pas dans le code applicatif** : `.env`
avait `PUBLIC_QUALIFICATION_URL=http://localhost:3001/qualification` —
même dérive de port que `APP_URL` en Phase 9. Corrigé ; les liens générés
pointent maintenant réellement vers `apps/web` (port 3000).

**35 tests d'intégration réels** sur `qualification-sessions.e2e-spec.ts`
(étendu : liste, mark-sent, revoke, extend, regenerate, y compris les
bornes 1-365 jours et le blocage sur une session COMPLETED) et un nouveau
`public-qualification.e2e-spec.ts` (7 tests, **aucun token
d'authentification envoyé** — exactement comme un vrai prospect) :
contrat public minimal vérifié champ par champ, transition OPENED réelle,
validation de type par le vrai formulaire de test, cycle complet jusqu'à
COMPLETED avec mise à jour du statut de la demande
(`RESPONSE_RECEIVED`, jamais en régression d'un statut déjà plus avancé),
salutation avec prénom de contact réel, lien révoqué lisible mais en
lecture seule, expiration forcée en base puis reconsultée (EXPIRED) et
réactivée (extend). Les 141 tests des 7 fichiers e2e passent sans
régression.

Frontend : `apps/web/src/app/qualification/[token]/` — page publique
autonome (son propre `layout.tsx` avec `Providers`, en dehors du groupe
`(app)` donc sans sidebar), salutation section 24, écran de confirmation
section 34 (aucune fuite interne), et les états lien révoqué/expiré
affichés explicitement plutôt qu'une erreur brute. Le moteur de rendu
multi-étapes a été extrait en composants partagés
(`MultiStepQualificationForm`, `QualificationField`,
`lib/qualification-form-logic.ts`) réutilisés à l'identique par le runner
authentifié (Phase 9) et la page publique — un seul endroit pour la
logique de visibilité conditionnelle et le rendu par type de champ. La
carte « Qualification » de `/requests/[id]` a été entièrement refaite :
liste des sessions avec suivi (Envoyé/Ouvert/Commencé/Progression/
Complété, section 38), affichage du lien en clair une seule fois après
génération/régénération (jamais persisté côté client au-delà du rendu),
et actions admin (marquer envoyé, prolonger, régénérer, révoquer).

**Bug d'accessibilité réel trouvé (pas seulement en Phase 10 — un cas
préexistant de la Phase 9 découvert en même temps)** : `<dl>` avec des
`<div>` enveloppant chaque paire `<dt>`/`<dd>` viole la règle
"definition-list" (axe exige que `<dt>`/`<dd>` soient des enfants directs
de `<dl>`). Corrigé dans la carte de suivi (remplacé par des `<div>`
simples, ce n'était pas une vraie liste de définitions) et dans le résumé
interne de qualification complétée (dt/dd en enfants directs via
`Fragment`, sans wrapper).

Vérifié en conditions réelles (Playwright, deux navigateurs séparés — un
pour l'admin connecté, un pour le prospect sans aucune session, exactement
la situation réelle) : génération du lien, marquage envoyé, ouverture
publique avec salutation et logique conditionnelle réellement testée dans
le formulaire WEBSITE (masqué/affiché selon la réponse), soumission,
confirmation sans fuite interne, retour admin avec suivi à jour,
génération d'un second lien après complétion, révocation — 13 contrôles,
axe sans violation sur les deux pages (admin et publique).

## Phase 11 — Email (ingestion + envoi)

Checkpoint externe #3 franchi : compte Gmail personnel
(`senghorpape41@gmail.com`) plutôt qu'un provider transactionnel dédié
(Mailgun/SendGrid/Postmark envisagés puis écartés par l'utilisateur, qui a
un compte Gmail déjà sous la main — « pour l'instant »). Deux itérations
avant que le mot de passe d'application Gmail fonctionne : un premier
mot de passe collé était rejeté (`535 BadCredentials`) alors que la
validation en 2 étapes était bien active — régénérer un nouveau mot de
passe d'application (plutôt que de réutiliser l'existant) a résolu le
problème sans qu'on en comprenne la cause exacte côté Google.

**Décision d'architecture notable** : Gmail n'offre pas d'inbound webhook
simple pour un compte personnel (il faudrait Google Cloud Pub/Sub + un
point HTTPS public, hors de portée d'un dev local sans tunnel). Réception
par **polling IMAP réel** à la place — `EmailIngestionService`
(`OnModuleInit`/`OnModuleDestroy`, `setInterval` piloté par
`EMAIL_POLL_INTERVAL_SECONDS`) scanne réellement la boîte toutes les 60s
et alimente exactement le même pipeline qu'un vrai webhook déclencherait.
Migrer vers un provider avec un vrai webhook plus tard ne changera que le
déclencheur, pas `RequestsService.createFromInbound` ni la suite de la
chaîne.

Backend :
- `RequestsService.createFromInbound(...)` : nouvelle méthode interne
  (pas de route HTTP, appelée uniquement par `EmailIngestionService`)
  pour créer une demande depuis un canal entrant (EMAIL aujourd'hui,
  WhatsApp en Phase 12). Idempotente sur `email_message_id` (index unique
  partiel — `requests.email_message_id`/`email_thread_id`, migration
  `700001`) : un même Message-ID renvoyé une deuxième fois renvoie la
  demande déjà créée (`alreadyExisted: true`) sans jamais en recréer une.
  Déclenche la même analyse IA synchrone que la création MANUAL (Phase 8).
- `EmailIngestionService.processMessage` : parse chaque email réel
  (`mailparser`) — expéditeur, sujet, corps texte/HTML, Message-ID,
  thread (References/In-Reply-To). Cherche un contact existant par email
  (`ilike`) pour lier automatiquement client/contact si trouvé. Ignore les
  emails sans Message-ID (idempotence impossible) et les emails envoyés
  par le compte lui-même (évite toute boucle avec les emails de
  qualification qu'il envoie).
- Chaînage automatique complet (section 17, 19, 21) : email reçu →
  demande créée → analyse Claude → si un service est détecté avec une
  confiance ≥ 0.6 (`AI_LOW_CONFIDENCE_THRESHOLD`, `packages/shared`) et
  que ce service a un formulaire publié → une session de qualification
  est créée (réutilise `QualificationSessionsService.create`, Phase 9-10)
  → un vrai email de qualification part immédiatement (section 35,
  template dans `apps/api/src/email/templates/qualification-email.ts`,
  bouton + lien texte). Un échec à n'importe quelle étape de ce dernier
  maillon (pas de formulaire lié, échec SMTP...) ne bloque jamais
  l'ingestion (section 68) — la demande existe déjà et reste qualifiable
  manuellement depuis `/requests/:id`.
- `email_ingestion_state` (table à une ligne, `id boolean primary key
  default true` + `check(id)`) : curseur du dernier UID IMAP traité, pour
  reprendre exactement où on s'est arrêté après un redémarrage plutôt que
  de rescanner toute la boîte. Amorçage automatique à `last_uid = 0` sur
  un déploiement neuf (traite tout l'historique — le comportement attendu
  pour une boîte dédiée qui n'a encore rien reçu) ; pour cet environnement
  de dev, le curseur a été initialisé manuellement à `UIDNEXT - 1` pour
  ignorer les 196 emails personnels déjà présents dans la boîte de test.
- `GET /email-ingestion/status` (permission dédiée `email.read`,
  SUPER_ADMIN/ADMIN uniquement — c'est une donnée opérationnelle, pas
  métier) : dernier UID traité, horodatage du dernier passage, dernière
  erreur éventuelle.

**4 tests d'intégration réels** sur `email.e2e-spec.ts` : création
source=EMAIL avec vraie analyse IA, idempotence stricte sur Message-ID
(vérifiée en base — jamais deux lignes), liaison automatique à un contact
existant, et un test à boucle fermée particulièrement rigoureux — un vrai
envoi SMTP suivi d'une vraie recherche IMAP qui retrouve l'email
effectivement livré (pas seulement "aucune exception côté envoi"). Les 7
suites précédentes (141 tests) repassées sans régression malgré un
changement de comportement de fond : `EmailIngestionService` tourne
désormais automatiquement dès le bootstrap de `AppModule`, donc chaque
fichier e2e (même sans rapport avec l'email) déclenche accessoirement un
vrai cycle de polling IMAP en tâche de fond — assumé plutôt que contourné,
conforme au principe zéro-mock : l'application est réellement vivante
pendant les tests, pas seulement les parties qu'ils ciblent.

## Phase 12 — WhatsApp (ingestion + envoi) — ⚠️ implémentée, NON vérifiée en réel

**Écart assumé par rapport aux phases précédentes, à la demande explicite
de l'utilisateur** : pas encore d'app Meta, donc implémentation écrite
contre le contrat réel de l'API WhatsApp Business Cloud (Graph API), mais
**sans aucun test d'intégration réel** — les tests réels sont reportés à
l'obtention des credentials. Rien n'est simulé dans le code (pas de mock,
pas de faux succès), mais le DoD de la phase (« un vrai message WhatsApp
crée une demande, déclenche l'analyse IA et l'envoi du lien ») **n'est pas
encore démontré**. À faire dès que le compte Meta existe :
1. Renseigner `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` dans `.env`.
2. Exposer l'API en HTTPS public (tunnel type ngrok en dev) et déclarer
   `<url>/api/v1/webhooks/whatsapp` côté Meta, champ « messages ».
3. Écrire `whatsapp.e2e-spec.ts` (envoi réel vers le numéro de test Meta,
   webhook réel reçu, idempotence sur un rejeu). Attention : l'app de
   test Nest doit être créée avec `createNestApplication({ rawBody: true })`
   comme dans `main.ts`, sinon toute signature sera rejetée.

Ce qui a quand même été vérifié : typecheck/lint/build, 6 tests unitaires
sur la vérification de signature HMAC, et un smoke test de l'API compilée
réellement démarrée — sans configuration WhatsApp elle démarre et refuse
tout (403 sur la vérification, 503 sur les webhooks) ; avec un secret
temporaire, la poignée de main renvoie le challenge uniquement pour le bon
token et la signature calculée sur le corps brut est acceptée (200) alors
qu'une signature fausse ou absente est rejetée (401).

Backend (`apps/api/src/whatsapp/`) :
- `GET/POST /api/v1/webhooks/whatsapp` (`@Public`, sans rate limiting,
  exclu de Swagger) : poignée de main d'abonnement Meta (verify token,
  comparaison à temps constant) puis vérification `X-Hub-Signature-256`
  (HMAC-SHA256 de l'App Secret sur le **corps brut** — `rawBody: true`
  activé dans `main.ts`). Fail closed : secret absent → tout refusé.
- Réponse 200 immédiate, traitement en arrière-plan : Meta rejoue tout
  webhook non acquitté rapidement alors que l'analyse IA prend plusieurs
  secondes ; les rejeux sont absorbés par l'idempotence.
- Idempotence à deux niveaux : `conversation_messages.external_message_id`
  (index unique existant depuis la Phase 2) pour chaque message, et
  `requests.whatsapp_message_id` (nouvel index unique partiel, migration
  `800001`) pour la création de demande — `createFromInbound` accepte
  désormais l'un ou l'autre identifiant.
- Conversations (section 18 — « conserver les conversations ») : un
  message d'un numéro qui a déjà une conversation dont la demande n'est
  pas close (WON/LOST/CONVERTED_TO_MISSION/CLOSED/UNQUALIFIED) est ajouté
  à cette conversation au lieu d'ouvrir une nouvelle demande. Les messages
  sont traités **séquentiellement par numéro** (file en mémoire) : sinon
  « Bonjour » suivi une seconde plus tard de la vraie demande créerait
  deux demandes, le second message arrivant pendant l'analyse IA du
  premier. File en mémoire = une seule instance d'API ; à déplacer sur
  BullMQ (clé de groupe = numéro) si l'API est un jour répliquée.
- Rattachement automatique au contact : colonnes générées
  `contacts.whatsapp_digits`/`phone_digits` (chiffres seuls, préfixe `00`
  retiré) comparées au `wa_id` de Meta. Limite : un numéro saisi au
  format national (« 079... ») n'est pas rapproché.
- Envoi du lien de qualification (section 36, texte exact) quand un
  service est détecté avec confiance suffisante, exactement comme l'email.
  Message texte libre : autorisé par Meta seulement dans les 24 h suivant
  le dernier message du prospect (c'est le cas ici). **Les relances de la
  Phase 15 hors de cette fenêtre exigeront des templates approuvés par
  Meta.** Le message sortant est historisé dans la conversation **sans le
  lien** (le token est un secret porteur, stocké haché ailleurs).

Limites connues, volontairement hors périmètre :
- Seuls les messages texte sont traités ; image/vocal/document sont
  ignorés (logués).
- Un premier message sans contenu exploitable (« Bonjour ») crée une
  demande peu informative ; les messages suivants sont ajoutés à la
  conversation mais ne relancent pas l'analyse IA. À traiter avec le
  Workflow Engine (Phase 15).
- Les accusés de réception/lecture Meta (`statuses`) sont ignorés.

Correctif Phase 11 découvert en passant : l'envoi automatique de l'email
de qualification créait la session sans jamais la marquer envoyée — l'UI
admin affichait « créé, non envoyé » alors que l'email était bien parti.
Les deux canaux appellent désormais `markSent` après un envoi réussi.

## Phase 13 — Events & Event Bus

**Principe** (sections 4, 43, 44) : chaque étape métier est d'abord
écrite dans `events` (source de vérité), puis transmise aux handlers
abonnés. La timeline d'une demande est reconstruite **uniquement** depuis
`events` — rien d'autre n'est consulté.

Backend :
- `EventBus` (`apps/api/src/events/`, module global) : `emit()` persiste
  puis dispatche ; `subscribe(type, handler)` ; les handlers tournent hors
  du chemin de l'appelant (une étape déjà réalisée n'attend ni n'échoue à
  cause d'une réaction en aval) et leurs erreurs sont journalisées sans
  être propagées. Un échec d'écriture d'un événement est journalisé sans
  annuler l'étape métier déjà réalisée. `whenIdle()` attend la fin des
  handlers, y compris en cascade — utilisé à l'arrêt de l'app et par les
  tests.
- Acteur explicite sur chaque événement (section 43) : `USER` + id (passé
  par les contrôleurs via `@CurrentUser`), `AI`, `SYSTEM` (ingestion,
  suivi des actions du prospect sur la page publique, expiration),
  `AUTOMATION` (analyse lancée à la création, envoi automatique). Passé en
  paramètre des méthodes de service plutôt que par un contexte implicite.
- Migration `900001` : 5 types ajoutés au catalogue (la section 4 ne donne
  que des exemples) — `REQUEST_STATUS_CHANGED`,
  `QUALIFICATION_LINK_REVOKED/EXTENDED/EXPIRED`,
  `CONVERSATION_MESSAGE_RECEIVED` ; colonne `events.request_id` (demande
  racine, quel que soit l'`entity_type`) pour que la timeline soit une
  seule requête indexée ; trigger qui interdit toute modification d'un
  événement (ajout seul — la suppression reste possible pour la cascade et
  le futur droit à l'oubli) ; `conversation_messages.from_name`.
- Rétrofit des phases 7-12 : réception, analyse démarrée/terminée/échouée,
  service identifié, changement de statut (événement dédié pour
  QUALIFIED/UNQUALIFIED/CLOSED, `REQUEST_STATUS_CHANGED` sinon — éditer un
  autre champ n'est pas une étape du pipeline), cycle complet du lien de
  qualification. `FORM_PROGRESS_UPDATED` n'est émis qu'au franchissement
  d'un palier de 25 %, sinon l'autosave noierait la timeline. L'expiration
  est journalisée quand elle est constatée (pas de tâche planifiée) ; la
  date réelle est dans le payload. Aucun token de qualification dans les
  payloads (vérifié par test).
- **Découplage réel** : la règle « service identifié avec assurance →
  envoi du formulaire » était codée en dur, en double, dans les ingestions
  email et WhatsApp. Elle vit désormais dans
  `qualification-dispatch/` sous forme de deux handlers :
  `SERVICE_DETECTED` → (confiance ≥ seuil, formulaire publié, aucune
  session existante) → émet `QUALIFICATION_REQUIRED` → crée le lien et
  l'envoie **sur le canal par lequel le prospect a écrit**. Une demande
  saisie à la main n'a pas de canal : la qualification apparaît comme
  requise, l'équipe envoie le lien. Une analyse relancée ne renvoie pas un
  second lien. Les ingestions ne font plus que recevoir et enregistrer.
- Conséquence sur l'ordre : `createFromInbound` n'analyse plus lui-même —
  l'ingestion enregistre la conversation (le canal de réponse) *puis*
  appelle `analyze`, sinon le handler pourrait chercher où répondre avant
  que la conversation existe.
- `ConversationsService` partagé : les emails sont désormais aussi
  conservés en conversation (comme WhatsApp). **Bug Phase 11 corrigé** :
  un prospect qui répondait à l'email de qualification créait une
  *nouvelle* demande (nouvelle analyse, potentiellement un second lien).
  L'email de qualification part maintenant dans le fil du message
  d'origine (`In-Reply-To`/`References`), son Message-ID est enregistré,
  et une réponse qui référence un message connu d'une conversation ouverte
  y est rattachée (`CONVERSATION_MESSAGE_RECEIVED`). Même principe que les
  messages WhatsApp successifs d'un même numéro.
- `GET /api/v1/requests/:id/timeline` (`requests.read`), noms des
  utilisateurs résolus pour les acteurs `USER`.

Frontend : carte « Historique » sur la fiche demande — libellé en
français par type d'événement, horodatage, origine (icône + libellé
IA/Utilisateur/Système/Automatisation, ou nom de l'utilisateur).
Rafraîchie toutes les 15 s tant que la page est visible (les étapes
automatiques et les actions du prospect arrivent sans action de
l'utilisateur) et invalidée après chaque action faite depuis la fiche.

**7 tests d'intégration réels** (`events.e2e-spec.ts`) : timeline d'une
demande manuelle (ordre et acteur de chaque étape), qualification requise
sans envoi faute de canal, relance d'analyse attribuée à l'utilisateur
sans doublon de qualification, événements de statut avec ancien/nouveau
statut, cycle de vie complet d'un lien dans l'ordre exact (10 événements,
acteurs USER/SYSTEM, paliers 50 %/100 %, aucun token), journal
non modifiable, accès 401/404/VIEWER. Et la chaîne événementielle de bout
en bout, en boucle fermée : demande entrante par email → analyse Claude →
`SERVICE_DETECTED` → `QUALIFICATION_REQUIRED` → lien créé → **vrai email
envoyé et retrouvé par IMAP** dans le fil du message d'origine → réponse
du prospect rattachée à la demande existante, une seule fois, sans
nouvelle demande. Suite e2e complète : 153/153 (un échec isolé de
`requests.e2e-spec` sur un timeout réseau Supabase, `ConnectTimeoutError`,
repassé 27/27 seul).

Vérifié en navigateur réel (Playwright sur build de production, 14
contrôles, axe sans violation en ADMIN et VIEWER, mobile sans scroll
horizontal). Deux vrais problèmes trouvés ainsi et corrigés :
- Une analyse relancée sur une demande manuelle encore sans lien redisait
  « Qualification requise » (le test e2e ne relançait qu'après création
  d'un lien). `QUALIFICATION_REQUIRED` n'est plus émis qu'une fois par
  demande et par service ; le test e2e couvre maintenant les deux cas.
- Formulaires de connexion et de réinitialisation sans `method` : si le JS
  ne se charge pas alors que le HTML du formulaire est servi, la
  soumission native partait en GET avec **le mot de passe dans l'URL**
  (historique, logs serveur). Passés en `method="post"`. Constaté parce
  que `next build` lancé pendant un `next dev` écrase le `.next` partagé et
  casse le serveur de dev (chunks en 404) : **ne jamais lancer
  `pnpm build` pendant `pnpm dev`**, ou redémarrer `pnpm dev` ensuite.

## Phase 14 — Notifications

Checkpoint avec l'utilisateur, recommandations retenues sur les quatre
points : destinataire « Commercial » = l'**assigné** de la demande,
sinon **tous les commerciaux actifs** (admins en dernier recours si
personne n'a le rôle visé) ; **in-app partout + email ciblé** sur les
étapes qui appellent une action ; templates **sobres et professionnels**
en base ; **Redis en conteneur Docker** (`docker-compose.yml` à la
racine, préfigure celui de la Phase 25).

Détail complet (matrice, publics, préférences, idempotence, gestion
d'échec) : **`docs/NOTIFICATIONS.md`**. En bref :
- `NotificationsDispatcher` s'abonne à l'Event Bus (Phase 13) — aucune
  notification n'est déclenchée par un appel direct depuis un module
  métier. Règles dans `notification-rules.ts`, templates en base
  (migration `950001`), une ligne `notifications` par destinataire × canal.
- In-app écrit immédiatement ; email via **BullMQ** (`bullmq` + `ioredis`,
  ce dernier est une dépendance optionnelle de BullMQ 6 qu'il faut
  installer explicitement), retry ×5 avec backoff, `sent_at`/`error`
  tracés, emails en attente relancés au démarrage.
- `TEAM_NOTIFIED` dans la timeline (section 43 « 🔔 Commercial notifié »),
  `REQUEST_ASSIGNED` quand une demande est confiée à quelqu'un
  (`assignedUserId` sur création et modification, limité aux utilisateurs
  actifs ayant `requests.manage`).
- WhatsApp **non implémenté** pour les notifications internes : un
  message à l'initiative de l'entreprise exige un template approuvé par
  Meta ; refusé explicitement par l'API de préférences.

Frontend : cloche avec compteur dans l'en-tête (rafraîchie toutes les
30 s, n'affirme « aucune non lue » qu'une fois le compteur chargé), page
`/notifications` (non lues / lues / toutes, recherche, filtre de priorité,
marquer lu, tout marquer lu, lien vers la demande qui la marque lue,
pagination), dialogue « Préférences » (mise à jour optimiste, in-app
critique verrouillé), champ « Assigné à » sur la fiche demande, libellés
timeline pour l'assignation et les personnes notifiées.

Bugs réels trouvés et corrigés pendant la phase :
- **Idempotence incomplète** (trouvé par le test e2e de rejeu) : la clé
  unique événement × destinataire × canal ne suffisait pas. Une demande
  réassignée de A à B, puis un `REQUEST_RECEIVED` rejoué, notifiait B pour
  une étape déjà traitée (les destinataires étaient recalculés d'après
  l'état *actuel*). Un événement déjà traité n'est plus jamais re-ciblé.
- **Rebonds ingérés comme demandes** : les emails de notification
  partent vers de vraies adresses ; un rebond ou une réponse d'absence
  revenant dans la boîte ingérée aurait créé une fausse demande. Filtre
  `isAutomated` (RFC 3834 `Auto-Submitted`, `Precedence`,
  `X-Failed-Recipients`, `multipart/report`, `mailer-daemon`…) + tests.
- **Erreurs Redis non écoutées** : sans écouteur `error` sur la file et
  le worker BullMQ, une coupure Redis est une exception non gérée qui
  fait tomber l'API (c'est ce qui a fait « pendre » le premier run e2e).
- UI : la cloche affirmait « aucune non lue » pendant le chargement ; les
  cases de préférences ne changeaient d'état qu'après la réponse serveur.

Tests : **15 tests e2e réels** (`notifications.e2e-spec.ts`) avec de vrais
comptes créés pour le test (alias `+` de la boîte de test : chaque email
part réellement et est retrouvé par IMAP, sans écrire à un tiers) —
ciblage (assigné seul, tous les commerciaux si non assignée, jamais
l'auteur, jamais d'autres rôles), réassignation, envoi réel par BullMQ,
timeline, rejeu idempotent, assignation refusée à un VIEWER, préférences
réellement appliquées et verrouillage critique, centre (filtres,
recherche, compteur, marquer lu, isolation entre utilisateurs, 401),
responsable technique et repli admin. Unitaires : rendu de templates,
filtre d'emails automatiques. Régression complète : 10 suites, 168/168.
Navigateur réel (build de production) : 23 contrôles, axe sans violation
sur la fiche, `/notifications` et le dialogue, mobile sans scroll.

Note d'environnement : les serveurs `pnpm dev` de l'utilisateur sont
tombés pendant la phase (le `.next` écrasé en Phase 13, puis l'API dev
arrêtée) — **redémarrer `pnpm dev`**, et `docker compose up -d redis`
avant, désormais requis par l'API.

## Phase 15 — Workflow Engine

Détail complet : **`docs/WORKFLOWS.md`**. En bref :
- Workflows en base (`workflows`, migration `20260929000001`) : QUAND
  (événement) → SI (conditions) → étapes (délai → conditions réévaluées
  à l'échéance → action), + `cancel_on`. Vocabulaire fermé
  (`workflow-definition.ts`) : une définition ne peut exécuter que les
  actions que le code sait faire ; toute modification est revalidée
  (400 détaillé).
- `WorkflowEngine` abonné à tous les événements ; exécutions tracées
  dans `workflow_runs` (étape courante, échéance, journal par étape) ;
  une exécution par (workflow, événement) ; une seule chaîne active par
  objet ; étapes immédiates dans le handler, étapes différées en jobs
  BullMQ retardés réarmés au démarrage.
- **Règle codée en dur de la Phase 13 migrée** : le module
  `qualification-dispatch` est supprimé, remplacé par les workflows
  livrés `qualification-required` (seuil de confiance 0,6 désormais
  modifiable) et `qualification-auto-send`. La suite e2e Events de la
  Phase 13 (dont la chaîne email réelle de bout en bout) passe inchangée.
- **Relances (section 39)** : workflow `qualification-reminders` —
  48 h → relance email, 24 h → relance WhatsApp, annulé à l'ouverture /
  début / complétion / révocation / expiration. Le token étant stocké
  haché, une relance envoie un **lien neuf** (`withFreshLink`) ; si
  l'envoi échoue, l'ancien token est restauré (le lien déjà reçu reste
  valide). Événement dédié `QUALIFICATION_REMINDER_SENT` (sinon la
  relance relancerait sa propre chaîne). Email de relance dans le fil
  d'origine. WhatsApp : template Meta approuvé requis hors fenêtre de
  24 h (`WHATSAPP_REMINDER_TEMPLATE`) — en attente du compte Meta.
- API `GET /workflows`, `/vocabulary`, `/:id`, `/:id/runs`
  (`workflows.read` : admins, directeurs), `PUT /:id` (`workflows.manage`
  : admins). Pas de création/suppression (section 46 : « plus tard »).

Frontend : `/workflows` (liste lisible « Quand … → Après 2 j → Relancer
le prospect ») et `/workflows/[id]` (Quand / Si / Alors / Annulé dès que,
édition des délais avec unité, des valeurs de conditions et de
l'activation pour les admins, tableau des exécutions avec journal).

Tests : 7 unitaires (validation du vocabulaire, évaluation des
conditions) ; **9 e2e réels** (`workflows.e2e-spec.ts`, délais raccourcis
en modifiant réellement le workflow par l'API puis restaurés) —
désactiver/réactiver la qualification sans code, relance email réelle
retrouvée par IMAP dont le nouveau lien fonctionne et l'ancien est
invalidé, étape WhatsApp ignorée sans numéro, annulation à l'ouverture
(aucune relance après l'échéance), remplacement de chaîne après
régénération, rejeu idempotent, restauration du lien sur échec, RBAC,
validation. Navigateur réel : 20 contrôles, axe sans violation.

Incidents d'environnement pendant la phase : Docker Desktop arrêté
(génération des types impossible, **Redis arrêté** — requis par l'API) :
relancé. Une **autre session Claude** travaille en parallèle dans le même
dépôt sur l'ingestion des formulaires de sites web (`apps/api/src/website/`,
migration `20260929100001`) — coordination par messages ; ses fichiers ne
font pas partie du commit de la Phase 15.

## Phase 16 — Matching équipe (+ analyse des réponses, section 40)

**Ajout de périmètre assumé** : l'analyse Claude des réponses de
qualification (section 40) n'avait été prise en charge par aucune phase
du plan (écartée en Phase 10). Or la chaîne de la section 45 — formulaire
complété → analyse Claude → qualifiée → matching — en dépend : sans elle,
le matching ne se serait jamais déclenché seul. Implémentée ici.

- **Analyse des réponses** (`qualification-analysis/`) : réponses
  lisibles (libellés) → Claude → verdict QUALIFIED/UNQUALIFIED/
  NEEDS_REVIEW, complexité, étape suivante, confiance, **compétences
  requises choisies dans le catalogue** (enum dans le schéma d'outil +
  revérification serveur). Confiance ≥ 0,6 → statut appliqué par l'IA ;
  sinon `QUALIFYING` + notification « Qualification à valider ». Jamais
  par-dessus une décision déjà prise. Workflow livré
  `qualification-analysis` (FORM_COMPLETED) + relance manuelle.
- **Profils** (`team/`, section 47) : compétences (niveau 1-5, années),
  disponibilité (une par collaborateur), langues parlées, pays, fuseau,
  expertise, historique des affectations. Chacun édite son propre
  profil ; `team.manage` (admins, responsable technique, chef de projet)
  édite celui des autres et le catalogue (32 compétences de départ).
- **Matching** (`matching/`, section 48) : l'IA détermine les
  compétences requises ; le score est **déterministe et explicable**
  (compétences × niveau 70, expérience similaire 10, disponibilité 15,
  langue 5), chaque point justifié (« + Next.js (niveau 5/5, 6 ans) »,
  « − disponibilité limitée »). Workflow livré `matching-on-qualified`
  (REQUEST_QUALIFIED) + relance manuelle (`matching.manage`).
- **Affectation = décision humaine** (section 6) :
  `request_team_members`, distincte de la recommandation (un nouveau
  matching ne touche jamais une affectation), idempotente, réversible,
  notifiée au collaborateur (règle critique), statut → `ASSIGNED`.
- Événements : QUALIFICATION_ANALYSIS_STARTED/COMPLETED, MATCHING_STARTED/
  COMPLETED, TEAM_MEMBER_ASSIGNED/UNASSIGNED (nouveau), tous dans la
  timeline.

Frontend : `/team` (recherche, filtre par compétence) et `/team/[id]`
(éditeurs compétences / disponibilité / profil, historique) ; sur la
fiche demande, cartes « Analyse des réponses » et « Matching équipe »
(score, barre, explication +/−, Affecter / Retirer, relance).

Bugs réels trouvés et corrigés pendant la phase :
- **Perte de données** : le remplacement des compétences supprimait puis
  insérait ; une compétence inconnue (404) laissait le profil **vide**.
  Remplacé par une fonction SQL atomique `replace_user_skills`
  (migration `200002`) qui valide avant d'écrire, en une transaction.
- **Relation un-à-un** : la contrainte unique sur `availability.user_id`
  fait que PostgREST renvoie un objet (ou null), plus un tableau. Le code
  lisait `[0]` : 500 sur un profil sans disponibilité, et surtout
  disponibilité **toujours ignorée** dans le score de matching (erreur
  silencieuse, trouvée parce qu'un test attendait « − disponibilité
  limitée »).

Tests : 5 unitaires (score explicable), **9 e2e réels**
(`matching.e2e-spec.ts`) — profils et droits d'édition, validation
(sans altérer le profil), catalogue, chaîne complète formulaire → Claude
→ QUALIFIED → matching avec classement et explications attendus,
affectation (droits, idempotence, notification, relance du matching
sans perte d'affectation, retrait), réponses vagues sans qualification
automatique, compétences requises demandées à Claude après une
qualification manuelle. Navigateur réel : 18 contrôles, axe sans
violation (profil en édition, liste, fiche avec matching).

Les tests réels WhatsApp (Phase 12) restent à faire dès que le compte
Meta existe. Suite : Phase 17 (ci-dessous).

**Checkpoints externes** :
1. ✅ Compte Supabase — fait (Phase 2).
2. ✅ Clé API Anthropic — fait (Phase 8).
3. ✅ Provider email — fait (Phase 11, compte Gmail).
4. ⏳ Compte Meta WhatsApp Business Cloud API — code prêt (Phase 12),
   credentials et tests réels en attente.

## Phase 17 — Opportunités (sections 45, 50)

> ⚠️ **Commitée sans la partie Claude du gate** (décision utilisateur du
> 05/10/2026 : « continuer sans Claude ») : le compte Anthropic n'a plus
> de crédit (« credit balance is too low »), donc toute analyse Claude
> échoue — régression e2e à 172/201, les 29 échecs étant les tests qui
> passent par Claude. **À refaire dès le crédit rétabli** : la régression
> e2e complète, dont les 3 tests de la chaîne formulaire → Claude →
> matching → opportunité. Tout le reste ci-dessous est vérifié en réel.

- **Module `opportunities/`** : pipeline `NEW → QUALIFIED →
  PROPOSAL_REQUIRED → PROPOSAL_SENT → NEGOTIATION → WON / LOST`, titre,
  description, valeur estimée, devise (déduite du pays du client ou de la
  demande : Suisse → CHF, Canada → CAD, sinon EUR), probabilité (celle de
  l'étape, ajustable), responsable, clôture prévue, motif de perte, date de
  clôture. Pas de suppression : une opportunité abandonnée passe à `LOST`.
  Toute transition est permise (réouverture comprise) ; le motif et la date
  de clôture ne survivent pas à une réouverture.
- **Création automatique** : workflow livré `opportunity-on-matching`
  (`MATCHING_COMPLETED`, demande `QUALIFIED` / `MATCHING` / `ASSIGNED`) →
  action `CREATE_OPPORTUNITY`. **Déclencheur tranché avec l'utilisateur** :
  `MATCHING_COMPLETED` et non `TEAM_MEMBER_ASSIGNED` (automatique, donc
  aucune demande qualifiée hors pipeline). Idempotente : index unique sur
  `request_id` + insertion qui retombe sur l'existante en cas de course.
  L'opportunité entre à l'étape « Qualifiée », reprend sujet, client,
  service, commercial assigné, et le résumé de l'analyse Claude en
  description. Création manuelle possible depuis le Kanban ou depuis une
  fiche demande (`POST /opportunities {requestId}`).
- **Statut de la demande** : workflow `request-status-on-opportunity-stage`
  → action `SYNC_REQUEST_STATUS` (devis à préparer, devis envoyé,
  négociation, gagnée, perdue). La Phase 18 n'aura qu'à faire avancer
  l'opportunité, la demande suivra.
- **Événements** : `OPPORTUNITY_CREATED`, `OPPORTUNITY_STAGE_CHANGED`
  (toujours), `OPPORTUNITY_WON` / `OPPORTUNITY_LOST` (jalons, en plus),
  portés par l'entité `opportunity` avec `request_id` renseigné : visibles
  dans la timeline de la demande **et** dans celle de l'opportunité
  (`GET /opportunities/:id/timeline`). Déposer une carte dans sa propre
  colonne ne trace rien ; deux déplacements simultanés ne produisent qu'un
  événement (mise à jour filtrée sur l'étape lue).
- **Notifications** : le dispatcher sait désormais notifier pour une
  opportunité (lien `/opportunities/:id`, y compris sans demande
  d'origine) ; « Commercial » = responsable de l'opportunité. Créée →
  commercial + responsable ; étape → commercial ; gagnée → commercial +
  responsable (in-app + email) ; perdue → commercial + responsable.
- **Permissions** : `opportunities.read` (tous sauf collaborateur),
  `opportunities.manage` (admins, commerciaux).
- **Écarts de schéma corrigés** (migrations `20261004000001/2`) :
  `client_id` nullable (un prospect entrant n'a pas de fiche client),
  colonnes `title`, `description`, `probability`, `lost_reason`,
  `closed_at`, `request_id` en cascade. Détail : `docs/DATABASE.md` §9.

Frontend : `/opportunities` — Kanban 7 colonnes (compteur, total par
devise, valeur pondérée), recherche, filtre par responsable, création.
Déplacement : glisser-déposer souris / tactile (appui maintenu) / clavier
(`@dnd-kit/core` : Espace, ← →, Espace ; Échap annule ; annonces en
français), **et** une liste d'étapes sur chaque carte (indispensable sur
mobile). Mise à jour optimiste, annulée si l'API refuse. « Perdue »
demande confirmation et un motif facultatif. `/opportunities/[id]` : étape
(boutons), informations éditables, historique. Carte « Opportunité » sur
la fiche demande, « Opportunités » sur la fiche client (section 49).
`TimelineCard` est désormais un composant partagé (`components/`).

Piège rencontré : dans une zone à défilement horizontal, les textes
`sr-only` (en `position: absolute`) des colonnes hors écran échappent au
défilement si la zone n'est pas `relative` — toute la page s'élargissait
sur mobile (trouvé par le contrôle « pas de défilement horizontal »).

Tests : 2 unitaires (devise par pays) ; **10 e2e réels**
(`opportunities.e2e-spec.ts`) — droits et validation, valeurs par défaut,
modification, changement d'étape persistant et tracé une seule fois,
gagnée / rouverte / perdue avec motif et notifications, Kanban (ordre,
totaux, filtres), création automatique après une qualification manuelle
et synchronisation du statut de la demande, matching sur demande non
qualifiée sans opportunité — **7 passent ; les 3 de la chaîne complète via
Claude attendent le crédit Anthropic**. Navigateur réel (Playwright + axe,
serveurs de dev) : **39 contrôles, axe sans violation** — Kanban,
glisser souris avec défilement automatique du pipeline, glisser clavier,
annonce lecteur d'écran, Échap, liste d'étapes, dialogue de perte (confirmé
et annulé), création, fiche (étape, édition, timeline), fiches demande et
client, mobile 390 px (pas de débordement, changement d'étape), observateur
en lecture seule.


## Phase 18 — Devis (section 51)

> ⚠️ **Sans la proposition par l'IA** (décision « continuer sans Claude »,
> compte Anthropic sans crédit) : la pré-rédaction d'un devis par Claude
> depuis l'opportunité et les réponses de qualification reste à faire
> (nouveau prompt versionné `quote-proposal@1`, bouton « Proposer un
> contenu » dans l'éditeur, brouillon uniquement). Tout le reste est livré
> et vérifié en réel.

- **Module `quotes/`** : `DRAFT → SENT → ACCEPTED / REJECTED` (+ `EXPIRED`
  déduit de la date de validité). Un devis naît d'une opportunité **qui a
  un client** (400 sinon), en brouillon, avec la devise de l'opportunité,
  le taux de TVA et la durée de validité de l'entreprise.
- **Human in the loop (section 6)** : rien ne part sans action explicite.
  L'envoi (`POST /quotes/:id/send`) est déclenché par un utilisateur, qui
  choisit le destinataire ; l'acceptation et le refus sont enregistrés par
  un utilisateur.
- **Totaux côté serveur** : `computeQuoteTotals` (`@kps/shared`) ; l'API
  refuse tout total fourni par le client. L'éditeur affiche un aperçu avec
  la même fonction.
- **PDF réel** (`pdfkit`, texte sélectionnable, A4, pagination des lignes) :
  identité de l'entreprise, destinataire, lignes, remise, TVA, total,
  remarques, conditions, IBAN.
- **Envoi par email réel** avec le PDF joint ; si l'email échoue, le devis
  reste en brouillon (502). Chaque envoi fige une **version** (instantané
  complet). Un devis envoyé ne se modifie pas : « Réviser » le repasse en
  brouillon (`QUOTE_REVISED`), le prochain envoi crée la version suivante.
- **Identité de l'entreprise** (`company/`, `/settings`) : raison sociale,
  adresse, TVA, IBAN, taux par défaut, validité, conditions. **Aucune
  valeur inventée** : la ligne est créée vide, et sans raison sociale aucun
  PDF ni envoi n'est possible. **À renseigner par l'utilisateur** avant le
  premier vrai devis.
- **Chaîne** : devis créé / envoyé / accepté / refusé → opportunité
  (workflows `opportunity-stage-on-quote-*`, action
  `SET_OPPORTUNITY_STAGE`) → demande (workflow de la Phase 17).
- **Événements** `QUOTE_CREATED`, `QUOTE_SENT`, `QUOTE_REVISED` (nouveau),
  `QUOTE_ACCEPTED`, `QUOTE_REJECTED`, sur l'entité `quote`, visibles dans
  les timelines du devis et de la demande. Notifications : envoyé, accepté
  (in-app + email), refusé.
- **Permissions** : `quotes.read`, `quotes.manage` (admins, commerciaux),
  `settings.manage` (admins).
- Dates des devis au fuseau `Europe/Zurich` (constante dans
  `quotes.service.ts`).

Frontend : `/quotes` (recherche, filtre par statut), `/quotes/[id]`
(éditeur de lignes avec aperçu des totaux, envoi, PDF, refus avec motif,
révision, versions avec leur PDF, historique), carte « Devis » sur les
fiches opportunité (création) et client, carte « Entreprise » dans
Paramètres (lecture seule hors administrateurs).

Limites connues : pas de lien d'acceptation en ligne pour le client
(l'équipe enregistre sa réponse) ; l'email du devis n'est pas rattaché à
la conversation de la demande ; pas de logo sur le PDF (à ajouter avec le
stockage de fichiers, Phase 20) ; `QUOTE_REQUIRED` (catalogue section 4)
n'est émis par rien.

Tests : 4 unitaires (calcul, mise en forme) ; **12 e2e réels**
(`quotes.e2e-spec.ts`, tous verts, aucun ne dépend de Claude) — identité
de l'entreprise, création, totaux serveur, PDF relu (`pdf-parse`), email
reçu par IMAP avec PDF joint relu, versions, refus, acceptation, statuts
409, liste et expiration, devis d'une demande. Navigateur réel : **42
contrôles, axe sans violation** (paramètres, création, éditeur, PDF
téléchargés, envoi, refus, révision, acceptation, liste, mobile 390 px,
observateur).


## Phase 19 — Missions & tâches (sections 45, 52, 53)

Aucune partie de cette phase ne dépend de Claude.

- **Module `missions/`** : `PLANNED → IN_PROGRESS → BLOCKED → ON_HOLD →
  COMPLETED / CANCELLED` (toute transition permise), titre, client,
  service, chef de projet, équipe (`mission_members`, rôle libre), dates,
  priorité, budget. Pas de suppression (statut « Annulée »).
- **Création automatique** : workflow `mission-on-opportunity-won` →
  action `CREATE_MISSION`, idempotente (index unique par opportunité).
  La mission reprend l'**équipe affectée à la demande** (Phase 16), et
  son budget = montant HT du devis accepté, sinon la valeur estimée. La
  demande passe à « Convertie en mission »
  (`request-converted-on-mission-created`).
- **Human in the loop** : le chef de projet n'est pas choisi
  automatiquement — tous les chefs de projet sont notifiés, l'un d'eux est
  désigné à la main (seuls les rôles avec `missions.manage` peuvent l'être).
- **Tâches** (`tasks.service.ts`) : titre, responsable (obligatoirement
  dans l'équipe ou chef de projet), échéance, priorité, statut,
  commentaires. `missions.manage` pilote tout ; **le responsable d'une
  tâche peut en changer le statut, et rien d'autre** ; toute l'équipe de la
  mission peut commenter.
- **Événements** (entité `mission`, rattachés à la demande d'origine) :
  `MISSION_CREATED`, `MISSION_ASSIGNED` (membre ajouté ou chef de projet
  désigné), `MISSION_MEMBER_REMOVED` (nouveau), `MISSION_STATUS_CHANGED`,
  `MISSION_BLOCKED` (en plus, avec motif), `TASK_CREATED`, `TASK_ASSIGNED`,
  `TASK_STATUS_CHANGED` (nouveaux). Timeline : `GET /missions/:id/timeline`.
- **Notifications** : nouvelle audience « Chef de projet » ; mission créée,
  ajout à une mission, mission bloquée (in-app + email), tâche confiée
  (in-app, avec l'échéance).
- **Permissions** : `missions.read` (tous les rôles, collaborateurs
  compris), `missions.manage` (admins, chefs de projet, responsables
  techniques).
- **Profils équipe** : `GET /team/:id` renvoie désormais `missions`
  (membre ou chef de projet), affichées sur `/team/[id]`.

Frontend : `/missions` (recherche, statut, « Mes missions », création),
`/missions/[id]` (statut avec motif de blocage, informations, équipe,
tâches avec avancement / retard signalé / commentaires, historique),
carte « Mission » sur la fiche opportunité (se rafraîchit seule après
« Gagnée »), « Missions » sur la fiche client.

Piège rencontré : un DTO instancié par `class-transformer` expose **toutes**
ses propriétés (valeur `undefined`) — tester « seul le statut est fourni »
avec `Object.keys(dto)` refusait tout au responsable d'une tâche. Tester
les valeurs définies.

Limites connues : pas de pièces jointes aux tâches (Phase 20) ; pas
d'événement à la suppression d'une tâche ni à l'ajout d'un commentaire ;
pas de rappel automatique d'échéance.

Tests : **10 e2e réels** (`missions.e2e-spec.ts`, tous verts) — droits,
pilotage, équipe, tâches et droits du responsable, commentaires, statut et
blocage notifié, retrait d'un membre, filtres et profils, chaîne
opportunité gagnée → mission (équipe, budget du devis accepté, demande
convertie), idempotence. Navigateur réel : **29 contrôles, axe sans
violation** — pilote (desktop), collaborateur (mobile 390 px, ne peut que
terminer sa tâche), observateur (lecture seule). Deux échecs intermittents
non reproduits pendant la mise au point du scénario (enregistrement des
informations, dialogue de blocage), puis trois exécutions vertes de suite.

**Page d'accueil (`/dashboard`, demande utilisateur du 05/10/2026)** :
les modules des Phases 17 à 19 y apparaissent — quatre indicateurs
cliquables (opportunités en cours et valeur pondérée, devis en attente de
réponse, missions en cours avec alerte « bloquée(s) », mes tâches ouvertes
avec alerte « en retard »), puis « Mes tâches » (`GET /tasks/mine`),
« Missions en cours », « Pipeline commercial » (tableau par étape) et
« Derniers devis ». Chaque bloc n'apparaît que si l'utilisateur a le droit
de lire le module ; alertes dites en toutes lettres, jamais par la seule
couleur. Vérifié en navigateur : 14 contrôles (chiffres recoupés avec
l'API, collaborateur sur mobile), axe sans violation. Les graphiques et
métriques agrégées restent l'objet de la Phase 21.


## Phase 20 — Documents (sections 54, 55, 60)

> ⚠️ **Sans l'analyse IA d'un document** (section 55 : cahier des charges
> PDF → informations structurées) — reportée, compte Anthropic sans
> crédit. À faire : extraction du texte du PDF, prompt versionné
> `document-analysis@1`, résultat rattaché à la demande ou à
> l'opportunité, job `DOCUMENT_PROCESSING`.

- **Module `documents/`** : dépôt, liste, téléchargement, suppression,
  pour six types d'objet — demande, opportunité, devis, mission, **tâche**
  (les pièces jointes de la section 53) et client.
- **Supabase Storage réel**, bucket privé `documents` créé au démarrage
  s'il manque ; téléchargement par **lien signé de 60 s**.
- **Droits hérités de l'objet** et **contrôle des fichiers** (type,
  extension, signature du contenu, 15 Mo) : détail dans `docs/SECURITY.md`.
- **Événements** `DOCUMENT_UPLOADED` / `DOCUMENT_DELETED`, portés par
  l'objet concerné (la mission pour une pièce jointe de tâche), donc
  visibles dans son historique et dans celui de la demande d'origine.
- **Permissions** : `documents.read` (tous les rôles), `documents.manage`
  (tous sauf l'observateur).

Frontend : carte « Documents » sur les fiches demande, opportunité, devis,
mission et client ; « Pièces jointes » dans le dialogue d'une tâche.

Bug réel trouvé par le test navigateur : ouvert directement, un lien signé
Supabase donne au fichier un nom encodé (« %C3%A9t%C3%A9.pdf ») dès qu'il
contient un accent. L'interface récupère donc le fichier puis l'enregistre
sous son nom d'origine.

Tests : 5 unitaires (contrôle des fichiers, noms) ; **9 e2e réels**
(`documents.e2e-spec.ts`) — bucket privé, refus (droits, type, exécutable
renommé, extension, vide, 413), dépôt relu dans le stockage, droits par
objet, lien signé (fichier identique octet pour octet, rien d'accessible
sans signature), mission et tâche, suppression (fichier réellement
effacé), client. Navigateur réel : **19 contrôles, axe sans violation**
(dépôt, téléchargement, refus expliqué, suppression, pièce jointe d'une
tâche, mobile avec nom très long, observateur).


## Phase 21 — Dashboard & reports (section 56)

Aucune partie de cette phase ne dépend de Claude.

- **Agrégats en SQL** : fonction `report_overview(p_from, p_to)` (détail
  dans `docs/DATABASE.md` §13bis). L'API (`reports/`) ne fait que valider
  la période et transmettre.
- **Page `/reports`** : période (7 / 30 / 90 jours, 12 mois, ou dates
  libres), huit indicateurs de la section 56 répartis en « Sur la
  période » (demandes reçues dont aujourd'hui, qualifiées, taux et délai
  moyen de qualification) et « En ce moment » (à qualifier, opportunités
  ouvertes, missions actives, nouveaux prospects), puis sept graphiques :
  demandes par jour (courbe Recharts), conversion, par canal, par service,
  par pays, opportunités par étape, missions par statut.
- **Choix de représentation** : une seule teinte (chaque graphique compare
  une même mesure), valeurs écrites au bout des barres, segments droits
  pour la courbe (une courbe lissée invente des valeurs entre deux jours),
  barres horizontales en HTML pour tout ce qui a des libellés (en colonnes,
  les sept étapes du pipeline se chevauchaient). Chaque graphique a son
  tableau « Voir les données » ; une période sans demande le dit au lieu
  d'afficher un graphique vide.
- **Permission** `reports.read` : tous les rôles sauf collaborateur.
- La page d'accueil (`/dashboard`) garde ses indicateurs opérationnels
  (Phases 17-19) ; les rapports sont l'analyse sur une période.

Tests : **4 e2e réels** (`reports.e2e-spec.ts`) sur une fenêtre passée
isolée (mars 2019) peuplée directement en base — volumes, répartitions,
conversion, délai (première qualification seulement), bornes incluses,
découpage des jours au fuseau de Zurich (23 h 30 et 00 h 30), période
vide ; **chiffres d'état courant recoupés avec des requêtes indépendantes**
sur la base (DoD de la phase). Navigateur réel : **15 contrôles, axe sans
violation** (indicateurs, graphiques, info-bulle, tableau de données,
période vide, mobile avec un compte observateur).

Limites connues : pas d'export (CSV / PDF) ; pas de comparaison avec la
période précédente ; les valeurs en devises ne sont pas agrégées dans les
rapports (plusieurs devises) — elles restent sur le Kanban et l'accueil.

**Limite d'envoi Gmail atteinte le 05/10/2026** : le compte Gmail de test
(aussi utilisé par l'application en dev) a renvoyé `550 5.4.5 Daily user
sending limit exceeded` après les nombreuses exécutions de tests de la
journée. Tant que le quota n'est pas revenu (environ 24 h), aucun email ne
part : notifications, liens de qualification, devis. Les tests qui envoient
un email échouent pour cette seule raison. Ne pas enchaîner plusieurs
régressions complètes dans la même journée avec ce compte.


## Phase 22 — i18n & RGPD (sections 65, 66)

> ⚠️ **Phase livrée en partie.** Fait : tout ce qui touche le **prospect**
> (langue de ses communications, page publique FR/EN, consentement) et le
> **RGPD** (export, effacement, audit). **Reste à faire** : l'interface
> interne en anglais (toutes les pages de l'application sont encore en
> français, sans sélecteur de langue), les notifications à l'équipe en
> anglais (templates EN + libellés calculés par le dispatcher), le PDF du
> devis en anglais, et la traduction du contenu des formulaires (les
> questions restent dans la langue où elles ont été rédigées).

**Langue du prospect (section 65)**
- `prospectLanguage()` (`@kps/shared`) : `en` si la langue de la demande
  commence par « en », sinon `fr`. La langue de la demande vient de
  l'analyse IA, du formulaire du site (`locale`) ou d'une saisie manuelle —
  **sans crédit Anthropic, les demandes entrantes par email ne sont pas
  détectées** et restent en français.
- Emails au prospect en FR / EN : qualification, relance, envoi de devis
  (`email/templates/`). Le texte français reste celui de la spec. WhatsApp :
  message texte FR / EN, et code de langue du template de relance.
- Page publique `/qualification/[token]` : textes d'interface FR / EN
  (`lib/qualification-copy.ts`), langue = celle de la demande (pas celle du
  navigateur), bascule « English / Français » sans perte de saisie,
  attribut `lang` correct.

**RGPD (section 66)** — détail, périmètre de l'effacement et limites :
`docs/SECURITY.md`, section « RGPD ».
- Consentement obligatoire, daté et versionné (`CONSENT_VERSION`).
- Export JSON et effacement d'un contact (`privacy/`, fonction SQL
  `anonymize_contact`), réservés à `privacy.manage` (administrateurs),
  tracés dans `audit_logs` — **premier usage réel de cette table**.
- UI : sur la fiche client, deux actions par contact (exporter, effacer
  avec confirmation), badge « Données effacées ».

**Changement d'API à connaître** : `POST /public/qualification/:token/submit`
exige `{consent: true}`. Toute intégration qui soumettrait le formulaire
sans passer par la page publique doit l'envoyer.

Tests : 5 unitaires (langue, textes FR / EN, échappement HTML) ; **8 e2e
réels** (`privacy.e2e-spec.ts`) — langue de la page, consentement refusé
puis enregistré, droits, export complet et tracé, effacement vérifié table
par table et dans le stockage (plus aucune occurrence du nom, de l'email ou
du téléphone), objets commerciaux conservés, audit sans donnée personnelle,
409 au rejeu. Navigateur réel : **19 contrôles, axe sans violation** (page
publique dans les deux langues, bascule, consentement, mobile, export
téléchargé et relu, effacement avec annulation puis confirmation,
observateur).

Prochaine étape : finir l'i18n interne (voir l'encadré), ou **Phase 23 —
Audit & observabilité** (étendre `audit_logs` aux autres actions sensibles,
identifiants de corrélation dans les logs).

## Intégration des sites web (akoraweb) — demandes reçues par API

Les formulaires du site akoraweb (dépôt `KPS/akoraweb`) —
demande de devis (`/api/contact`) et brief de refonte LinkedIn — sont
transmis à KPS en plus de leur enregistrement Supabase et de l'email de
notification existants (`akoraweb/lib/kps.ts`, non bloquant, timeout 8 s).

Backend (`apps/api/src/website/`) :
- `POST /api/v1/webhooks/website/:site` signé (voir `docs/API.md` et
  `docs/SECURITY.md` §5), un secret par site dans `WEBSITE_WEBHOOK_SECRETS`.
- Demande `source=WEBSITE`, `channel=<site>`, message d'origine = message
  libre + réponses du formulaire en « libellé : valeur ». Idempotence :
  `requests.website_submission_id` (migration `20260929100001`).
- Le prospect a donné son email : une conversation **EMAIL** démarre à son
  nom, donc les workflows existants (qualification requise → envoi du
  lien par email → relances) s'appliquent sans changement.
- Contact existant rattaché par email, puis par téléphone.
- Réponse immédiate au site ; l'analyse IA tourne en arrière-plan.

Tests : 9 unitaires (signature, fenêtre de rejeu, secrets par site) et
5 e2e réels (`website.e2e-spec.ts`) : chaîne complète jusqu'au lien de
qualification envoyé, rejeu idempotent, rattachement au contact,
signatures refusées, payload invalide.

Limite connue : un envoi qui échoue côté site (KPS injoignable) n'est pas
rejoué automatiquement — la demande reste dans Supabase akoraweb et dans
l'email de notification, mais pas dans KPS.

## Commandes utiles

```bash
pnpm install
docker compose up -d redis   # Redis (file BullMQ), requis par l'API depuis la Phase 14
pnpm db:migrate    # applique les migrations SQL en attente (supabase/migrations/*.sql)
pnpm dev            # web + api en parallèle (ne pas lancer `pnpm build` en même temps)
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
