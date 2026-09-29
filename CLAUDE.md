# CLAUDE.md — KPS Intelligence

Contexte de reprise pour toute session Claude Code (locale ou cloud).
Lire ce fichier en entier avant de toucher au code. Détails complets,
phase par phase : `docs/AI_CONTEXT.md`. Cahier des charges : `prompt.md`
(2896 lignes, les numéros de « section » cités partout y renvoient).

## Le projet en une phrase

Plateforme interne de **KPS Agency** : chaque demande entrante (email,
WhatsApp, site web, saisie manuelle) est analysée par Claude, qualifiée
par un formulaire envoyé au prospect via un lien sécurisé, matchée avec
l'équipe, puis doit devenir opportunité → devis → mission — le tout
event-driven, traçable, sécurisé.

## Règles absolues (non négociables)

1. **Aucun mock** dans le code ni dans les tests d'intégration : vraie
   base Supabase, vrai Claude, vrais emails (SMTP/IMAP), vrai Redis.
   Pas d'IA simulée, pas d'email/WhatsApp simulé, pas de bouton factice,
   pas de TODO laissé dans le code.
2. **Une phase = implémentée + testée en réel + documentée + commitée.**
   Gate obligatoire avant chaque commit : `pnpm lint && pnpm typecheck
   && pnpm test && pnpm build`, **+ la régression e2e complète**
   (`pnpm --filter @kps/api test:e2e`) **+ un test navigateur réel**
   (Playwright + axe) pour toute UI.
3. **RBAC vérifié côté serveur uniquement** (`@RequirePermissions`),
   permissions en base (`role_permissions`), jamais codées en dur.
4. **Toute règle métier passe par l'Event Bus / le Workflow Engine**,
   jamais d'appel direct d'un module métier à un autre pour une réaction.
5. **Human in the loop (section 6)** : devis, prix, affectation
   définitive, engagement d'une ressource = validation humaine.
6. Checkpoint utilisateur **avant** toute phase qui dépend d'un compte
   externe : obtenir les vrais identifiants, ne jamais contourner.
7. Langue : code en anglais, **commentaires, docs, UI et messages de
   commit en français**. Commentaires : seulement le « pourquoi » non
   évident. Commits : `feat(<module>): Phase N — …` + trailer
   `Co-Authored-By`.
8. `.env` n'est jamais commité ; `.env.example` sans aucune valeur secrète.

## État d'avancement (au 29/09/2026)

Phases **0 à 16 terminées** et poussées sur `main`
(`github.com/kps-agency/kps-intelligence`). Régression e2e : 13 suites,
191/191. Tests unitaires : 54.

| Phase | Contenu | État |
|---|---|---|
| 0-5 | Monorepo, archi/DB docs, Supabase + migrations, Auth/RBAC, NestJS, Next.js + design system | ✅ |
| 6-7 | CRM clients/contacts, demandes (source MANUAL) | ✅ |
| 8 | AIService Claude (analyse de demande) | ✅ |
| 9-10 | Services, form builder, liens de qualification publics | ✅ |
| 11 | Email : ingestion IMAP (Gmail) + envoi SMTP | ✅ |
| 12 | WhatsApp Cloud API | ⚠️ code prêt, **jamais testé en réel** (pas de compte Meta) |
| 13 | Event Bus + timeline | ✅ |
| 14 | Notifications in-app + email (BullMQ) | ✅ |
| 15 | Workflow Engine configurable + relances | ✅ |
| — | Ingestion formulaires sites web (akoraweb), webhook signé | ✅ |
| 16 | Analyse des réponses (section 40) + équipe + matching explicable | ✅ |
| **17** | **Opportunités** | ⏭️ prochaine |
| 18-25 | Devis, missions, documents, dashboard, i18n/RGPD, audit, tests, prod | à faire |

## Mise en route (environnement cloud)

```bash
pnpm install
cp .env.example .env    # puis renseigner les valeurs (voir ci-dessous)
# Redis (requis par l'API : files BullMQ notifications + workflows)
docker compose up -d redis
#   sans Docker :  apt-get install -y redis-server && redis-server --daemonize yes
#   ou un Redis managé (Upstash...) → REDIS_URL=rediss://...
pnpm --filter @kps/types build && pnpm --filter @kps/shared build
pnpm db:migrate         # applique les migrations en attente (idempotent)
pnpm dev                # web :3000 + api :4000
```

