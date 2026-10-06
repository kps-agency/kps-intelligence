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

## Documents et fichiers (Phase 20, sections 54 et 60)

- **Stockage privé** : bucket Supabase Storage `documents`, non public,
  créé par l'API au démarrage s'il manque. Aucun fichier n'est accessible
  par une URL permanente ; le navigateur n'a jamais la clé du stockage.
- **Téléchargement par lien signé** de 60 secondes, délivré par l'API
  après contrôle des droits (`GET /documents/:id/download`).
- **Droits hérités de l'objet** : on lit les documents d'un objet si on a
  le droit de lire l'objet (ex. `opportunities.read`), en plus de
  `documents.read`. Pièce jointe d'une tâche = droits de sa mission.
  Suppression : l'auteur du dépôt, ou qui a le droit de gérer l'objet.
- **Contrôle des fichiers** (`documents/file-validation.ts`) : liste
  fermée de types (PDF, PNG, JPEG, WebP, Word, Excel, PowerPoint, texte,
  CSV), extension cohérente avec le type, et **signature du contenu**
  vérifiée — un exécutable renommé en `.pdf` est refusé. 15 Mo au plus,
  limite appliquée dès la réception (413). Pas d'antivirus : à ajouter
  avant d'ouvrir le dépôt à des tiers (aujourd'hui réservé aux
  utilisateurs internes authentifiés).
- **Clé de stockage** générée par le serveur
  (`<type>/<id objet>/<uuid>-<nom nettoyé>`) : le nom fourni par
  l'utilisateur n'est jamais utilisé comme chemin.

## RGPD (Phase 22, section 66)

| Principe | Mise en œuvre |
|---|---|
| **Consentement** | Sur la page publique, le prospect coche son accord avant d'envoyer ses réponses ; l'API refuse l'envoi sans lui (400). La date et la version du texte accepté (`CONSENT_VERSION`, `@kps/shared`) sont conservées sur la session de qualification. **Changer le texte = changer la version.** |
| **Droit d'accès / portabilité** | `GET /contacts/:id/personal-data` : fiche, demandes et messages d'origine, échanges, réponses aux formulaires (question + réponse), consentements, liste des documents — en JSON. Bouton « Exporter » sur la fiche client. |
| **Droit à l'effacement** | `POST /contacts/:id/anonymize` → fonction SQL `anonymize_contact` (une transaction) puis suppression des fichiers du stockage. Bouton « Effacer les données personnelles », avec confirmation. |
| **Traçabilité** | Export et effacement écrivent dans `audit_logs` (qui, quand, IP, navigateur, compteurs) — sans recopier les données concernées. |
| **Accès restreint** | Permission `privacy.manage`, réservée aux administrateurs. |
| **Minimisation** | La page publique ne renvoie que le prénom du contact ; les notifications internes ne contiennent pas le message du prospect ; les liens de qualification ne sont jamais conservés en clair. |

**Ce que l'effacement supprime** : nom, coordonnées et fonction du contact ;
sujet et message de ses demandes (« Demande anonymisée ») ; tous ses
échanges (emails, WhatsApp) ; ses réponses aux formulaires ; les analyses IA
de ses demandes ; les notifications internes qui citent ces demandes ; les
documents déposés sur ces demandes (lignes et fichiers) ; la description de
l'opportunité (résumé de l'IA).

**Ce qu'il conserve, et pourquoi** : la fiche contact vidée (marquée
`anonymized_at`), les demandes, opportunités, devis, missions et leur
historique d'étapes. Ce sont des pièces de l'activité de l'agence ; elles ne
permettent plus d'identifier la personne. La fiche du **client** (la société)
n'est pas touchée.

**Limites connues** (à traiter avant d'invoquer la conformité) :
- **Titres** des opportunités, devis et missions : repris du sujet de la
  demande à leur création, ils ne sont pas réécrits. Un sujet contenant un
  nom de personne y subsisterait.
- **Devis envoyés** : les versions figées (`quote_versions.snapshot`)
  gardent le nom de l'interlocuteur — ce sont des pièces commerciales.
- **Documents** déposés ailleurs que sur la demande (opportunité, mission,
  client) : non supprimés automatiquement.
- **Durée de conservation** : aucune purge automatique. Politique à fixer
  par l'agence (ex. prospects sans suite depuis 3 ans), puis à automatiser.
- **Sauvegardes** Supabase : les données effacées y subsistent jusqu'à leur
  rotation.
- La suppression simple d'un contact (`DELETE /contacts/:id`, existante)
  retire la fiche mais **pas** ses demandes ni ses échanges : pour une
  demande d'effacement RGPD, utiliser l'anonymisation.

