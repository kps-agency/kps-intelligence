# NOTIFICATIONS.md — Moteur de notifications

Implémenté en Phase 14 (sections 5, 41, 42, 62, 63 du prompt).

## Principe

Un événement (voir `WORKFLOWS.md` / Event Bus, Phase 13) déclenche une
**règle** ; la règle désigne des **publics** ; chaque destinataire reçoit
une notification **par canal** selon les défauts de la règle et ses
propres préférences. Jamais de diffusion à toute l'équipe.

```
Événement ─► règle (notification-rules.ts) ─► publics ─► destinataires
          ─► préférences ─► une ligne `notifications` par destinataire × canal
             IN_APP : écrite immédiatement
             EMAIL  : file BullMQ `notification-email` (Redis)
          ─► événement TEAM_NOTIFIED (timeline : « Notifié : … »)
```

Code : `apps/api/src/notifications/`.

## Canaux

| Canal | État |
|---|---|
| `IN_APP` | Centre `/notifications` + cloche avec compteur dans l'en-tête |
| `EMAIL` | Envoi SMTP réel via BullMQ (retry ×5, backoff exponentiel 30 s) |
| `WHATSAPP` | **Pas encore** : un message WhatsApp à l'initiative de l'entreprise exige un template approuvé par Meta (compte Meta pas encore créé, voir Phase 12). Refusé explicitement par l'API de préférences. |

Slack / Teams : prévus plus tard (section 5), hors V1.

## Publics

| Public | Résolution |
|---|---|
| Commercial | L'utilisateur **assigné** à la demande (`requests.assigned_user_id`) s'il est actif, sinon **tous les commerciaux actifs** (rôle `SALES`) |
| Responsable | Rôle `DIRECTOR` |
| Responsable technique | Rôle `TECHNICAL_MANAGER` |
| Assigné | La personne à qui la demande vient d'être confiée |

Si personne n'a le rôle visé, les **administrateurs** (`ADMIN`,
`SUPER_ADMIN`) reçoivent à sa place : une étape n'est jamais notifiée à
personne. L'auteur d'une action n'est jamais notifié de sa propre action.

Une demande ne peut être assignée qu'à un utilisateur actif dont le rôle a
`requests.manage` (`GET /requests/assignable-users`).

## Matrice (défauts)

| Événement | Règle | Publics | Canaux par défaut | Priorité |
|---|---|---|---|---|
| `REQUEST_RECEIVED` | Nouvelle demande | Commercial | In-app + email | Moyenne |
| `REQUEST_ANALYSIS_COMPLETED` | Analyse IA terminée | Commercial | In-app | Basse |
| `AI_ANALYSIS_FAILED` | Échec de l'analyse IA (critique) | Commercial + Responsable | In-app + email | Haute |
| `SERVICE_DETECTED` (service `BUSINESS_APPLICATION`) | Application métier détectée | Responsable technique | In-app | Moyenne |
| `QUALIFICATION_REQUIRED` (demande saisie à la main) | Qualification à envoyer | Commercial | In-app | Moyenne |
| `QUALIFICATION_LINK_SENT` | Formulaire envoyé | Commercial | In-app | Basse |
| `FORM_COMPLETED` | Réponse client reçue | Commercial + Responsable | In-app + email | Haute |
| `REQUEST_QUALIFIED` | Demande qualifiée | Commercial + Responsable | In-app + email | Haute |
| `REQUEST_ASSIGNED` | Demande assignée (critique) | Assigné | In-app + email | Haute |
| `CONVERSATION_MESSAGE_RECEIVED` | Nouveau message du prospect | Commercial | In-app | Moyenne |
| `QUALIFICATION_ANALYSIS_COMPLETED` (validation humaine requise) | Qualification à valider | Responsable + Commercial | In-app + email | Haute |
| `MATCHING_COMPLETED` | Matching terminé | Responsable + Responsable technique | In-app | Moyenne |
| `TEAM_MEMBER_ASSIGNED` | Affectation à une demande (critique) | Collaborateur affecté | In-app + email | Haute |

`QUALIFICATION_REQUIRED` n'est notifié que pour une demande saisie à la
main : une demande entrante (email/WhatsApp) reçoit le lien
automatiquement, il n'y a rien à faire. Les règles de matching, devis et
missions (section 5) s'ajouteront avec les Phases 16 à 19.

## Préférences

`notification_preferences` : un utilisateur peut activer ou couper chaque
canal pour chaque étape (dialogue « Préférences » sur `/notifications`).
Sans préférence explicite, les défauts de la matrice s'appliquent.
**Critique** (`AI_ANALYSIS_FAILED`, `REQUEST_ASSIGNED`) : l'in-app ne peut
pas être coupé (400 côté API, case verrouillée côté UI).

## Templates

`notification_templates` (clé = règle, canal, langue), en base : textes
modifiables sans déploiement. Variables : `{{reference}}`, `{{subject}}`,
`{{source}}`, `{{serviceName}}`, `{{confidence}}`, `{{channel}}`,
`{{actorName}}`, `{{link}}`. Une variable inconnue fait échouer le rendu
(jamais de texte troué envoyé). Langue de l'utilisateur, repli sur `fr`
(seule langue fournie avant la Phase 22).

## Idempotence (section 63)

- Contrainte `unique (event_id, user_id, channel)` : un événement rejoué
  n'insère rien de nouveau.
- Au-delà : si un événement a déjà produit des notifications, un rejeu ne
  recalcule **pas** les destinataires (sinon une demande réassignée entre
  deux traitements notifierait le nouvel assigné pour une étape passée).
- Email : `jobId = email-<notification_id>` (BullMQ interdit `:` dans un
  id) et `sent_at` vérifié avant envoi — un job rejoué après succès
  n'envoie rien. Cas limite assumé : email parti mais `sent_at` non écrit
  (panne entre les deux) → renvoi au retry (au moins une fois).

## Gestion d'échec (section 62)

- Échec SMTP : erreur enregistrée sur la notification (`error`), retry
  avec backoff ; après 5 tentatives, la ligne reste avec `sent_at` NULL et
  son erreur (l'in-app, lui, est déjà délivré).
- Redis indisponible au moment de l'événement : la ligne EMAIL est créée
  quand même ; elle est remise en file au démarrage suivant de l'API
  (emails en attente de moins de 24 h).
- Connexion Redis perdue en cours de route : journalisée, BullMQ se
  reconnecte seul (écouteurs `error` obligatoires, sans quoi l'API
  tomberait).

## Infrastructure

Redis via `docker compose up -d redis` (`docker-compose.yml` à la racine,
AOF activé pour que les jobs survivent à un redémarrage). `REDIS_URL` dans
`.env`.
