# DATABASE.md — Schéma PostgreSQL (Supabase)

Ce document est la source de vérité du schéma relationnel avant écriture
des migrations SQL (Phase 2). Toute table ci-dessous est réelle et
relationnelle — aucune donnée métier structurée n'est stockée en JSON par
défaut ; le JSONB n'est utilisé que là où la variabilité est intrinsèque
au domaine (réponses de formulaire dynamique, payload d'événement,
snapshot de version de devis, options de champ de formulaire).

Conventions :
- Toutes les tables ont `id uuid primary key default gen_random_uuid()`.
- `created_at timestamptz not null default now()` partout ; `updated_at`
  quand la ligne est mutable, mis à jour par trigger `updated_at`.
- Toutes les FK sont `on delete restrict` par défaut, sauf mention
  contraire (ex. suppression en cascade des lignes enfants type
  `quote_items`, `form_fields`).
- Les enums métier sont des types Postgres `ENUM`, alignés 1:1 sur
  `packages/types/src/enums.ts` — **ce fichier TypeScript est la source de
  vérité**, les migrations SQL doivent toujours matcher ses valeurs.

---

## 1. RBAC : `roles`, `permissions`, `role_permissions`, `users`

```text
roles
  id            uuid pk
  key           text unique not null        -- SUPER_ADMIN, ADMIN, DIRECTOR,
                                             -- SALES, PROJECT_MANAGER,
                                             -- TECHNICAL_MANAGER, TEAM_MEMBER,
                                             -- VIEWER (packages/types UserRole)
  label         text not null
  description   text
  created_at    timestamptz

permissions
  id            uuid pk
  key           text unique not null        -- ex: "requests.read",
                                             -- "quotes.approve", "users.manage"
  description   text
  created_at    timestamptz

role_permissions
  role_id        uuid fk -> roles(id) on delete cascade
  permission_id  uuid fk -> permissions(id) on delete cascade
  primary key (role_id, permission_id)

users
  id            uuid pk                     -- = auth.users.id (Supabase Auth)
  first_name    text not null
  last_name     text not null
  email         text unique not null
  phone         text
  whatsapp      text
  avatar_url    text
  role_id       uuid fk -> roles(id) on delete restrict not null
  status        user_status not null default 'ACTIVE'
                                             -- ACTIVE, INACTIVE, INVITED, SUSPENDED
  timezone      text not null default 'Europe/Zurich'
  language      text not null default 'fr'  -- 'fr' | 'en'
  created_at    timestamptz
  updated_at    timestamptz
```

Le RBAC est **piloté par données** : `role_permissions` est la matrice
rôle → permission, modifiable sans déploiement. Le guard NestJS
`@RequirePermission('quotes.approve')` résout le rôle de
`request.user.role_id` et vérifie la présence de la permission — jamais
de `if (role === 'ADMIN')` en dur dans un controller.

---

## 2. CRM : `clients`, `contacts`

```text
clients
  id            uuid pk
  company_name  text not null
  country       text
  city           text
  industry      text
  website        text
  email          text
  phone          text
  whatsapp       text
  status         client_status not null default 'PROSPECT'
                                             -- PROSPECT, ACTIVE, INACTIVE, CHURNED
  source         request_source              -- WEBSITE, EMAIL, WHATSAPP, API, MANUAL
  notes          text
  created_at     timestamptz
  updated_at     timestamptz

contacts
  id            uuid pk
  client_id     uuid fk -> clients(id) on delete cascade not null
  first_name    text not null
  last_name     text not null
  email         text
  phone         text
  whatsapp      text
  position      text
  is_primary    boolean not null default false
  created_at    timestamptz
  updated_at    timestamptz

  -- contrainte : un seul contact is_primary=true par client
  -- (index partiel unique sur (client_id) where is_primary)
```

---

## 3. Catalogue : `services`

```text
services
  id                      uuid pk
  slug                    service_slug unique not null
                                             -- WEBSITE, ECOMMERCE, SEO, MAINTENANCE,
                                             -- BUSINESS_APPLICATION, MOBILE_APP, AI,
                                             -- AUTOMATION, SOFTWARE, CONSULTING
  name                    text not null
  description             text
  status                  service_status not null default 'ACTIVE'
                                             -- ACTIVE, INACTIVE, COMING_SOON
  qualification_form_id   uuid fk -> forms(id) on delete set null
  created_at              timestamptz
  updated_at              timestamptz
```

---

