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
| `CREATE_OPPORTUNITY` | Crée l'opportunité de la demande (titre, client, service, responsable repris de la demande ; description = résumé de l'analyse Claude). Idempotent : une seule opportunité par demande (index unique sur `request_id`) |
| `SET_OPPORTUNITY_STAGE` (`stage` = `PROPOSAL_REQUIRED` / `PROPOSAL_SENT` / `NEGOTIATION` / `WON`) | Fait avancer l'opportunité du devis concerné. Jamais en arrière, jamais sur une opportunité déjà gagnée ou perdue (tracé « ignoré »). Seule action qui ne porte pas sur une demande : elle fonctionne aussi pour un devis sans demande d'origine |
| `SYNC_REQUEST_STATUS` | Aligne le statut de la demande sur l'étape de son opportunité : `PROPOSAL_REQUIRED` → `QUOTE_PENDING`, `PROPOSAL_SENT` → `QUOTE_SENT`, `NEGOTIATION`, `WON`, `LOST`. Sans effet aux étapes `NEW` / `QUALIFIED`, ni sur une demande déjà convertie en mission ou clôturée |

## Workflows livrés

| Clé | Quand | Si | Alors |
|---|---|---|---|
| `qualification-required` | `SERVICE_DETECTED` | confiance ≥ 0,6 | `REQUIRE_QUALIFICATION` |
| `qualification-auto-send` | `QUALIFICATION_REQUIRED` | prospect joignable | `SEND_QUALIFICATION_LINK` |
| `qualification-reminders` | `QUALIFICATION_LINK_SENT` | — | 48 h → si lien toujours « envoyé » → relance email ; 24 h → idem → relance WhatsApp. Annulé si lien ouvert, formulaire commencé/complété, lien révoqué ou expiré |
| `qualification-analysis` | `FORM_COMPLETED` | — | `ANALYZE_QUALIFICATION` |
| `matching-on-qualified` | `REQUEST_QUALIFIED` | — | `START_MATCHING` |
| `opportunity-on-matching` | `MATCHING_COMPLETED` | statut de la demande parmi `QUALIFIED`, `MATCHING`, `ASSIGNED` | `CREATE_OPPORTUNITY` |
| `request-status-on-opportunity-stage` | `OPPORTUNITY_STAGE_CHANGED` | — | `SYNC_REQUEST_STATUS` |
| `opportunity-stage-on-quote-created` | `QUOTE_CREATED` | — | `SET_OPPORTUNITY_STAGE` → `PROPOSAL_REQUIRED` |
| `opportunity-stage-on-quote-sent` | `QUOTE_SENT` | — | `SET_OPPORTUNITY_STAGE` → `PROPOSAL_SENT` |
| `opportunity-stage-on-quote-accepted` | `QUOTE_ACCEPTED` | — | `SET_OPPORTUNITY_STAGE` → `WON` |
| `opportunity-stage-on-quote-rejected` | `QUOTE_REJECTED` | — | `SET_OPPORTUNITY_STAGE` → `NEGOTIATION` |

`qualification-analysis` et `matching-on-qualified` (Phase 16) réalisent
la chaîne de la section 45 : formulaire complété → analyse Claude →
qualifiée → matching. `opportunity-on-matching` (Phase 17) la prolonge :
matching terminé → opportunité.

**Déclencheur de l'opportunité (décision du 04/10/2026)** :
`MATCHING_COMPLETED` plutôt que `TEAM_MEMBER_ASSIGNED`. Le matching est
automatique, l'affectation est un geste humain : aucune demande
qualifiée ne reste hors du pipeline si personne n'affecte l'équipe. La
condition sur le statut écarte un matching lancé à la main sur une
demande non qualifiée (l'opportunité se crée alors depuis la fiche
demande, à l'étape « Nouvelle »).

Un changement d'étape émet toujours `OPPORTUNITY_STAGE_CHANGED`
(`from`, `to`) ; `OPPORTUNITY_WON` et `OPPORTUNITY_LOST` s'y ajoutent
comme jalons (déclencheur de la mission en Phase 19). Un workflow dont
l'événement porte sur une opportunité sans demande d'origine est tracé
« ignoré » (aucune demande concernée).

Les deux premiers remplacent la règle codée en dur de la Phase 13
(module `qualification-dispatch`, supprimé) : le seuil de confiance et
l'activation se règlent désormais sans code. Pas de création ni de
suppression de workflow par l'API : la section 46 prévoit une interface
de création « plus tard » ; les workflows livrés sont activables et
paramétrables (délais, valeurs des conditions).

**Devis (Phase 18)** : le devis fait avancer son opportunité, qui fait
avancer la demande (`request-status-on-opportunity-stage`) — devis créé →
demande « Devis à préparer », envoyé → « Devis envoyé », accepté →
« Gagnée ». Un devis refusé met l'opportunité en négociation plutôt que
de la perdre : c'est à l'équipe de décider (nouveau devis, ou « Perdue »
à la main). Depuis cette phase, le moteur transmet aux actions l'objet
de l'événement (`subjectType` / `subjectId`) et n'exige plus une demande :
les actions qui en ont besoin se déclarent elles-mêmes « ignorées ».

Les règles des missions s'ajouteront à la Phase 19 (`OPPORTUNITY_WON` →
mission).

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
