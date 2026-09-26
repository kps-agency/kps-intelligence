# WORKFLOWS.md — Événements & Workflow Engine

Squelette créé en Phase 1. Rempli en Phase 13 (Event Bus) et Phase 15
(Workflow Engine) avec les règles réellement implémentées.

## Catalogue d'événements

Source de vérité : `packages/types/src/enums.ts::EventType` (repris de
`prompt.md` section 4). Ne jamais définir un événement ailleurs.

## Règle générale

```text
TRIGGER (event_type)
 ↓
CONDITION(s) (évaluées sur le payload de l'événement + état actuel de l'entité)
 ↓
ACTION(s) (NOTIFY, SEND_EMAIL, SEND_WHATSAPP, CREATE_TASK, START_MATCHING, ...)
```

Stocké en base dans `workflows` (voir `DATABASE.md` §6), exécuté par
`WorkflowEngine`, traçé dans `workflow_runs`.

## Règles identifiées dans le cahier des charges (à implémenter Phase 13-15)

| Trigger | Condition | Action |
|---|---|---|
| `REQUEST_RECEIVED` | service = ECOMMERCE | envoyer formulaire E-commerce, notifier Sales, créer tâche |
| `FORM_COMPLETED` | — | analyser Claude |
| `QUALIFICATION_ANALYSIS_COMPLETED` | qualification_status = QUALIFIED | démarrer matching, notifier responsable |
| `QUALIFICATION_LINK_SENT` puis 48h sans `QUALIFICATION_LINK_OPENED` | — | email de relance |
| relance email envoyée puis 24h sans ouverture | — | relance WhatsApp |
| `FORM_COMPLETED` à tout moment après une relance planifiée | — | annuler les relances restantes |
| `OPPORTUNITY_WON` | — | créer `mission`, notifier équipe affectée |

## Human in the Loop (rappel section 6 du prompt)

- **Automatique** : analyse, classification, extraction, choix du
  formulaire, création/envoi du lien, relances, notifications,
  qualification, recommandation de profils.
- **Validation humaine requise** : devis, prix, affectation définitive,
  engagement d'une ressource, décisions commerciales importantes.
- **Action humaine obligatoire** (jamais automatisée) : contrats,
  engagements financiers importants, négociation, décisions stratégiques.

Le `WorkflowEngine` ne doit jamais avoir d'action qui franchit ces
frontières sans un statut intermédiaire nécessitant une validation
(ex. `QUOTE_PENDING` avant `QUOTE_SENT`).