## 4. Objet central : `requests`

```text
requests
  id                    uuid pk
  reference             text unique not null    -- ex: KPS-2026-00482
  client_id              uuid fk -> clients(id) on delete set null
  contact_id             uuid fk -> contacts(id) on delete set null
  source                 request_source not null  -- WEBSITE, EMAIL, WHATSAPP, API, MANUAL
  channel                text                      -- detail libre (ex: "contact-form-v2")
  subject                text not null
  original_message       text
  language                text
  country                 text
  detected_service_id    uuid fk -> services(id) on delete set null
  detected_subservice     text
  status                  request_status not null default 'NEW'
                                             -- NEW, RECEIVED, AI_ANALYZING, ANALYZED,
                                             -- FORM_PENDING, FORM_SENT, WAITING_CLIENT,
                                             -- RESPONSE_RECEIVED, QUALIFYING, QUALIFIED,
                                             -- UNQUALIFIED, MATCHING, ASSIGNED,
                                             -- QUOTE_PENDING, QUOTE_SENT, NEGOTIATION,
                                             -- WON, LOST, CONVERTED_TO_MISSION, CLOSED
  priority                priority_level default 'MEDIUM'   -- LOW, MEDIUM, HIGH, URGENT
  urgency                 priority_level
  qualification_status    text                      -- PENDING, QUALIFIED, UNQUALIFIED
  ai_confidence            numeric(4,3)              -- 0.000 - 1.000
  assigned_user_id        uuid fk -> users(id) on delete set null
  created_at               timestamptz
  updated_at               timestamptz

  index (status)
  index (client_id)
  index (source)
```

La référence (`KPS-2026-00482`) est générée par la fonction Postgres
`generate_request_reference()` adossée à la table compteur
`request_reference_counters` (format et rationale : voir §17, point 4),
jamais côté application (évite les doublons en cas de double-soumission
concurrente).

### 4bis. Traçabilité IA : `ai_analyses` (Phase 8)

```text
ai_analyses
  id                uuid pk
  request_id         uuid fk -> requests(id) on delete cascade
  kind                ai_analysis_kind not null   -- REQUEST_ANALYSIS (seule valeur pour l'instant)
  status              ai_analysis_status not null  -- COMPLETED, FAILED
  prompt_version      text not null                -- ex: "request-analysis@1"
  model               text not null                -- ex: "claude-sonnet-5"
  confidence          numeric(4,3)                 -- renseigné uniquement si COMPLETED
  result              jsonb                        -- RequestAnalysisResult, si COMPLETED
  error               text                         -- message générique, si FAILED
  created_at          timestamptz

  index (request_id, created_at desc)
```

Une ligne par appel réel à Claude, jamais écrasée : une ré-analyse en
ajoute une nouvelle plutôt que de remplacer la précédente, ce qui garde
l'historique complet consultable (section 6 du prompt — toute action IA
doit être traçable). `requests.detected_service_id`, `detected_subservice`
et `ai_confidence` reflètent toujours la dernière analyse `COMPLETED`
réussie ; une analyse `FAILED` n'y touche pas.

---

## 5. Formulaires dynamiques : `forms`, `form_steps`, `form_fields`, `qualification_sessions`, `form_responses`

