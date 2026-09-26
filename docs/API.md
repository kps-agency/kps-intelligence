# API.md — Contrats REST

Squelette créé en Phase 1. Rempli progressivement à partir de la Phase 4
(fondations NestJS) puis à chaque module ajouté.

## Conventions

- Toutes les routes sont préfixées `/api/v1`.
- Documentation interactive : Swagger/OpenAPI exposé sur `/api/docs`
  (désactivé en production ou protégé par auth — décision à prendre en
  Phase 25).
- Pagination standard : `?page=&limit=`, réponse `{ data, meta: { total, page, limit } }`.
- Erreurs : format uniforme `{ statusCode, message, error, requestId }`.
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
| ai | (interne, pas de route publique) | 8 |
| services / forms | `/api/v1/services`, `/api/v1/forms` | 9 |
| qualification | `/api/v1/qualification`, route publique `/api/v1/public/qualification/:token` | 10 |
| email | webhook `/api/v1/webhooks/email` | 11 |
| whatsapp | webhook `/api/v1/webhooks/whatsapp` | 12 |
| events | `/api/v1/events` (lecture timeline) | 13 |
| notifications | `/api/v1/notifications` | 14 |
| workflows | `/api/v1/workflows` | 15 |
| team / skills / matching | `/api/v1/team`, `/api/v1/matching` | 16 |
| opportunities | `/api/v1/opportunities` | 17 |
| quotes | `/api/v1/quotes` | 18 |
| missions / tasks | `/api/v1/missions`, `/api/v1/tasks` | 19 |
| documents | `/api/v1/documents` | 20 |
| reports | `/api/v1/reports` | 21 |
