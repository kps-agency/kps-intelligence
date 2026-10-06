# API.md — Contrats REST

Squelette créé en Phase 1. Rempli progressivement à partir de la Phase 4
(fondations NestJS) puis à chaque module ajouté.

## Conventions

- Toutes les routes sont préfixées `/api/v1`, sauf `/health` (public, sans
  préfixe, pour les sondes d'infrastructure).
- Documentation interactive : Swagger UI sur `/api/docs`, spec OpenAPI JSON
  sur `/api/docs-json`. Généré automatiquement (plugin `@nestjs/swagger`
  du CLI Nest : les DTO `class-validator` sont documentés sans décorateur
  supplémentaire). Désactivé quand `APP_ENV=production`.
- Authentification : `Authorization: Bearer <access_token Supabase>` sur
  toute route sauf `@Public()`. Dans Swagger UI, bouton "Authorize".
- Pagination standard : `?page=&limit=`, réponse `{ data, meta: { total, page, limit } }`.
- Erreurs : format uniforme pour **toutes** les erreurs (y compris 401, 403,
  429, validation et erreurs inattendues), produit par
  `AllExceptionsFilter` :
  ```json
  { "statusCode": 403, "message": "Permission insuffisante.",
    "error": "Forbidden", "requestId": "8d1cb6ae-..." }
  ```
  `message` est un tableau pour les erreurs de validation. Une erreur
  inattendue renvoie toujours un 500 générique ; son détail n'est que dans
  les logs.
- `x-request-id` : chaque réponse porte cet en-tête. Un client peut en
  fournir un (il est alors repris tel quel), sinon il est généré. C'est la
  clé pour retrouver toutes les lignes de log d'une requête.
- Rate limiting : `RATE_LIMIT_MAX` requêtes par fenêtre de `RATE_LIMIT_TTL`
  secondes et par IP, au-delà : `429`. Les en-têtes `x-ratelimit-*` sont
  renvoyés.
- CORS : limité à `APP_URL` (pas de wildcard).
- Tous les DTO d'entrée sont validés par `class-validator` ; les DTO de
  sortie ne renvoient jamais de champs internes sensibles (score IA brut,
  notes internes) sur les routes exposées à la page publique de
  qualification.

## Modules et routes (renseigné au fur et à mesure)

| Module | Base path | Phase |
|---|---|---|
| health | `/health` | 0 |
| auth | `/api/v1/auth` | 3 |
| users | `/api/v1/users` | 3 |
| clients | `/api/v1/clients` | 6 |
| contacts | `/api/v1/contacts` | 6 |
| requests | `/api/v1/requests` | 7 |
| ai | `POST /api/v1/requests/:id/analyze`, `GET /api/v1/requests/:id/analyses` (module `ai` interne, pas de base path propre — voir `docs/AI.md`) | 8 |
| services | `GET/PATCH /api/v1/services`, `/api/v1/services/:id` (catalogue pré-seedé, pas de création) | 9 |
| forms | `/api/v1/forms`, `/api/v1/forms/:formId/steps(/:stepId)`, `/api/v1/forms/:formId/steps/:stepId/fields(/:fieldId)`, `.../reorder` (form builder générique) | 9 |
| qualification-sessions | **Authentifié** — `POST /api/v1/requests/:id/qualification-sessions` (crée ou fait tourner le token d'une session active), `GET /api/v1/requests/:id/qualification-sessions` (liste/suivi), `GET /api/v1/qualification-sessions/:id`, `PUT .../responses/:fieldKey`, `POST .../submit`, `.../mark-sent`, `.../revoke`, `.../extend`, `.../regenerate` (section 37) | 9-10 |
| qualification (public) | **Sans authentification** (`@Public()`) — `GET /api/v1/public/qualification/:token`, `PUT .../responses/:fieldKey`, `POST .../submit` ; résolution par token uniquement (jamais par id), au-dessus du même `QualificationSessionsService` | 10 |
| email | `GET /api/v1/email-ingestion/status` (admin, observabilité) — pas de webhook : réception par polling IMAP réel en tâche de fond, voir `docs/AI_CONTEXT.md` | 11 |
| whatsapp | **Appelé par Meta** (`@Public`, sans rate limiting, exclu de Swagger) — `GET /api/v1/webhooks/whatsapp` (poignée de main, verify token), `POST /api/v1/webhooks/whatsapp` (signature `X-Hub-Signature-256` obligatoire, 200 immédiat, traitement en arrière-plan) | 12 |
| website | **Appelé par le serveur d'un site** (akoraweb…, `@Public`, exclu de Swagger, 30 req/min) — `POST /api/v1/webhooks/website/:site`, signé : `X-KPS-Timestamp` (secondes Unix, ±5 min) + `X-KPS-Signature: sha256=<HMAC-SHA256(secret du site, "<timestamp>.<corps brut>")>`, secret par site dans `WEBSITE_WEBHOOK_SECRETS`. Corps : `externalId`, `formType`, `contact{name,email,phone?,company?}`, `subject`, `message?`, `fields?[{label,value}]`, `locale?`, `pageUrl?`, `submittedAt?`. Réponse `{requestId, reference, alreadyExisted}` ; idempotent sur `site:formType:externalId` | 16 |
| events | `GET /api/v1/requests/:id/timeline` (`requests.read`) — timeline de la demande reconstruite depuis la table `events`, ordre chronologique, acteur SYSTEM/AI/USER/AUTOMATION | 13 |
| clients | `/api/v1/clients` | 6 |
| contacts | `/api/v1/clients/:clientId/contacts`, `/api/v1/contacts` | 6 |
| requests | `/api/v1/requests` (source MANUAL uniquement — EMAIL/WHATSAPP arrivent par webhook aux Phases 11-12) | 7 |
| notifications | **Utilisateur connecté, ses propres données uniquement** — `GET /api/v1/notifications` (`status=all\|unread\|read`, `priority`, `search`, pagination), `GET .../unread-count`, `POST .../:id/read`, `POST .../read-all`, `GET/PUT .../preferences`. Assignation : `GET /api/v1/requests/assignable-users` (`requests.manage`), `assignedUserId` sur `POST`/`PATCH /requests`. Voir `docs/NOTIFICATIONS.md` | 14 |
| workflows | `GET /api/v1/workflows`, `GET .../vocabulary`, `GET .../:id`, `GET .../:id/runs` (`workflows.read` : admins, directeurs) ; `PUT .../:id` (`workflows.manage` : admins — définition complète revalidée, déclencheur non modifiable). Pas de création/suppression. Voir `docs/WORKFLOWS.md` | 15 |
| team / skills | `GET /api/v1/team`, `GET .../:id` (profil + historique), `GET /api/v1/skills` (`team.read` : tous les rôles) ; `PUT /api/v1/team/:id/profile\|skills\|availability` (son propre profil, ou `team.manage`) ; `POST /api/v1/skills` (`team.manage`) | 16 |
| matching | `GET /api/v1/requests/:id/matching` (`requests.read`) ; `POST .../matching` (relance), `POST .../team-members` {userId}, `DELETE .../team-members/:userId` (`matching.manage`). Analyse des réponses : `POST /api/v1/requests/:id/qualification-analysis` (`requests.manage`) | 16 |
| opportunities | `GET /api/v1/opportunities` (`status`, `ownerUserId`, `clientId`, `requestId`, pagination), `GET .../board` (Kanban : 7 colonnes dans l'ordre du pipeline, `count`, totaux par devise valeur / valeur pondérée, 50 cartes max par colonne ; filtres `ownerUserId`, `search` sur titre, client, contact, référence), `GET .../owners`, `GET .../:id`, `GET .../:id/timeline` (`opportunities.read` : tous les rôles sauf collaborateur) ; `POST /api/v1/opportunities` (saisie manuelle, ou `{requestId}` = création depuis la demande, idempotente), `PATCH .../:id` (champs ; `null` efface), `PATCH .../:id/stage` `{status, lostReason?}` (`opportunities.manage` : admins, commerciaux). Pas de suppression : une opportunité abandonnée passe à `LOST` | 17 |
| quotes | `GET /api/v1/quotes` (`status`, `opportunityId`, `clientId`, `search` sur référence et titre, pagination), `GET .../:id` (lignes, versions, destinataire proposé), `GET .../:id/pdf` (état courant, aperçu d'un brouillon compris), `GET .../:id/versions/:version/pdf` (version envoyée, régénérée depuis son instantané), `GET .../:id/timeline` (`quotes.read` : tous les rôles sauf collaborateur) ; `POST /api/v1/quotes` `{opportunityId, title?}` (brouillon ; 400 si l'opportunité n'a pas de client), `PUT .../:id` (contenu complet du brouillon : en-tête + lignes, totaux recalculés par le serveur, tout total fourni est refusé), `POST .../:id/send` `{to, message?}` (email réel + PDF joint, version figée), `POST .../:id/revise`, `.../accept`, `.../reject` `{reason?}` (`quotes.manage` : admins, commerciaux). 409 si l'action ne correspond pas au statut. Pas de suppression | 18 |
| company-settings | `GET /api/v1/company-settings` (`quotes.read`), `PUT` (`settings.manage` : admins) — identité de l'émetteur des devis (raison sociale, adresse, TVA, IBAN, taux de TVA par défaut, durée de validité, conditions) | 18 |
| missions | `GET /api/v1/missions` (`status`, `clientId`, `opportunityId`, `memberId` = membre ou chef de projet, `search`, pagination ; avancement `tasksDone`/`tasksTotal`), `GET .../managers`, `GET .../:id`, `GET .../:id/timeline`, `GET .../:id/tasks` (`missions.read` : tous les rôles) ; `POST /api/v1/missions` (saisie manuelle, ou `{opportunityId}` = création depuis l'opportunité, idempotente), `PATCH .../:id`, `PATCH .../:id/status` `{status, reason?}`, `POST .../:id/members` `{userId, roleOnMission?}`, `DELETE .../:id/members/:userId`, `POST .../:id/tasks` (`missions.manage` : admins, chefs de projet, responsables techniques). Pas de suppression de mission | 19 |
| tasks | `GET /api/v1/tasks/mine` (`missions.read` : tâches ouvertes de l'utilisateur connecté, toutes missions confondues, échéances les plus proches d'abord — page d'accueil), `PATCH /api/v1/tasks/:id` (`missions.manage` pour tout ; le responsable de la tâche pour son seul `status`, 403 sinon), `DELETE .../:id` (`missions.manage`), `GET .../:id/comments` (`missions.read`), `POST .../:id/comments` (équipe de la mission, son chef de projet, ou `missions.manage`) | 19 |
| documents | `GET /api/v1/documents?entityType=&entityId=` (`entityType` = `request` / `opportunity` / `quote` / `mission` / `task` / `client`), `GET .../:id/download` → `{url, expiresInSeconds}` (lien signé 60 s vers le stockage privé) (`documents.read` + droit de lecture de l'objet) ; `POST /api/v1/documents` (multipart : `file`, `entityType`, `entityId` ; 15 Mo au plus → 413 ; type, extension et signature du contenu contrôlés → 400), `DELETE .../:id` (`documents.manage` ; auteur du dépôt ou droit de gestion de l'objet) | 20 |
| privacy (RGPD) | `GET /api/v1/contacts/:id/personal-data` (export JSON de tout ce qui est détenu sur le contact), `POST /api/v1/contacts/:id/anonymize` (effacement ; 409 si déjà fait) — `privacy.manage` : administrateurs. Chaque appel écrit une ligne dans `audit_logs`. Page publique : `POST /api/v1/public/qualification/:token/submit` exige désormais `{consent: true}` (400 sinon) ; `GET .../:token` renvoie `language` (`fr` / `en`) | 22 |
| reports | `GET /api/v1/reports/overview?from=AAAA-MM-JJ&to=AAAA-MM-JJ` (`reports.read` : tous les rôles sauf collaborateur ; bornes incluses, 366 jours au plus, jours découpés au fuseau Europe/Zurich) → indicateurs (`kpis`), `requestsByDay` (un point par jour, zéros compris), `requestsByService` / `BySource` / `ByCountry`, `funnel` (reçues → qualifiées → opportunités → gagnées), `opportunitiesByStage`, `missionsByStatus`. Tout est calculé en SQL par `report_overview` | 21 |
