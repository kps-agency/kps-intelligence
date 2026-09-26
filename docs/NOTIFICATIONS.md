# NOTIFICATIONS.md — Moteur de notifications

Squelette créé en Phase 1. Rempli en Phase 14 avec la matrice de règles
réellement implémentée et les templates par canal.

## Canaux

`IN_APP`, `EMAIL`, `WHATSAPP` (Slack/Teams prévus plus tard, section 5 du
prompt — pas dans le périmètre V1).

## Matrice de routage (reprise de `prompt.md` section 5, à affiner Phase 14)

| Événement | Destinataire(s) |
|---|---|
| Nouvelle demande | Commercial |
| Analyse terminée | Commercial |
| Formulaire envoyé | Commercial |
| Réponse client reçue | Commercial + responsable |
| Demande qualifiée | Commercial + responsable |
| Application métier détectée | Responsable technique |
| Matching terminé | Responsable |
| Profil assigné | Collaborateur concerné |
| Devis requis | Commercial |
| Mission créée | Chef de projet + équipe |

Principe : **jamais de broadcast à toute l'équipe**. Le destinataire est
toujours déterminé par rôle + relation à l'entité (ex. `assigned_user_id`
de la `request`, `project_manager_id` de la `mission`), jamais par une
liste statique de tous les utilisateurs d'un rôle.

## Anti-spam / idempotence

Un job de notification a un `jobId` déterministe
(`notify:<event_id>:<user_id>:<channel>`) — rejouer le job ne renvoie
jamais deux fois la même notification (section 63).

## Préférences utilisateur

`notification_preferences` (voir `DATABASE.md` §7) permet à un
utilisateur de désactiver un canal pour un type d'événement donné — sauf
pour les événements marqués critiques (liste à définir Phase 14), qui
restent toujours envoyés en `IN_APP` au minimum.