**Secrets à fournir** (à demander à l'utilisateur, jamais à inventer) —
noms exacts dans `.env.example` : Supabase (`DATABASE_URL` = Session
Pooler IPv4, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`, `NEXT_PUBLIC_*`),
`ANTHROPIC_API_KEY`, SMTP/IMAP (compte Gmail + mot de passe
d'application), `E2E_ADMIN_*` / `E2E_VIEWER_*` (comptes de test réels),
`WEBSITE_WEBHOOK_SECRETS`. WhatsApp : vide tant que le compte Meta
n'existe pas (l'API démarre quand même et refuse proprement).

**Régénérer les types Supabase** après une migration :
`pnpm db:gen-types` — utilise le CLI Supabase **et Docker**. Sans Docker :
`supabase gen types typescript --project-id <ref> --schema public >
packages/types/src/supabase.generated.ts` (nécessite
`SUPABASE_ACCESS_TOKEN`). Puis `pnpm --filter @kps/types build`.
**Ne jamais éditer `supabase.generated.ts` à la main.**

**Tests navigateur** : Playwright + `@axe-core/playwright`
(`npx playwright install chromium`). Scénarios des phases précédentes :
voir la section « Vérifié en navigateur » de chaque phase dans
`docs/AI_CONTEXT.md`. Pratique utilisée : build de prod servi sur des
ports isolés (API 4100, web 3100 avec `NEXT_PUBLIC_API_URL`) pour ne pas
toucher au `pnpm dev` de l'utilisateur.

## Architecture à respecter

```
apps/api/src/
  events/          EventBus (emit → persiste dans `events` → handlers), timeline
  workflows/       WorkflowEngine : workflows en base, vocabulaire fermé
                   (workflow-definition.ts), actions (workflow-actions.service.ts),
                   étapes différées BullMQ
  notifications/   règles (notification-rules.ts) → dispatcher → in-app / email BullMQ
  ai/              AIService (interface) + AnthropicAiService + prompts versionnés
  requests/ qualification-sessions/ qualification-analysis/ matching/ team/
  email/ whatsapp/ website/ conversations/ clients/ contacts/ forms/ services/
apps/web/src/app/(app)/   pages authentifiées ; lib/queries/ = hooks TanStack Query
packages/types/           contrats partagés (api-contracts.ts, enums.ts)
supabase/migrations/      SQL horodaté, appliqué par `pnpm db:migrate`
```

**Ajouter une étape métier** (modèle à suivre pour les phases 17+) :
1. Événement dans `EventType` (`packages/types/src/enums.ts`) **et** dans
   l'enum SQL (`alter type event_type add value ...`).
2. Le service émet l'événement via `EventBus.emit` avec un **acteur
   explicite** (`userActor(user)`, `AI_ACTOR`, `SYSTEM_ACTOR`,
   `AUTOMATION_ACTOR`) et `requestId` renseigné (timeline).
3. Réaction automatique → **action** dans `ACTION_TYPES` +
   `WorkflowActionsService`, puis **workflow livré** seedé par migration
   (clé stable), jamais un appel direct.
4. Notification → règle dans `notification-rules.ts` + templates FR en
   base (`notification_templates`, IN_APP + EMAIL).
5. Libellé dans la timeline (`request-timeline-card.tsx`).
6. Permissions nouvelles → migration `permissions` + `role_permissions`.

## Pièges déjà rencontrés (ne pas les refaire)

- **Ne jamais lancer `pnpm build` pendant `pnpm dev`** : `next build`
  écrase le `.next` partagé et casse le serveur de dev (chunks 404).
- Enums TS string : un littéral n'est pas assignable à l'enum → utiliser
  `EnumName.VALUE` côté web/API.
- Sélections Supabase typées : la chaîne de `select()` doit être **un
  seul littéral** (pas de concaténation). FK ambiguës :
  `users!<table>_<col>_fkey(...)`.
- **Relation un-à-un** (contrainte unique sur la FK, ex.
  `availability.user_id`) : PostgREST renvoie **un objet ou null**, pas
  un tableau.
- Remplacements « supprimer puis insérer » → **fonction SQL atomique**
  (voir `replace_user_skills`).
- BullMQ 6 : installer `ioredis` explicitement ; `jobId` sans `:` ;
  toujours écouter `error` sur Queue et Worker (sinon crash de l'API).
- Idempotence : clé unique en base (`upsert ... ignoreDuplicates`) **et**
  pas de recalcul des destinataires/décisions lors d'un rejeu.
- Handlers asynchrones : les tests attendent `EventBus.whenIdle()` ; les
  traces `TEAM_NOTIFIED` peuvent s'intercaler dans la timeline.
- Tests e2e contre la **base de dev partagée** : préfixer les données
  (`e2e-<module>-<timestamp>`), tout nettoyer en `afterAll`, comptes de
  test = alias `+tag` de la boîte Gmail de test (emails réels, jamais
  vers un tiers), restaurer toute définition modifiée (workflows).
- Emails automatiques (rebonds, absences) filtrés à l'ingestion
  (`isAutomated`).
- Plusieurs sessions Claude peuvent travailler dans le même dépôt :
  `git status` avant tout commit, ne committer que ses propres fichiers.

## Plan de développement restant

Les tables des Phases 17 à 20 et 23 existent déjà (migrations `…000010`
à `…000014`, enums `opportunity_status`, `quote_status`,
`mission_status`, `task_status`) : partir de `docs/DATABASE.md` et
compléter par migration plutôt que recréer.

Chaque phase : checkpoint éventuel → migration(s) → API + événements +
workflows + notifications → UI → e2e réels → navigateur (axe, mobile)
→ docs (`AI_CONTEXT.md` + doc thématique + `API.md`) → gate → commit →
push.

### Phase 17 — Opportunités (sections 50, 45)
- Module `opportunities` : pipeline `NEW → QUALIFIED → PROPOSAL_REQUIRED
  → PROPOSAL_SENT → NEGOTIATION → WON / LOST` (table et enum existants),
  valeur estimée, probabilité, responsable, liens demande/client.
- **Création automatique** : workflow livré sur `TEAM_MEMBER_ASSIGNED`
  ou `MATCHING_COMPLETED` d'une demande qualifiée (à trancher, le
  documenter) → action `CREATE_OPPORTUNITY` idempotente (une par demande).
- Événements `OPPORTUNITY_CREATED`, `OPPORTUNITY_STAGE_CHANGED`,
  `OPPORTUNITY_WON`, `OPPORTUNITY_LOST` ; notifications commercial /
  responsable.
- UI `/opportunities` en **Kanban drag & drop persistant** (accessible au
  clavier) + `/opportunities/[id]` ; lien depuis la fiche demande.
- DoD : glisser une carte change réellement l'étape en base et dans la
  timeline ; création automatique vérifiée sur la chaîne complète.

### Phase 18 — Devis (section 51)
- `quotes` / `quote_items` / `quote_versions` : lignes, prix, remise,
  taxes (TVA suisse), totaux calculés côté serveur, versions.
- IA : proposition de devis pré-remplie depuis l'opportunité/les réponses
  (nouveau prompt versionné) — **jamais envoyée sans validation humaine** :
  le devis reste `DRAFT` (demande `QUOTE_PENDING`) jusqu'à l'envoi
  explicite par un utilisateur (`SENT`, demande `QUOTE_SENT`).
- PDF réel (génération serveur) téléchargeable ; envoi par email réel
  au client ; `QUOTE_ACCEPTED` / `QUOTE_REJECTED`.
- DoD : devis créé, PDF téléchargé et ouvert, email reçu (IMAP),
  historique des versions consultable.

### Phase 19 — Missions & tâches (sections 52-53)
- `missions` (`PLANNED → IN_PROGRESS → BLOCKED → ON_HOLD → COMPLETED /
  CANCELLED`), `tasks` (responsable, échéance, priorité, commentaires).
- Workflow livré : `OPPORTUNITY_WON` → mission créée avec l'équipe
  affectée (`request_team_members`) → notification chef de projet + équipe.
- UI `/missions`, `/missions/[id]` ; l'historique de projets des profils
  équipe (Phase 16) s'enrichit des missions.

### Phase 20 — Documents (sections 54-55)
- Supabase Storage réel, association polymorphe (demande, opportunité,
  devis, mission, client), accès contrôlé (URLs signées + RBAC).
- Analyse IA réelle d'au moins un type (cahier des charges PDF →
  informations structurées).

### Phase 21 — Dashboard & reports (section 56)
- Métriques agrégées en SQL (vues), graphiques Recharts : volume par
  service/canal/pays, taux de conversion demande → qualifiée → gagnée,
  délais. DoD : chiffres recoupés avec des requêtes SQL manuelles.

### Phase 22 — i18n & RGPD (sections 65-66)
- FR/EN de l'interface ; communications au prospect dans sa langue
  détectée (templates email/WhatsApp/notifications EN à ajouter).
- RGPD : consentement, export et suppression des données personnelles
  (le journal `events` autorise déjà la suppression), minimisation.

### Phase 23 — Audit & observabilité (sections 61, 67)
- `audit_logs` réels sur les actions sensibles ; propagation
  `requestId` / `eventId` / `workflowRunId` / `notificationId` dans les
  logs. DoD : un parcours complet reconstructible depuis logs + audit.

### Phase 24 — Tests complets (sections 69-72)
- Chaîne e2e complète email → … → mission ; tests frontend (section 70) ;
  données de démo réalistes (seed).

### Phase 25 — Sécurité, Docker, CI/CD, production (sections 60, 73-76)
- Audit sécurité ; `Dockerfile`s + `docker-compose.yml` complet (web, api,
  redis ; Supabase distant) ; pipeline CI (install → lint → typecheck →
  unit → e2e → build → sécurité) ; `DEPLOYMENT.md` (VPS) ; finalisation
  de toute la documentation.

## En attente côté utilisateur (à ne pas oublier)

- **Compte Meta WhatsApp Business** : identifiants + webhook HTTPS public
  → écrire `whatsapp.e2e-spec.ts` (Phase 12 jamais vérifiée en réel), et
  un **template approuvé** pour les relances WhatsApp
  (`WHATSAPP_REMINDER_TEMPLATE`) et les futures notifications WhatsApp.
- Le provider email est un **Gmail personnel** (interim) : à remplacer
  par un provider transactionnel avec webhook entrant avant la prod.