```text
forms
  id            uuid pk
  service_id     uuid fk -> services(id) on delete set null
  name           text not null
  slug           text unique not null
  description    text
  status         form_status not null default 'DRAFT'   -- DRAFT, PUBLISHED, ARCHIVED
  version        integer not null default 1
  created_at     timestamptz
  updated_at     timestamptz

form_steps
  id            uuid pk
  form_id        uuid fk -> forms(id) on delete cascade not null
  title          text not null
  order_index    integer not null
  created_at     timestamptz

  unique (form_id, order_index)

form_fields
  id                  uuid pk
  form_step_id         uuid fk -> form_steps(id) on delete cascade not null
  key                   text not null              -- identifiant stable (ex: "budget")
  label                 text not null
  type                  form_field_type not null   -- TEXT, TEXTAREA, EMAIL, PHONE,
                                                    -- NUMBER, SELECT, MULTI_SELECT,
                                                    -- RADIO, CHECKBOX, DATE, URL,
                                                    -- FILE, CURRENCY, RANGE
  required              boolean not null default false
  options               jsonb                       -- [{value,label}] pour SELECT/RADIO/...
  validation            jsonb                       -- {min,max,pattern,...}
  conditional_logic      jsonb                       -- {field, equals} — voir note Phase 9
  order_index            integer not null
  created_at             timestamptz
  updated_at             timestamptz

  unique (form_step_id, key)

qualification_sessions
  id                uuid pk
  request_id         uuid fk -> requests(id) on delete cascade not null
  form_id            uuid fk -> forms(id) on delete restrict not null
  token_hash          text unique not null      -- sha256(token) ; le token brut
                                                 -- n'est JAMAIS stocké (section 23)
  status              qualification_session_status not null default 'CREATED'
                                                 -- CREATED, SENT, OPENED, IN_PROGRESS,
                                                 -- COMPLETED, EXPIRED, CANCELLED
  expires_at           timestamptz not null
  sent_at              timestamptz    -- Phase 10 : horodatage réel du passage à SENT
  opened_at            timestamptz    -- Phase 10 : 1ère ouverture publique (token)
  started_at           timestamptz
  completed_at         timestamptz
  last_activity_at     timestamptz
  language             text
  created_at            timestamptz
  updated_at            timestamptz

  index (token_hash)
  index (request_id)

form_responses
  id                        uuid pk
  qualification_session_id  uuid fk -> qualification_sessions(id) on delete cascade not null
  form_field_id              uuid fk -> form_fields(id) on delete cascade not null
  value                       jsonb not null        -- valeur brute saisie (autosave)
  created_at                  timestamptz
  updated_at                  timestamptz

  unique (qualification_session_id, form_field_id)
```

Le token de qualification (section 23 du prompt) est généré côté
backend avec `crypto.randomBytes(32)` (256 bits), encodé en base64url pour
l'URL publique ; **seul son hash SHA-256 est persisté** (`token_hash`),
comme pour un mot de passe. La vérification d'un lien entrant recalcule le
hash et compare.

### 5bis. Implémentation réelle (Phase 9)

