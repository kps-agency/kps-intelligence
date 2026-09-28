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
| events | `/api/v1/events` (lecture timeline) | 13 |
| clients | `/api/v1/clients` | 6 |
| contacts | `/api/v1/clients/:clientId/contacts`, `/api/v1/contacts` | 6 |
| requests | `/api/v1/requests` (source MANUAL uniquement — EMAIL/WHATSAPP arrivent par webhook aux Phases 11-12) | 7 |
| notifications | `/api/v1/notifications` | 14 |
| workflows | `/api/v1/workflows` | 15 |
| team / skills / matching | `/api/v1/team`, `/api/v1/matching` | 16 |
| opportunities | `/api/v1/opportunities` | 17 |
| quotes | `/api/v1/quotes` | 18 |
| missions / tasks | `/api/v1/missions`, `/api/v1/tasks` | 19 |
| documents | `/api/v1/documents` | 20 |
| reports | `/api/v1/reports` | 21 |
