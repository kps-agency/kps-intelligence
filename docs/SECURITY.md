# SECURITY.md — Sécurité

Squelette étoffé en Phase 1 (décisions structurelles), complété à chaque
phase concernée, audit final en Phase 25.

## 1. Principe d'accès aux données

Décision (voir `ARCHITECTURE.md` §1 et `DATABASE.md` §16) : le frontend ne
parle jamais directement à Supabase pour les données métier. Tout passe
par `apps/api`, qui seul détient la `SUPABASE_SECRET_KEY` (nouveau système
de clés API Supabase — équivalent fonctionnel de l'ancienne "service role
key", bypass RLS). RLS est activé partout en base comme filet de
sécurité, politique deny-all pour `anon`/`authenticated`.

## 2. Secrets — jamais exposés côté navigateur

```text
ANTHROPIC_API_KEY
SUPABASE_SECRET_KEY
WHATSAPP_ACCESS_TOKEN
SMTP_PASSWORD / EMAIL_PASSWORD
JWT_SECRET
```

Ces variables ne doivent jamais apparaître dans `apps/web` (ni en
`NEXT_PUBLIC_*`, ni build-time inline). Seules `SUPABASE_URL` et
`SUPABASE_PUBLISHABLE_KEY` sont acceptables côté frontend (utilisées
uniquement pour l'authentification via Supabase Auth SDK, pas pour les
données métier).

## 3. Authentification & RBAC

- JWT émis par Supabase Auth, vérifié à chaque requête par `apps/api`
  (guard global).
- RBAC piloté par données (`roles`, `permissions`, `role_permissions`),
  jamais de logique de rôle en dur dans un controller (voir `DATABASE.md`
  §1).
- Rôles (section 12 du prompt) : `SUPER_ADMIN`, `ADMIN`, `DIRECTOR`,
  `SALES`, `PROJECT_MANAGER`, `TECHNICAL_MANAGER`, `TEAM_MEMBER`,
  `VIEWER`.

### Attribution des rôles (anti-élévation de privilèges)

`users.manage` ne suffit pas à attribuer n'importe quel rôle : la règle
`assertCanAssignRole` (`apps/api/src/users/role-assignment.policy.ts`,
testée) s'applique à `POST /users` et `PATCH /users/:id/role` :

- personne ne peut modifier **son propre** rôle ;
- seul un `SUPER_ADMIN` peut attribuer le rôle `SUPER_ADMIN`, ou modifier
  le rôle d'un `SUPER_ADMIN` existant.

Sans cette règle (constat fait en construisant l'écran Paramètres, Phase
5), un `ADMIN` pouvait se promouvoir `SUPER_ADMIN`. L'interface n'affiche
pas les actions interdites, mais c'est l'API qui refuse (403) : vérifié
avec un compte `ADMIN` sur les 4 cas d'attaque. Limite connue : rien
n'empêche encore de supprimer/désactiver le dernier `SUPER_ADMIN` (pas de
fonction de désactivation d'utilisateur pour l'instant).

## 4. Lien de qualification (page publique)

- Token 256 bits, non séquentiel, jamais stocké en clair (hash SHA-256
  seul persisté — voir `DATABASE.md` §5).
- Expiration par défaut 30 jours (configurable), révocable, régénérable.
- La route publique ne renvoie **jamais** : score IA, notes internes,
  profils internes, informations confidentielles (section 24/34).
- Rate limiting dédié sur la route publique (protection contre le
  brute-force de token, même si l'espace de token rend cela déjà
  impraticable — défense en profondeur).

## 5. Webhooks (email / WhatsApp / sites web)

- Vérification de signature obligatoire (HMAC pour WhatsApp Cloud API
  avec `WHATSAPP_VERIFY_TOKEN`/app secret ; vérification d'origine pour
  le provider email selon celui retenu en Phase 11).
- Sites web (`/webhooks/website/:site`) : HMAC-SHA256 d'un secret propre
  à chaque site (`WEBSITE_WEBHOOK_SECRETS`, révocable site par site) sur
  `"<timestamp>.<corps brut>"`, horodatage à ±5 min (anti-rejeu), vérifié
  par une garde **avant** la validation du DTO. Site sans secret → 503.
- Idempotence stricte sur l'identifiant de message externe (voir
  `DATABASE.md` §12) — un replay de webhook ne doit jamais créer de
  doublon ni renvoyer une notification en double.

## 6. Rate limiting, CORS & logs

- Rate limiting global (`@nestjs/throttler`, guard global) configurable via
  `RATE_LIMIT_TTL`/`RATE_LIMIT_MAX` (`.env.example`). **En place depuis la
  Phase 4** ; une limite plus stricte reste à ajouter sur les routes
  publiques et les webhooks quand elles existeront (Phases 10-12).
  Limitation connue : le compteur est en mémoire (par instance) — à passer
  sur Redis si l'API tourne un jour en plusieurs instances.
- CORS restreint à `APP_URL` (pas de wildcard) — **en place depuis la
  Phase 4**.
- Logs JSON structurés (`nestjs-pino`) : les en-têtes `authorization` et
  `cookie` sont masqués (`[Redacted]`), vérifié sur un appel authentifié
  réel — le token n'apparaît jamais dans les logs.
- Swagger (`/api/docs`) désactivé quand `APP_ENV=production`.

### Non-fuite des erreurs base de données

`toDbException` (`apps/api/src/common/db-error.ts`, depuis la Phase 6)
traduit toute erreur Postgres/PostgREST en exception HTTP propre — nom de
table, contrainte ou requête ne sont jamais renvoyés au client, seulement
loggés avec le `requestId`. Avant cette phase, `users`/`roles`
renvoyaient le message d'erreur Supabase brut ; corrigé rétroactivement.
Tout nouveau service doit passer ses erreurs Supabase par cette fonction,
jamais par un `InternalServerErrorException(error.message)` direct.

### Recherche : neutralisation de la syntaxe de filtre PostgREST

Un terme de recherche utilisateur est inséré dans un filtre `.or()`
PostgREST. `toContainsPattern`/`toWordPatterns`
(`apps/api/src/common/search.ts`) retirent `, ( ) " \ * %` avant de
construire le motif — sans ça, un terme comme `x,status.eq.CHURNED`
permettrait d'ajouter une condition arbitraire à la requête. Testé par
un cas d'intégration dédié (`crm.e2e-spec.ts`).

## 7. Fichiers (Supabase Storage)

- Contrôle d'accès par entité (un document est lié à une entité et
  l'accès au fichier doit passer par un contrôle d'autorisation applicatif
  avant génération d'une URL signée — jamais de bucket public pour les
  documents clients).

## 8. Audit

- `audit_logs` pour les actions utilisateur sensibles, `events` pour la
  trace système/IA complète (voir `DATABASE.md` §13). Les deux sont
  append-only.

## 9. RGPD (détail Phase 22)

Consentement, minimisation, export et suppression des données
personnelles — voir `prompt.md` section 66. À detailler ici avec les
endpoints concernés une fois implémentés.

## 10. Revue de sécurité finale (Phase 25)

Checklist reprise de `prompt.md` section 60, à cocher avant mise en
production : RBAC, RLS, validation, rate limiting, CORS, protection
webhooks, vérification de signature, secrets côté serveur uniquement,
audit logs, contrôle des fichiers, protection des liens publics.