- `conditional_logic` : forme volontairement simple `{field, equals}`
  (un champ dépend d'un autre par sa `key` et une valeur exacte) — reprend
  l'exemple unique de la section 30 du prompt plutôt qu'un système
  d'opérateurs généraliste non demandé. `field` doit référencer une `key`
  existante ailleurs dans le **même formulaire** (validé côté service).
- `form_fields.key` : unique par étape en base (`unique(form_step_id,
  key)`), mais l'application impose en plus l'unicité **à l'échelle du
  formulaire entier** (`FormsService.assertKeyAvailable`) — nécessaire
  puisque `conditional_logic` et `form_responses` référencent une clé sans
  préciser son étape.
- Réordonnancement atomique de `form_steps`/`form_fields` : fonctions SQL
  `reorder_form_steps(form_id, step_ids[])` et `reorder_form_fields
  (form_step_id, field_ids[])` (migration `20260927500001`) — décalent
  d'abord tous les `order_index` hors de portée (+100000) avant de poser
  les positions finales, pour éviter toute collision transitoire avec la
  contrainte unique sur `form_steps`.
- `qualification_sessions`/`form_responses` ne sont utilisées qu'via des
  routes **authentifiées** en Phase 9 (remplir une qualification au nom
  d'un client depuis `/requests/:id`) : un token est bien généré et
  haché à la création, mais rien ne l'expose encore publiquement — la
  Phase 10 ajoutera la route publique par token au-dessus de ce même
  service, sans dupliquer la logique.
- « Effacer » une réponse (`value: null` côté client) **supprime la ligne**
  de `form_responses` plutôt que d'y écrire un null SQL — la colonne
  `value` est `not null`, et un null JSON authentique (`'null'::jsonb`)
  n'est de toute façon pas ce qu'on veut représenter ici.

### 5ter. Implémentation réelle (Phase 10 — lien public)

- La route publique `/public/qualification/:token` (aucune authentification,
  `@Public()`) consomme le **même** `QualificationSessionsService` que les
  routes authentifiées — résolution par `token_hash` au lieu de l'id,
  jamais l'inverse. La réponse publique
  (`PublicQualificationSessionResponse`) est un contrat volontairement
  différent et plus restreint : `status`, `expiresAt`, `contactFirstName`,
  `serviceName`, `requestReference`, `form`, `responses` — jamais
  `ai_confidence`, notes internes ou tout champ non destiné au prospect
  (section 34).
- Pas de tâche planifiée (cron/BullMQ) dans le projet pour expirer les
  liens : l'expiration est **auto-corrigée à la lecture**
  (`withEffectiveStatus`) — quiconque consulte une session dont
  `expires_at` est dépassé la voit, et la persiste, comme `EXPIRED`.
  Revers : un lien jamais reconsulté après expiration reste `CREATED`/
  `IN_PROGRESS` en base indéfiniment (sans conséquence fonctionnelle,
  juste un statut affiché en retard tant que personne ne l'ouvre).
- Ouverture publique (`GET` par token) : transition `CREATED`/`SENT` →
  `OPENED` avec horodatage (`opened_at`), une seule fois (`opened_at`
  déjà renseigné = pas de re-déclenchement). Ne s'applique jamais aux
  lectures authentifiées (`GET /qualification-sessions/:id`), qui ne
  doivent pas compter comme une "ouverture" par le prospect.
- `POST /requests/:id/qualification-sessions` **fait toujours tourner le
  token** : si une session active existe déjà pour ce couple demande/
  formulaire, elle est réutilisée (id stable, réponses déjà enregistrées
  conservées) mais reçoit un nouveau token + une nouvelle expiration —
  l'ancien lien devient inutilisable. C'est la même mécanique que
  `POST .../regenerate` (section 37 : « peut régénérer »), juste
  déclenchée automatiquement plutôt que sur demande explicite.
- Prolonger un lien expiré (`POST .../extend`) lui redonne un statut
  cohérent avec son avancement réel plutôt que de le renvoyer figé à
  `EXPIRED` : `IN_PROGRESS` si `started_at` est renseigné, sinon `OPENED`
  si `opened_at` l'est, sinon `CREATED`. La distinction `SENT` n'est pas
  reconstituée (ce n'est qu'un indicateur de suivi, pas une donnée
  métier) — un admin qui prolonge un lien jamais envoyé peut simplement
  le renvoyer à nouveau.

---

## 6. Événements & Workflow Engine : `events`, `workflows`, `workflow_runs`

```text
events
  id            uuid pk
  type           event_type not null        -- catalogue complet, cf.
                                             -- packages/types EventType
  entity_type    text not null              -- 'request' | 'opportunity' | 'mission' | ...
  entity_id      uuid not null
  payload        jsonb not null default '{}'
  actor_type     event_actor_type not null  -- SYSTEM, AI, USER, AUTOMATION
  actor_id       uuid                       -- users.id si actor_type = USER
  created_at     timestamptz

  index (entity_type, entity_id, created_at)   -- reconstruction de timeline
  index (type, created_at)

workflows
  id             uuid pk
  name            text not null
  trigger_event    event_type not null
  conditions       jsonb not null default '[]'   -- [{field, operator, value}]
  actions          jsonb not null default '[]'   -- [{type, params}]
  is_active         boolean not null default true
  created_at        timestamptz
  updated_at        timestamptz

workflow_runs
  id                   uuid pk
  workflow_id           uuid fk -> workflows(id) on delete cascade not null
  triggering_event_id    uuid fk -> events(id) on delete set null
  status                 workflow_run_status not null default 'PENDING'
                                                  -- PENDING, RUNNING, COMPLETED, FAILED
  result                  jsonb
  error                   text
  started_at              timestamptz
  completed_at            timestamptz
  created_at              timestamptz
```

`events` est **append-only** (aucun `UPDATE`/`DELETE` applicatif) : c'est
la source de la timeline (section 43) et de l'audit de workflow.

---

## 7. Notifications : `notifications`, `notification_preferences`, `notification_templates`

```text
notification_templates
  id            uuid pk
  key            text not null              -- ex: "qualification_link.email"
  channel        notification_channel not null   -- IN_APP, EMAIL, WHATSAPP
  language       text not null
  subject        text                        -- pour EMAIL
  body            text not null              -- template avec {{placeholders}}
  created_at       timestamptz
  updated_at       timestamptz

  unique (key, channel, language)

notification_preferences
  id            uuid pk
  user_id        uuid fk -> users(id) on delete cascade not null
  event_type      event_type not null
  channel         notification_channel not null
  enabled          boolean not null default true
  created_at        timestamptz

  unique (user_id, event_type, channel)

notifications
  id                   uuid pk
  user_id               uuid fk -> users(id) on delete cascade not null
  event_type             event_type not null
  channel                 notification_channel not null
  title                    text not null
  body                     text not null
  related_entity_type      text
  related_entity_id        uuid
  is_read                   boolean not null default false
  read_at                   timestamptz
  created_at                timestamptz

  index (user_id, is_read)
```

La matrice "qui est notifié pour quel événement" (section 5 du prompt)
est le produit de `workflows` (action `NOTIFY`) évalué contre
`notification_preferences` — pas une table séparée : c'est une politique,
pas une donnée statique.

---

## 8. Matching équipe : `skills`, `user_skills`, `availability`, `matching_results`

```text
skills
  id            uuid pk
  name           text unique not null       -- ex: "Next.js", "NestJS", "SEO technique"
  category        text                       -- ex: "Frontend", "Backend", "Marketing"
  created_at       timestamptz

user_skills
  id               uuid pk
  user_id           uuid fk -> users(id) on delete cascade not null
  skill_id           uuid fk -> skills(id) on delete cascade not null
  proficiency_level  smallint not null check (proficiency_level between 1 and 5)
  years_experience    numeric(4,1)
  created_at            timestamptz

  unique (user_id, skill_id)

availability
  id                     uuid pk
  user_id                 uuid fk -> users(id) on delete cascade not null
  status                   availability_status not null  -- AVAILABLE, BUSY, UNAVAILABLE
  capacity_hours_per_week  smallint
  available_from            date
  notes                      text
  created_at                  timestamptz
  updated_at                  timestamptz

matching_results
  id            uuid pk
  request_id     uuid fk -> requests(id) on delete cascade not null
  user_id         uuid fk -> users(id) on delete cascade not null
  score            numeric(5,2) not null      -- 0.00 - 100.00
  explanation       jsonb not null              -- {positives:[...], negatives:[...]}
  created_at         timestamptz

  index (request_id)
```

---

## 9. Pipeline commercial : `opportunities`, `quotes`, `quote_items`, `quote_versions`

```text
opportunities
  id                   uuid pk
  request_id             uuid fk -> requests(id) on delete cascade   -- unique si non nul
  client_id               uuid fk -> clients(id) on delete restrict   -- nullable (voir ci-dessous)
  title                    text not null
  description              text
  service_id               uuid fk -> services(id) on delete set null
  status                   opportunity_status not null default 'NEW'
                                             -- NEW, QUALIFIED, PROPOSAL_REQUIRED,
                                             -- PROPOSAL_SENT, NEGOTIATION, WON, LOST
  estimated_value           numeric(12,2)
  currency                   text default 'CHF'
  probability                smallint check (0..100)   -- % de gain, celle de l'étape par défaut
  owner_user_id              uuid fk -> users(id) on delete set null
  expected_close_date         date
  lost_reason                  text
  closed_at                    timestamptz              -- passage à WON ou LOST
  created_at                   timestamptz
  updated_at                   timestamptz

quotes
  id                uuid pk
  opportunity_id     uuid fk -> opportunities(id) on delete cascade not null
  client_id           uuid fk -> clients(id) on delete restrict not null
  reference            text unique not null      -- DEVIS-{AAAA}-{NNNN}, default generate_quote_reference()
  title                text not null
  notes                text                      -- remarques affichées sur le devis
  status               quote_status not null default 'DRAFT'
                                             -- DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED
  currency              text default 'CHF'
  subtotal               numeric(12,2) not null default 0
  discount_percent        numeric(5,2) not null default 0   -- remise globale saisie
  discount                numeric(12,2) not null default 0  -- son montant calculé
  tax_rate                 numeric(5,2) not null default 0
  tax_amount               numeric(12,2) not null default 0
  total                     numeric(12,2) not null default 0  -- TTC
  valid_until               date
  created_by                 uuid fk -> users(id) on delete set null
  sent_at                    timestamptz
  accepted_at                timestamptz
  rejected_at                 timestamptz
  rejection_reason            text
  sent_to                     text                -- destinataire du dernier envoi
  created_at                    timestamptz
  updated_at                    timestamptz

quote_items
  id                uuid pk
  quote_id           uuid fk -> quotes(id) on delete cascade not null
  description          text not null
  quantity              numeric(10,2) not null default 1
  unit_price             numeric(12,2) not null
  discount_percent        numeric(5,2) not null default 0
  total                    numeric(12,2) not null
  order_index               integer not null

quote_versions
  id            uuid pk
  quote_id       uuid fk -> quotes(id) on delete cascade not null
  version         integer not null
  snapshot         jsonb not null             -- copie complète du devis + items à cet instant
  created_by        uuid fk -> users(id) on delete set null
  created_at          timestamptz

  unique (quote_id, version)
```

Compléments de la Phase 17 (migration `20261004000002`) :
- **`client_id` nullable** : une demande entrante n'a un client que si
  l'expéditeur est déjà un contact connu ; l'opportunité d'un nouveau
  prospect naît donc sans client, rattaché ensuite (obligatoire au plus
  tard pour le devis, `quotes.client_id` restant `not null`).
- **Une opportunité par demande** : index unique partiel sur
  `request_id` — clé d'idempotence de la création automatique.
- **`request_id` en cascade** (au lieu de `set null`) : même choix que
  `events` et `workflow_runs`. Une demande n'est jamais supprimée par
  l'application ; sans cascade, chaque demande de test laisserait une
  opportunité orpheline dans le pipeline.
- **Probabilité** : réinitialisée à celle de l'étape à chaque changement
  d'étape (`OPPORTUNITY_STAGE_PROBABILITY` dans `@kps/shared`),
  ajustable entre deux.

Compléments de la Phase 18 (migrations `20261005000001/2`) :
- **Totaux** : calculés par l'API (`computeQuoteTotals` dans
  `@kps/shared`, aussi utilisée par l'interface pour l'aperçu) — ligne
  arrondie au centime, remise globale sur le sous-total, TVA sur le net.
- **`save_quote_content`** : enregistre l'en-tête et remplace les lignes
  en une transaction ; refuse (P0001 → 409) un devis qui n'est plus un
  brouillon.
- **`mark_quote_sent`** : crée la version (instantané complet : devis,
  lignes, client, identité de l'entreprise) et passe à `SENT`, en une
  transaction. Une version se régénère donc à l'identique en PDF.
- **`EXPIRED` n'est jamais écrit** : statut déduit (devis `SENT` dont
  `valid_until` est passé), aucune tâche planifiée.
- **`company_settings`** : une seule ligne (clé booléenne contrainte à
  `true`), créée vide. Rien n'y est pré-rempli : sans raison sociale,
  aucun PDF ni envoi.
- `quote_reference_counters` : compteur annuel des références.

`quote_versions.snapshot` est le seul JSONB "métier" volontairement figé :
c'est un historique immuable, pas une donnée interrogeable — il ne
remplace pas `quote_items`, qui reste la source normalisée de la version
courante.

---

## 10. Exécution : `missions`, `mission_members`, `tasks`, `task_comments`

```text
missions
  id                uuid pk
  opportunity_id      uuid fk -> opportunities(id) on delete cascade   -- unique si non nul
  title               text not null
  client_id            uuid fk -> clients(id) on delete restrict not null
  service_id            uuid fk -> services(id) on delete set null
  project_manager_id     uuid fk -> users(id) on delete set null
  start_date               date
  end_date                  date
  status                     mission_status not null default 'PLANNED'
                                             -- PLANNED, IN_PROGRESS, BLOCKED, ON_HOLD,
                                             -- COMPLETED, CANCELLED
  priority                    priority_level default 'MEDIUM'
  budget                       numeric(12,2)
  description                    text
  created_at                      timestamptz
  updated_at                      timestamptz

mission_members
  id            uuid pk
  mission_id     uuid fk -> missions(id) on delete cascade not null
  user_id         uuid fk -> users(id) on delete cascade not null
  role_on_mission  text                      -- ex: "Développeur", "Designer"
  created_at         timestamptz

  unique (mission_id, user_id)

tasks
  id            uuid pk
  mission_id     uuid fk -> missions(id) on delete cascade not null
  title           text not null
  description       text
  assignee_id        uuid fk -> users(id) on delete set null
  due_date             date
  priority               priority_level default 'MEDIUM'
  status                  task_status not null default 'TODO'
                                             -- TODO, IN_PROGRESS, BLOCKED, DONE, CANCELLED
  created_at                timestamptz
  updated_at                timestamptz

task_comments
  id            uuid pk
  task_id        uuid fk -> tasks(id) on delete cascade not null
  author_id       uuid fk -> users(id) on delete set null
  body              text not null
  created_at          timestamptz
```

---

Compléments de la Phase 19 (migrations `20261005100001` à `…100003`) :
- `missions` : `title`, `currency`, `blocked_reason`, `completed_at` ;
  **`client_id` nullable** (une opportunité peut être gagnée sans fiche
  client) ; index unique partiel sur `opportunity_id` (une mission par
  opportunité — idempotence de la création automatique) ; `opportunity_id`
  en cascade (même choix qu'en Phase 17).
- `tasks` : `created_by`, `completed_at` (posé au passage à `DONE`).
- Avancement d'une mission = tâches `DONE` / tâches non `CANCELLED`,
  calculé à la lecture.
- Retirer un membre libère ses tâches non terminées (`assignee_id` nul).
- Pièces jointes des tâches (section 53) : à livrer avec la Phase 20
  (`documents`, association polymorphe).

---

## 11. Documents : `documents`

```text
documents
  id            uuid pk
  name           text not null
  storage_path    text not null           -- chemin dans Supabase Storage
  mime_type        text not null
  size              bigint not null
  entity_type        text not null         -- 'request' | 'opportunity' | 'quote' | 'mission' | 'client'
  entity_id            uuid not null
  uploaded_by            uuid fk -> users(id) on delete set null
  created_at               timestamptz

  index (entity_type, entity_id)
```

L'association polymorphe (`entity_type` + `entity_id`) n'a pas de FK
Postgres native (limitation relationnelle assumée) — l'intégrité est
garantie côté service applicatif (vérification d'existence avant insert),
documentée ici pour que ce choix ne soit jamais "redécouvert" par erreur.

---

Compléments de la Phase 20 (migrations `20261005200001/2`) : le fichier
vit dans le bucket privé `documents` de Supabase Storage,
`storage_path` = `<entity_type>/<entity_id>/<uuid>-<nom nettoyé>`.
`entity_type` vaut `request`, `opportunity`, `quote`, `mission`, `task`
ou `client` (`DocumentEntityType`) ; l'existence de l'objet est vérifiée
par `DocumentsService.resolveTarget` avant tout dépôt. Supprimer un
document supprime la ligne puis le fichier. **La suppression d'un objet
ne supprime pas ses documents** (pas de clé étrangère) : sans effet
aujourd'hui, aucun de ces objets n'étant supprimable par l'application —
à traiter avec la suppression RGPD (Phase 22).

---

## 12. Conversations : `conversations`, `conversation_messages`

```text
conversations
  id            uuid pk
  client_id      uuid fk -> clients(id) on delete set null
  contact_id      uuid fk -> contacts(id) on delete set null
  request_id       uuid fk -> requests(id) on delete set null
  opportunity_id     uuid fk -> opportunities(id) on delete set null
  mission_id           uuid fk -> missions(id) on delete set null
  channel                conversation_channel not null   -- EMAIL, WHATSAPP, SYSTEM
  created_at                timestamptz
  updated_at                timestamptz

conversation_messages
  id                  uuid pk
  conversation_id       uuid fk -> conversations(id) on delete cascade not null
  direction              message_direction not null      -- INBOUND, OUTBOUND
  channel                  conversation_channel not null
  from_address                text
  to_address                   text
  subject                       text
  body                            text not null
  external_message_id             text                    -- Message-Id email / id WhatsApp
  external_thread_id                text
  sent_at                              timestamptz
  created_at                            timestamptz

  unique (external_message_id)   -- idempotence (section 17/63), NULL autorisé
                                  -- pour les messages système sans ID externe
```

---

## 13. Audit : `audit_logs`

```text
audit_logs
  id            uuid pk
  user_id        uuid fk -> users(id) on delete set null
  action           text not null              -- ex: "QUOTE_SENT", "STATUS_CHANGED"
  entity_type        text not null
  entity_id            uuid not null
  old_value              jsonb
  new_value              jsonb
  ip_address                text
  user_agent                  text
  created_at                    timestamptz

  index (entity_type, entity_id, created_at)
  index (user_id, created_at)
```

`audit_logs` couvre les actions **sensibles** déclenchées par un
utilisateur (changements de statut, création de devis, envoi, affectation
— section 61). Les actions purement système/IA sont déjà couvertes par
`events` ; `audit_logs` n'est pas une duplication mais un focus
"qui a fait quoi" avec avant/après, requis pour la conformité RGPD
(section 66).

---

## 14. Idempotence des jobs asynchrones

Pas de table dédiée : chaque job BullMQ reçoit une `jobId` déterministe
(ex. `ai-analysis:<request_id>`, `send-notification:<event_id>:<user_id>:<channel>`)
— BullMQ refuse nativement d'enfiler deux fois le même `jobId` actif. Les
webhooks (email/WhatsApp) utilisent `conversation_messages.external_message_id`
comme clé d'idempotence applicative (section 63).

---

## 15. Enums Postgres à créer (Phase 2)

Alignés sur `packages/types/src/enums.ts` :

```text
user_status                 ACTIVE, INACTIVE, INVITED, SUSPENDED
client_status                PROSPECT, ACTIVE, INACTIVE, CHURNED
service_status                 ACTIVE, INACTIVE, COMING_SOON
service_slug                     (cf. ServiceSlug)
request_source                     (cf. RequestSource)
request_status                       (cf. RequestStatus)
priority_level                          LOW, MEDIUM, HIGH, URGENT
form_status                                DRAFT, PUBLISHED, ARCHIVED
form_field_type                                (cf. FormFieldType)
qualification_session_status                       (cf. QualificationSessionStatus)
event_type                                              (cf. EventType — ~30 valeurs)
event_actor_type                                            (cf. EventActorType)
workflow_run_status                                             PENDING, RUNNING, COMPLETED, FAILED
notification_channel                                                (cf. NotificationChannel)
availability_status                                                    AVAILABLE, BUSY, UNAVAILABLE
opportunity_status                                                        (cf. OpportunityStatus)
quote_status                                                                DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED
mission_status                                                                 (cf. MissionStatus)
task_status                                                                        TODO, IN_PROGRESS, BLOCKED, DONE, CANCELLED
conversation_channel                                                                   EMAIL, WHATSAPP, SYSTEM
message_direction                                                                          INBOUND, OUTBOUND
```

## 16. RLS (Row Level Security) — stratégie

Décision d'architecture (détaillée dans `SECURITY.md`) : **toutes les
données métier passent par `apps/api`**, qui utilise la clé
`service_role` (bypass RLS par nature de Supabase). Le frontend
n'interroge jamais directement les tables via le SDK Supabase. RLS est
donc activé sur **toutes** les tables comme *defense in depth* avec une
politique par défaut **deny-all** pour les rôles `anon` et `authenticated`
— aucune table métier n'est censée être lisible par un accès Supabase
direct, y compris authentifié. Seules les tables Supabase Auth propres
(`auth.users`) suivent le comportement standard de Supabase.

## 17. Décisions arrêtées (points ouverts tranchés en l'absence d'avis contraire)

1. **Devise** : pas de défaut fixe en base. `currency` reste une colonne
   par ligne (`opportunities`, `quotes`, `missions`), sans `default`
   SQL — le service applicatif la déduit du pays du client à la création
   (`CH → CHF`, `FR → EUR`, `CA → CAD`, autres pays → `EUR` par défaut,
   modifiable manuellement ensuite). Évite un défaut trompeur pour les
   clients hors Suisse.
2. **`priority` vs `urgency`** : deux axes indépendants, conservés
   distincts sur `requests`. `urgency` = pression temporelle perçue côté
   client (souvent renseignée par l'analyse Claude à partir du message/
   formulaire — section 19/40 du prompt). `priority` = ordre de
   traitement interne décidé par l'équipe, peut diverger de l'urgence
   perçue (ex. un prospect très urgent mais peu qualifié reste priorité
   basse). Les deux partagent l'enum `priority_level` par simplicité mais
   sont mises à jour indépendamment.
3. **`documents.entity_type/entity_id` sans FK native** : confirmé et
   conservé. L'alternative (une colonne FK nullable par type d'entité :
   `request_id`, `opportunity_id`, `quote_id`, `mission_id`, `client_id`)
   ajouterait 5 colonnes presque toujours nulles et une contrainte
   `CHECK` "exactement une non-nulle" plus complexe à maintenir qu'un
   contrôle applicatif au moment de l'upload. Le compromis polymorphe est
   conservé, avec vérification d'existence de l'entité faite par
   `DocumentsService` avant tout insert (jamais côté DB).
4. **Format de référence** : `KPS-{AAAA}-{NNNNN}` (année sur 4 chiffres,
   compteur sur 5 chiffres avec padding de zéros, ex. `KPS-2026-00482`).
   Remise à zéro chaque 1er janvier. Implémenté via une table compteur
   dédiée plutôt qu'une séquence Postgres globale (une séquence ne se
   remet pas à zéro automatiquement par année) :

   ```text
   request_reference_counters
     year          integer primary key
     last_value    integer not null default 0
   ```

   Fonction `generate_request_reference()` : verrouille la ligne de
   l'année courante (`SELECT ... FOR UPDATE`), incrémente, formate. Cela
   évite toute collision même en cas de créations concurrentes.
