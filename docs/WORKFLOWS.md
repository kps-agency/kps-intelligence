# WORKFLOWS.md — Événements & Workflow Engine

Event Bus : Phase 13. Workflow Engine : Phase 15 (sections 39, 45, 46 du
prompt).

## Catalogue d'événements

Source de vérité : `packages/types/src/enums.ts::EventType` (section 4 du
prompt, complété à chaque phase). Chaque étape métier est d'abord écrite
dans `events`, puis transmise aux abonnés (notifications, workflows...).

## Modèle d'un workflow

```text
QUAND   trigger_event                      (un type d'événement)
SI      conditions                         (évaluées à l'événement)
ALORS   étapes ordonnées :
          délai → conditions (réévaluées au moment de l'étape) → action
ANNULÉ  cancel_on                          (événements sur le même objet)
```

Stocké dans `workflows` (colonnes `trigger_event`, `conditions`,
`actions` = étapes, `cancel_on`, `is_active`), exécuté par
`WorkflowEngine` (`apps/api/src/workflows/`), tracé dans `workflow_runs`
(statut, étape courante, prochaine échéance, journal par étape).

### Vocabulaire autorisé

Une définition en base ne peut rien exécuter d'autre que ce que le code
sait faire : tout est validé contre `workflow-definition.ts` (400 avec le
détail de chaque erreur sinon). Exposé à l'interface par
`GET /api/v1/workflows/vocabulary`.

| Champ de condition | Type |
|---|---|
| `event.payload.confidence` / `.serviceSlug` / `.channel` | nombre / texte / texte |
| `request.source`, `request.status`, `request.detectedServiceSlug` | texte |
| `request.aiConfidence` | nombre |
| `request.hasReplyChannel` (prospect joignable par email/WhatsApp), `request.isAssigned` | booléen |
| `session.status` (statut **effectif** du lien, expiration comprise) | texte |

Opérateurs : `eq`, `neq`, `in`, `notIn`, `gt`, `gte`, `lt`, `lte`,
`exists`, `notExists` (conditions combinées en ET). Une valeur absente ne
satisfait que `notExists`.

| Action | Effet |
|---|---|
| `REQUIRE_QUALIFICATION` | Émet `QUALIFICATION_REQUIRED` si le service a un formulaire publié, sans lien existant ni qualification déjà requise pour ce service |
| `SEND_QUALIFICATION_LINK` | Crée le lien et l'envoie sur le canal par lequel le prospect a écrit (email dans le fil d'origine, ou WhatsApp) |
| `SEND_QUALIFICATION_REMINDER` (`channel` = `EMAIL`/`WHATSAPP`) | Relance avec un lien neuf, émet `QUALIFICATION_REMINDER_SENT` |
| `ANALYZE_QUALIFICATION` | Analyse des réponses par Claude (section 40) : qualifie, disqualifie, ou demande une validation humaine |
| `START_MATCHING` | Calcule le matching équipe de la demande (recommandation) |

## Workflows livrés

| Clé | Quand | Si | Alors |
|---|---|---|---|
| `qualification-required` | `SERVICE_DETECTED` | confiance ≥ 0,6 | `REQUIRE_QUALIFICATION` |
| `qualification-auto-send` | `QUALIFICATION_REQUIRED` | prospect joignable | `SEND_QUALIFICATION_LINK` |
| `qualification-reminders` | `QUALIFICATION_LINK_SENT` | — | 48 h → si lien toujours « envoyé » → relance email ; 24 h → idem → relance WhatsApp. Annulé si lien ouvert, formulaire commencé/complété, lien révoqué ou expiré |
| `qualification-analysis` | `FORM_COMPLETED` | — | `ANALYZE_QUALIFICATION` |
| `matching-on-qualified` | `REQUEST_QUALIFIED` | — | `START_MATCHING` |

Les deux derniers (Phase 16) réalisent la chaîne de la section 45 :
formulaire complété → analyse Claude → qualifiée → matching.

Les deux premiers remplacent la règle codée en dur de la Phase 13
(module `qualification-dispatch`, supprimé) : le seuil de confiance et
l'activation se règlent désormais sans code. Pas de création ni de
suppression de workflow par l'API : la section 46 prévoit une interface
de création « plus tard » ; les workflows livrés sont activables et
paramétrables (délais, valeurs des conditions).

Les règles des phases suivantes (matching, devis, missions — section 45 :
« SI QUALIFIED → démarrer matching ») s'ajouteront comme actions et
workflows livrés au fil des Phases 16 à 19.

## Exécution

- **Déclenchement** : le moteur est abonné à tous les événements. Pour
  chaque workflow actif dont c'est le déclencheur et dont les conditions
  sont vraies, une exécution est créée — **une seule par workflow et par
  événement** (contrainte unique, section 63 : un événement rejoué ne
  relance rien).
- **Une seule chaîne active par objet** : une nouvelle exécution du même
  workflow pour le même objet (ex. un lien régénéré puis renvoyé)
  annule la précédente (« Remplacée par une exécution plus récente »).
- **Étapes immédiates** : exécutées dans le traitement de l'événement.
  **Étapes différées** : job BullMQ retardé (`workflow-steps`, Redis),
  jobId déterministe, réarmé au démarrage de l'API ; 3 tentatives avec
  backoff avant d'être marquées en échec.
- **Annulation** : double garde. Les événements `cancel_on` portant sur
  le même objet annulent l'exécution en attente (et retirent son job) ;
  et les conditions de chaque étape sont réévaluées à son échéance sur
  l'état réel (ex. `session.status = SENT`).
- Une condition fausse = étape **ignorée** (tracée `SKIPPED`), l'étape
  suivante évalue ses propres conditions. Une action sans destinataire
  (ex. aucune adresse WhatsApp) est aussi `SKIPPED`, pas une erreur.

## Relances et lien de qualification

Le token n'est stocké que haché : une relance contient forcément un
**lien neuf**, qui remplace le précédent (le prospect ne l'avait de
toute façon pas ouvert — condition de la relance). Si l'envoi échoue,
l'ancien token est restauré : le lien déjà reçu reste valide. La relance
n'émet pas `QUALIFICATION_LINK_SENT` (elle relancerait la chaîne), mais
`QUALIFICATION_REMINDER_SENT`, visible dans la timeline.

**WhatsApp** : 72 h après l'envoi, la relance tombe hors de la fenêtre de
24 h de Meta : seul un **template approuvé** est accepté
(`WHATSAPP_REMINDER_TEMPLATE`, 3 variables : prénom, service, lien). Tant
que le compte Meta et le template n'existent pas, cette étape échoue (et
est tracée comme telle) quand le prospect a un numéro WhatsApp, ou est
ignorée s'il n'en a pas.

## Human in the Loop (rappel section 6 du prompt)

- **Automatique** : analyse, classification, extraction, choix du
  formulaire, création/envoi du lien, relances, notifications,
  qualification, recommandation de profils.
- **Validation humaine requise** : devis, prix, affectation définitive,
  engagement d'une ressource, décisions commerciales importantes.
- **Action humaine obligatoire** (jamais automatisée) : contrats,
  engagements financiers importants, négociation, décisions stratégiques.

Aucune action de workflow ne doit franchir ces frontières sans un statut
intermédiaire nécessitant une validation (ex. `QUOTE_PENDING` avant
`QUOTE_SENT`).
