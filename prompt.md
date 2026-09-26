# MASTER PROMPT — KPS INTELLIGENCE / KPS OS

## 0. INSTRUCTION PRINCIPALE

Tu es responsable de la conception et du développement complet de **KPS Intelligence**, la plateforme interne intelligente de KPS Agency.

Tu dois agir comme :

* Software Architect Senior
* Full-Stack Engineer Senior
* NestJS Engineer
* Next.js Engineer
* PostgreSQL / Supabase Engineer
* AI Engineer
* DevOps Engineer
* QA Engineer
* Security Engineer
* Product Engineer

Tu dois développer l'application de **A à Z**, de manière réellement fonctionnelle et production-ready.

Tu ne dois pas seulement générer du code d'exemple.

Tu dois construire une véritable application.

### Règles absolues

Ne jamais :

* créer une page vide ;
* créer un bouton sans fonctionnalité ;
* créer une API fictive ;
* utiliser des données mockées à la place de vraies données dans les workflows finaux ;
* laisser des TODO ;
* laisser des FIXME ;
* laisser des fonctions vides ;
* simuler Claude ;
* simuler les notifications ;
* simuler les emails ;
* simuler WhatsApp ;
* simuler les workflows critiques ;
* ignorer les erreurs ;
* contourner l'authentification ;
* exposer des secrets côté frontend.

Chaque fonctionnalité implémentée doit être reliée à son backend, sa base de données et son interface lorsque nécessaire.

---

# 1. CONTEXTE DE KPS AGENCY

KPS Agency est une agence digitale qui accompagne des entreprises :

* en France ;
* en Suisse ;
* au Canada ;
* en Afrique ;
* à l'international.

Les services actuellement proposés sont principalement :

1. Création de sites web
2. E-commerce
3. SEO / référencement
4. Maintenance de sites
5. Applications métier

Le catalogue doit être extensible afin d'ajouter plus tard :

* applications mobiles ;
* automatisation ;
* IA ;
* logiciels SaaS ;
* consulting ;
* intégrations ;
* autres services digitaux.

---

# 2. PROBLÈME À RÉSOUDRE

KPS reçoit des demandes depuis différents canaux :

* site web ;
* formulaires ;
* email ;
* WhatsApp ;
* éventuellement API et autres canaux.

Aujourd'hui, une partie du traitement peut être manuel :

* lire la demande ;
* comprendre le besoin ;
* identifier le service ;
* demander des informations complémentaires ;
* envoyer un formulaire ;
* attendre la réponse ;
* analyser les réponses ;
* déterminer si le prospect est qualifié ;
* prévenir la bonne personne ;
* identifier les membres de l'équipe adaptés ;
* transformer la demande en opportunité ;
* préparer un devis ;
* créer une mission.

KPS Intelligence doit automatiser et orchestrer ce processus.

---

# 3. VISION DU PRODUIT

KPS Intelligence n'est pas simplement un CRM.

C'est un :

> **système intelligent d'orchestration des demandes, prospects, équipes et missions de KPS Agency.**

Principe :

```text
DEMANDE
   ↓
RÉCEPTION
   ↓
ANALYSE IA
   ↓
COMPRÉHENSION
   ↓
CLASSIFICATION
   ↓
IDENTIFICATION DU SERVICE
   ↓
NOTIFICATION ÉQUIPE
   ↓
FORMULAIRE DE QUALIFICATION
   ↓
LIEN UNIQUE ENVOYÉ AU CLIENT
   ↓
RÉPONSE CLIENT
   ↓
ANALYSE IA
   ↓
QUALIFICATION
   ↓
NOTIFICATION
   ↓
MATCHING ÉQUIPE
   ↓
NOTIFICATION
   ↓
OPPORTUNITÉ
   ↓
DEVIS / PROPOSITION
   ↓
MISSION
   ↓
SUIVI
   ↓
REPORTING
```

---

# 4. PRINCIPE CENTRAL : ÉVÉNEMENTS

L'application doit être **event-driven**.

Chaque étape importante produit un événement.

Exemples :

```text
REQUEST_RECEIVED
REQUEST_ANALYSIS_STARTED
REQUEST_ANALYSIS_COMPLETED
SERVICE_DETECTED
QUALIFICATION_REQUIRED
QUALIFICATION_LINK_CREATED
QUALIFICATION_LINK_SENT
QUALIFICATION_LINK_OPENED
FORM_STARTED
FORM_PROGRESS_UPDATED
FORM_COMPLETED
QUALIFICATION_ANALYSIS_STARTED
QUALIFICATION_ANALYSIS_COMPLETED
REQUEST_QUALIFIED
REQUEST_UNQUALIFIED
MATCHING_STARTED
MATCHING_COMPLETED
TEAM_MEMBER_RECOMMENDED
TEAM_MEMBER_ASSIGNED
QUOTE_REQUIRED
QUOTE_CREATED
QUOTE_SENT
QUOTE_ACCEPTED
QUOTE_REJECTED
MISSION_CREATED
MISSION_ASSIGNED
MISSION_STATUS_CHANGED
MISSION_BLOCKED
REQUEST_CLOSED
```

Chaque événement doit pouvoir déclencher :

* changement de statut ;
* notification ;
* email ;
* WhatsApp ;
* tâche ;
* workflow ;
* action IA ;
* relance ;
* affectation.

---

# 5. NOTIFICATIONS À CHAQUE ÉTAPE

Le système doit notifier les membres concernés à chaque étape importante.

Il ne faut cependant pas envoyer toutes les notifications à toute l'équipe.

Créer un moteur de règles de notification.

Exemple :

```text
Nouvelle demande
→ Commercial

Analyse terminée
→ Commercial

Formulaire envoyé
→ Commercial

Réponse client reçue
→ Commercial + responsable

Demande qualifiée
→ Commercial + responsable

Application métier détectée
→ Responsable technique

Matching terminé
→ Responsable

Profil assigné
→ Collaborateur concerné

Devis requis
→ Commercial

Mission créée
→ Chef de projet + équipe
```

Canaux :

* notification in-app ;
* email ;
* WhatsApp.

Prévoir plus tard :

* Slack ;
* Microsoft Teams.

---

# 6. HUMAN IN THE LOOP

L'IA doit automatiser les tâches répétitives tout en conservant un contrôle humain.

## Automatique

Autoriser :

* analyse ;
* classification ;
* extraction ;
* choix du formulaire ;
* création du lien ;
* envoi du formulaire ;
* relances ;
* notifications ;
* qualification ;
* recommandation de profils.

## Validation humaine

Pour :

* devis ;
* prix ;
* affectation définitive ;
* engagement d'une ressource ;
* décisions commerciales importantes.

## Action humaine obligatoire

Pour :

* contrats ;
* engagements financiers importants ;
* négociation ;
* décisions stratégiques.

Toutes les actions IA doivent être traçables.

---

# 7. STACK TECHNIQUE

## Frontend

Utiliser :

* Next.js
* TypeScript
* App Router
* Tailwind CSS
* shadcn/ui
* TanStack Query
* React Hook Form
* Zod
* Recharts
* Lucide React

## Backend

Utiliser :

* NestJS
* TypeScript
* REST API
* Swagger / OpenAPI
* class-validator
* JWT / Supabase Auth
* RBAC
* BullMQ
* Redis

## Database

Utiliser :

* Supabase
* PostgreSQL
* Supabase Auth
* Supabase Storage
* PostgreSQL indexes
* constraints
* RLS

## IA

Utiliser :

* Claude API

Créer une abstraction `AIService` afin de pouvoir changer de fournisseur plus tard.

## Messaging

Prévoir :

* Email provider
* WhatsApp Business API

---

# 8. ARCHITECTURE

Structure recommandée :

```text
kps-intelligence/

├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── ui/
│   ├── types/
│   ├── shared/
│   └── config/
│
├── supabase/
│   ├── migrations/
│   ├── seed/
│   └── functions/
│
├── infrastructure/
│   ├── docker/
│   └── deployment/
│
├── docs/
│
├── tests/
│
├── AI_CONTEXT.md
├── ARCHITECTURE.md
├── DATABASE.md
├── API.md
├── AI.md
├── WORKFLOWS.md
├── NOTIFICATIONS.md
├── SECURITY.md
├── DEPLOYMENT.md
├── TESTING.md
├── README.md
├── docker-compose.yml
└── .env.example
```

---

# 9. MODULES BACKEND

Créer au minimum :

```text
auth
users
roles
permissions
organizations
clients
contacts
services
requests
ai
forms
qualification
events
workflows
workflow-runs
notifications
notification-preferences
email
whatsapp
conversations
team
skills
availability
matching
opportunities
quotes
missions
tasks
documents
reports
audit
dashboard
settings
```

---

# 10. BASE DE DONNÉES

Créer un vrai schéma relationnel PostgreSQL.

Ne pas tout stocker dans JSON.

Créer les relations appropriées.

---

# 11. USERS

Table :

```text
users
```

Champs :

```text
id
first_name
last_name
email
phone
whatsapp
avatar_url
role_id
status
timezone
language
created_at
updated_at
```

---

# 12. ROLES

Créer :

```text
SUPER_ADMIN
ADMIN
DIRECTOR
SALES
PROJECT_MANAGER
TECHNICAL_MANAGER
TEAM_MEMBER
VIEWER
```

Créer un vrai système RBAC.

---

# 13. CLIENTS

Table :

```text
clients
```

Champs :

```text
id
company_name
country
city
industry
website
email
phone
whatsapp
status
source
notes
created_at
updated_at
```

Un client peut avoir plusieurs contacts.

---

# 14. CONTACTS

```text
contacts
```

Champs :

```text
id
client_id
first_name
last_name
email
phone
whatsapp
position
is_primary
created_at
updated_at
```

---

# 15. SERVICES

Créer :

```text
WEBSITE
ECOMMERCE
SEO
MAINTENANCE
BUSINESS_APPLICATION
```

Prévoir l'extension :

```text
MOBILE_APP
AI
AUTOMATION
SOFTWARE
CONSULTING
```

Chaque service possède :

* nom ;
* slug ;
* description ;
* statut ;
* formulaire de qualification associé.

---

# 16. DEMANDES

La demande est l'objet central.

Table :

```text
requests
```

Champs :

```text
id
reference
client_id
contact_id
source
channel
subject
original_message
language
country
detected_service_id
detected_subservice
status
priority
urgency
qualification_status
ai_confidence
assigned_user_id
created_at
updated_at
```

Sources :

```text
WEBSITE
EMAIL
WHATSAPP
API
MANUAL
```

Statuts :

```text
NEW
RECEIVED
AI_ANALYZING
ANALYZED
FORM_PENDING
FORM_SENT
WAITING_CLIENT
RESPONSE_RECEIVED
QUALIFYING
QUALIFIED
UNQUALIFIED
MATCHING
ASSIGNED
QUOTE_PENDING
QUOTE_SENT
NEGOTIATION
WON
LOST
CONVERTED_TO_MISSION
CLOSED
```

---

# 17. INGESTION EMAIL

Lorsqu'un email arrive :

```text
EMAIL
 ↓
WEBHOOK
 ↓
EMAIL SERVICE
 ↓
PARSER
 ↓
REQUEST SERVICE
 ↓
AI SERVICE
 ↓
WORKFLOW ENGINE
```

Extraire :

* expéditeur ;
* destinataire ;
* sujet ;
* contenu ;
* pièces jointes ;
* date ;
* message ID ;
* thread ID.

Utiliser le message ID comme mécanisme d'idempotence.

Un même email reçu deux fois ne doit jamais créer deux demandes.

---

# 18. INGESTION WHATSAPP

Créer un webhook sécurisé.

```text
WHATSAPP
 ↓
WEBHOOK
 ↓
WHATSAPP SERVICE
 ↓
REQUEST SERVICE
 ↓
AI SERVICE
 ↓
WORKFLOW ENGINE
```

Le système doit :

* recevoir ;
* envoyer ;
* conserver les conversations ;
* envoyer un lien de qualification ;
* relancer ;
* notifier l'équipe.

---

# 19. ANALYSE CLAUDE

Claude doit comprendre la demande.

Exemple :

```json
{
  "intent": "service_request",
  "service": "ECOMMERCE",
  "subservice": "ONLINE_STORE",
  "language": "fr",
  "country": "Switzerland",
  "company_name": "ABC SA",
  "summary": "Création d'une boutique en ligne",
  "urgency": "medium",
  "budget": null,
  "deadline": null,
  "missing_information": [
    "budget",
    "deadline",
    "number_of_products"
  ],
  "confidence": 0.94,
  "recommended_action": "SEND_QUALIFICATION_FORM"
}
```

L'IA doit également détecter :

* prospect ;
* client existant ;
* support ;
* maintenance ;
* demande de modification ;
* demande de devis ;
* spam ;
* demande hors périmètre.

---

# 20. AI SERVICE

Créer :

```text
AIService
```

Méthodes :

```text
analyzeRequest()
classifyRequest()
extractEntities()
analyzeQualification()
generateSummary()
suggestMatchingProfiles()
generateClientResponse()
generateFollowUp()
```

Les prompts doivent être versionnés.

Structure :

```text
ai/prompts/
├── request-analysis.ts
├── classification.ts
├── qualification.ts
├── matching.ts
├── email.ts
├── whatsapp.ts
└── summary.ts
```

---

# 21. FORMULAIRES DE QUALIFICATION

Le formulaire de qualification doit être **envoyé sous forme de lien**.

Jamais directement intégré dans l'email ou WhatsApp.

Workflow :

```text
Demande
 ↓
Service détecté
 ↓
Formulaire sélectionné
 ↓
Qualification Session
 ↓
Token sécurisé
 ↓
URL unique
 ↓
Email / WhatsApp
```

Exemple :

```text
https://kps.agency/qualification/8f3a91c2...
```

---

# 22. QUALIFICATION SESSION

Créer :

```text
qualification_sessions
```

Champs :

```text
id
request_id
form_id
token_hash
status
expires_at
started_at
completed_at
last_activity_at
language
created_at
updated_at
```

Statuts :

```text
CREATED
SENT
OPENED
IN_PROGRESS
COMPLETED
EXPIRED
CANCELLED
```

---

# 23. LIEN DE QUALIFICATION

Le token doit être :

* cryptographiquement sécurisé ;
* aléatoire ;
* non séquentiel ;
* unique ;
* révocable ;
* expirant.

Ne pas exposer un ID interne prévisible.

Créer :

```text
/qualification/[token]
```

Cette page est publique.

Elle ne nécessite pas de compte client.

---

# 24. PAGE PUBLIQUE

Le prospect peut ouvrir le lien depuis :

* téléphone ;
* tablette ;
* ordinateur ;
* email ;
* WhatsApp.

Page responsive.

Afficher :

```text
KPS Agency

Bonjour [Prénom],

Merci pour votre demande concernant :

[Service]

Quelques informations nous permettront
de mieux comprendre votre besoin.
```

Puis le formulaire.

---

# 25. FORMULAIRE WEBSITE

Questions :

* type de site ;
* objectif ;
* nombre de pages ;
* contenu disponible ;
* identité visuelle ;
* fonctionnalités ;
* références ;
* budget ;
* deadline.

---

# 26. FORMULAIRE E-COMMERCE

Questions :

* nombre de produits ;
* catégories ;
* pays ;
* moyens de paiement ;
* livraison ;
* stocks ;
* comptes clients ;
* coupons ;
* marketplace ;
* intégrations ;
* budget ;
* deadline.

---

# 27. FORMULAIRE SEO

Questions :

* URL ;
* pays ;
* langues ;
* objectifs ;
* mots-clés ;
* trafic ;
* concurrents ;
* Search Console ;
* Analytics ;
* historique SEO ;
* budget mensuel.

---

# 28. FORMULAIRE MAINTENANCE

Questions :

* URL ;
* technologie ;
* CMS ;
* hébergeur ;
* problème ;
* fréquence ;
* sécurité ;
* sauvegardes ;
* performance ;
* mises à jour ;
* ponctuel / abonnement ;
* urgence.

---

# 29. FORMULAIRE APPLICATION MÉTIER

Questions :

* problème métier ;
* processus actuel ;
* utilisateurs ;
* nombre d'utilisateurs ;
* fonctionnalités ;
* outils actuels ;
* Excel ;
* logiciel ;
* documents ;
* web/mobile ;
* intégrations ;
* reporting ;
* budget ;
* deadline.

---

# 30. FORMULAIRE DYNAMIQUE

Créer un form builder.

Types :

```text
TEXT
TEXTAREA
EMAIL
PHONE
NUMBER
SELECT
MULTI_SELECT
RADIO
CHECKBOX
DATE
URL
FILE
CURRENCY
RANGE
```

Supporter les conditions.

Exemple :

```text
Avez-vous déjà un site ?

OUI
→ demander URL

NON
→ demander objectif
```

---

# 31. FORMULAIRE MULTI-ÉTAPES

Les formulaires longs doivent être découpés :

```text
1. Entreprise
2. Besoin
3. Fonctionnalités
4. Contraintes
5. Budget / délai
6. Coordonnées
7. Confirmation
```

Afficher une progression.

---

# 32. SAUVEGARDE FORMULAIRE

Enregistrer les réponses progressivement.

Si le prospect ferme le navigateur et revient avec le même lien :

→ restaurer les réponses.

---

# 33. SOUMISSION

Lorsque le client termine :

```text
VALIDER
 ↓
ENREGISTRER
 ↓
COMPLETED
 ↓
EVENT
 ↓
ANALYSE CLAUDE
 ↓
QUALIFICATION
 ↓
NOTIFICATION
 ↓
MATCHING
```

---

# 34. PAGE DE CONFIRMATION

Afficher :

```text
Merci pour votre demande.

Nous avons bien reçu les informations
concernant votre projet.

Notre équipe va maintenant analyser
votre besoin et reviendra vers vous.

Référence : KPS-2026-00482
```

Ne jamais afficher au client :

* score IA ;
* notes internes ;
* profils internes ;
* informations confidentielles.

---

# 35. EMAIL DE QUALIFICATION

Créer un template :

```text
Bonjour {{contact_first_name}},

Merci pour votre demande concernant {{service}}.

Afin de mieux comprendre votre projet,
nous vous invitons à compléter notre formulaire
de qualification :

👉 {{qualification_url}}

Cela nous permettra de vous orienter
vers la bonne équipe et de préparer
une réponse adaptée à votre besoin.

L'équipe KPS Agency
```

Le bouton doit utiliser le lien unique.

---

# 36. WHATSAPP DE QUALIFICATION

Créer :

```text
Bonjour {{contact_first_name}} 👋

Merci pour votre demande concernant {{service}}.

Pour mieux comprendre votre besoin,
nous vous invitons à compléter notre formulaire :

👉 {{qualification_url}}

Cela nous permettra de vous répondre
plus rapidement.

KPS Agency
```

---

# 37. EXPIRATION DES LIENS

Expiration par défaut :

```text
30 jours
```

Configurable.

Administrateur :

* peut révoquer ;
* peut prolonger ;
* peut régénérer.

---

# 38. TRACKING DU LIEN

Enregistrer :

```text
LINK_SENT
LINK_OPENED
FORM_STARTED
FORM_PROGRESS
FORM_COMPLETED
LINK_EXPIRED
LINK_REVOKED
```

Afficher dans le dashboard :

```text
Envoyé ✓
Ouvert ✓
Commencé ✓
Progression 72%
Complété —
```

---

# 39. RELANCES

Exemple :

```text
Formulaire envoyé
 ↓
48h
 ↓
pas ouvert
 ↓
email de relance
 ↓
24h
 ↓
pas ouvert
 ↓
WhatsApp
```

Si le formulaire est complété :

→ annuler toutes les relances.

Les règles doivent être configurables.

---

# 40. ANALYSE DES RÉPONSES

Après soumission :

Claude analyse les réponses.

Exemple :

```json
{
  "qualification_status": "QUALIFIED",
  "service": "BUSINESS_APPLICATION",
  "complexity": "HIGH",
  "urgency": "MEDIUM",
  "summary": "...",
  "missing_information": [],
  "recommended_next_step": "TECHNICAL_REVIEW",
  "confidence": 0.91
}
```

Si la confiance IA est faible :

```text
→ validation humaine
→ notification responsable
```

---

# 41. NOTIFICATIONS

Créer :

```text
NotificationService
```

Canaux :

```text
IN_APP
EMAIL
WHATSAPP
```

Créer :

```text
notifications
notification_preferences
notification_templates
```

---

# 42. CENTRE DE NOTIFICATIONS

Créer :

```text
/notifications
```

Fonctions :

* liste ;
* non lues ;
* lues ;
* filtres ;
* recherche ;
* priorité ;
* marquer lu ;
* marquer tout lu ;
* lien vers la ressource.

Header :

```text
🔔 12
```

---

# 43. TIMELINE DES DEMANDES

Chaque demande doit avoir une timeline.

Exemple :

```text
21:04
📩 Demande reçue

21:04
🤖 Analyse Claude démarrée

21:05
🤖 Service identifié : E-commerce

21:05
🔔 Commercial notifié

21:06
📤 Lien de qualification envoyé

21:42
📥 Formulaire ouvert

21:50
📥 Qualification terminée

21:50
🤖 Analyse des réponses

21:51
✅ Demande qualifiée

21:51
👥 Matching équipe terminé

21:52
🔔 Responsable technique notifié
```

Chaque événement doit indiquer :

```text
SYSTEM
AI
USER
AUTOMATION
```

---

# 44. EVENT BUS

Créer un système d'événements.

Chaque événement contient :

```text
id
type
entity_type
entity_id
payload
actor_type
actor_id
created_at
```

Créer des handlers.

Exemple :

```text
REQUEST_QUALIFIED
→ NotificationService
→ MatchingService
→ WorkflowEngine
```

---

# 45. WORKFLOW ENGINE

Créer :

```text
WorkflowEngine
```

Architecture :

```text
TRIGGER
 ↓
CONDITION
 ↓
ACTION
 ↓
CONDITION
 ↓
ACTION
```

Exemple :

```text
REQUEST_RECEIVED

SI service = ECOMMERCE

→ envoyer formulaire E-commerce
→ notifier Sales
→ créer tâche
```

Autre :

```text
FORM_COMPLETED

→ analyser Claude

SI QUALIFIED

→ démarrer matching
→ notifier responsable
```

---

# 46. WORKFLOWS CONFIGURABLES

Créer plus tard une interface permettant à KPS de définir :

```text
Quand X arrive
SI condition Y
Alors effectuer Z
```

Ne pas hardcoder toutes les règles métier dans les controllers.

---

# 47. MATCHING ÉQUIPE

Créer :

```text
skills
user_skills
availability
matching_results
```

Un collaborateur possède :

* compétences ;
* expérience ;
* langues ;
* disponibilité ;
* pays ;
* timezone ;
* expertise ;
* historique de projets.

---

# 48. MATCHING IA

Exemple :

```text
Projet :
Application métier

Technologies :
Next.js
NestJS
PostgreSQL

Résultats :

Amadou
92%

Fatou
87%

Moussa
81%
```

Le score doit être explicable :

```text
+ Next.js
+ NestJS
+ PostgreSQL
+ expérience similaire

- disponibilité limitée
```

Le matching est une recommandation.

L'affectation finale reste contrôlée par l'équipe.

---

# 49. CRM

Pages :

```text
/clients
/clients/[id]
/contacts
```

Fiche client :

```text
Informations
Contacts
Demandes
Conversations
Opportunités
Devis
Missions
Documents
Timeline
```

L'IA doit pouvoir reconnaître un client existant à partir d'un nouvel email.

---

# 50. OPPORTUNITÉS

Créer :

```text
/opportunities
```

Pipeline :

```text
NEW
QUALIFIED
PROPOSAL_REQUIRED
PROPOSAL_SENT
NEGOTIATION
WON
LOST
```

Vue Kanban.

---

# 51. DEVIS

Créer :

```text
quotes
quote_items
quote_versions
```

Fonctions :

* création ;
* modification ;
* lignes ;
* prix ;
* remise ;
* taxes ;
* total ;
* PDF ;
* historique ;
* envoi.

L'IA peut préparer une proposition.

L'envoi peut nécessiter validation humaine.

---

# 52. MISSIONS

Créer :

```text
/missions
```

Champs :

```text
client
opportunity
service
project_manager
team
start_date
end_date
status
priority
budget
description
```

Statuts :

```text
PLANNED
IN_PROGRESS
BLOCKED
ON_HOLD
COMPLETED
CANCELLED
```

---

# 53. TÂCHES

Créer :

```text
tasks
```

Chaque mission peut avoir :

* tâches ;
* responsables ;
* échéances ;
* priorité ;
* statut ;
* commentaires ;
* pièces jointes.

---

# 54. DOCUMENTS

Utiliser Supabase Storage.

Types :

* cahier des charges ;
* PDF ;
* images ;
* devis ;
* contrats ;
* documents client.

Créer :

```text
documents
```

avec :

```text
id
name
storage_path
mime_type
size
entity_type
entity_id
uploaded_by
created_at
```

---

# 55. ANALYSE DE DOCUMENTS

Préparer l'architecture :

```text
PDF
 ↓
Extraction
 ↓
Claude
 ↓
Informations structurées
 ↓
Request / Opportunity
```

L'IA peut extraire :

* fonctionnalités ;
* contraintes ;
* utilisateurs ;
* budget ;
* délai ;
* technologies.

---

# 56. DASHBOARD

Créer une interface professionnelle.

Dashboard principal :

```text
Demandes aujourd'hui
Nouveaux prospects
Demandes à qualifier
Demandes qualifiées
Opportunités
Missions actives
Taux de qualification
Temps moyen de traitement
```

Graphiques :

* demandes par service ;
* demandes par pays ;
* demandes par canal ;
* évolution ;
* conversion ;
* opportunités ;
* missions.

---

# 57. PAGES FRONTEND

Créer :

```text
/dashboard

/requests
/requests/[id]

/clients
/clients/[id]

/contacts

/opportunities
/opportunities/[id]

/quotes
/quotes/[id]

/missions
/missions/[id]

/team
/team/[id]

/forms
/forms/[id]

/workflows
/workflows/[id]

/notifications

/conversations

/reports

/settings
```

Page publique :

```text
/qualification/[token]
```

---

# 58. DESIGN

Créer une interface SaaS B2B moderne.

Principes :

* premium ;
* professionnel ;
* simple ;
* rapide ;
* lisible ;
* responsive ;
* accessible.

Utiliser :

* sidebar ;
* topbar ;
* cards ;
* tables ;
* Kanban ;
* badges ;
* drawers ;
* modals ;
* timelines ;
* charts.

---

# 59. AUTHENTIFICATION

Fonctions :

* login ;
* logout ;
* reset password ;
* session ;
* refresh ;
* protection des routes ;
* RBAC.

Toutes les permissions doivent être contrôlées côté backend.

---

# 60. SÉCURITÉ

Implémenter :

* RBAC ;
* RLS ;
* validation ;
* rate limiting ;
* CORS ;
* protection webhooks ;
* vérification signature ;
* secrets côté serveur ;
* audit logs ;
* contrôle des fichiers ;
* protection des liens publics.

Ne jamais exposer :

```text
ANTHROPIC_API_KEY
SUPABASE_SERVICE_ROLE_KEY
WHATSAPP_ACCESS_TOKEN
SMTP_PASSWORD
```

dans le navigateur.

---

# 61. AUDIT

Créer :

```text
audit_logs
```

Tracer :

* utilisateur ;
* action ;
* entité ;
* ancienne valeur ;
* nouvelle valeur ;
* timestamp ;
* IP ;
* user-agent.

Exemples :

```text
AI_ANALYZED_REQUEST
FORM_SENT
STATUS_CHANGED
USER_ASSIGNED
QUOTE_CREATED
QUOTE_SENT
MISSION_CREATED
```

---

# 62. REDIS + BULLMQ

Jobs asynchrones :

```text
AI_ANALYSIS
QUALIFICATION_ANALYSIS
SEND_EMAIL
SEND_WHATSAPP
FOLLOW_UP
MATCHING
DOCUMENT_PROCESSING
REPORT_GENERATION
```

Chaque job doit avoir :

* retry ;
* backoff ;
* idempotence ;
* logs ;
* gestion d'échec.

---

# 63. IDEMPOTENCE

Obligatoire.

Exemples :

Si un webhook arrive deux fois :

```text
→ une seule demande
```

Si un job est rejoué :

```text
→ une seule notification
```

Si un formulaire est déjà complété :

```text
→ aucune relance
```

Créer des clés d'idempotence appropriées.

---

# 64. CONVERSATIONS

Créer :

```text
conversations
conversation_messages
```

Une conversation peut être liée à :

* client ;
* contact ;
* request ;
* opportunity ;
* mission.

Historiser :

* email ;
* WhatsApp ;
* messages système.

---

# 65. INTERNATIONALISATION

Minimum :

```text
FR
EN
```

Détecter automatiquement la langue du prospect.

Les communications doivent utiliser la langue appropriée.

---

# 66. RGPD

Prévoir :

* consentement ;
* conservation ;
* suppression ;
* export ;
* minimisation ;
* audit ;
* suppression des données personnelles.

---

# 67. OBSERVABILITÉ

Ajouter :

```text
requestId
workflowId
eventId
notificationId
aiRequestId
```

Logs structurés.

Chaque workflow doit pouvoir être reconstitué.

---

# 68. ERROR HANDLING

Une panne Claude ne doit pas bloquer toute l'application.

Exemple :

```text
Claude indisponible
 ↓
Retry
 ↓
Retry
 ↓
Échec
 ↓
AI_ANALYSIS_FAILED
 ↓
Notification responsable
 ↓
Traitement manuel
```

Même principe pour :

* email ;
* WhatsApp ;
* Redis ;
* Supabase ;
* fichiers.

---

# 69. TESTS BACKEND

Créer :

* unit tests ;
* integration tests ;
* e2e.

Tester au minimum :

```text
email → request
request → AI
AI → service
service → form
form → link
link → client
client → response
response → qualification
qualification → notification
qualification → matching
matching → team
team → opportunity
opportunity → mission
```

---

# 70. TESTS FRONTEND

Tester :

* login ;
* dashboard ;
* tables ;
* filtres ;
* formulaire ;
* validation ;
* notifications ;
* timeline ;
* Kanban ;
* qualification publique.

---

# 71. TESTS IA

Créer fixtures :

```text
website-request.json
ecommerce-request.json
seo-request.json
maintenance-request.json
business-app-request.json
support-request.json
spam-request.json
```

Tester la classification.

Prévoir les cas ambigus.

Si confiance trop faible :

```text
→ validation humaine
```

---

# 72. DONNÉES DE DÉMO

Créer seed :

```text
10 clients
20 contacts
5 services
10 utilisateurs
20 demandes
10 opportunités
5 missions
notifications
events
workflow runs
```

Les données doivent être réalistes.

---

# 73. ENVIRONNEMENTS

Préparer :

```text
development
staging
production
```

Créer :

```text
.env.example
```

Variables :

```text
DATABASE_URL

SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

ANTHROPIC_API_KEY

REDIS_URL

EMAIL_HOST
EMAIL_PORT
EMAIL_USER
EMAIL_PASSWORD

WHATSAPP_API_URL
WHATSAPP_ACCESS_TOKEN
WHATSAPP_VERIFY_TOKEN

APP_URL
PUBLIC_QUALIFICATION_URL
```

---

# 74. DOCKER

Créer :

```text
Dockerfile
docker-compose.yml
```

Services :

```text
web
api
redis
```

La base peut utiliser Supabase distant ou un environnement local selon la configuration du projet.

---

# 75. CI/CD

Créer un pipeline :

```text
install
 ↓
lint
 ↓
typecheck
 ↓
unit tests
 ↓
integration tests
 ↓
build
 ↓
security checks
 ↓
deploy staging
```

Production après validation.

---

# 76. DOCUMENTATION

Créer :

```text
README.md
ARCHITECTURE.md
DATABASE.md
API.md
AI.md
WORKFLOWS.md
NOTIFICATIONS.md
FORMS.md
SECURITY.md
DEPLOYMENT.md
TESTING.md
AI_CONTEXT.md
```

`AI_CONTEXT.md` doit permettre à un futur agent IA de comprendre immédiatement :

* architecture ;
* conventions ;
* modules ;
* règles métier ;
* commandes ;
* décisions techniques ;
* variables ;
* tests ;
* workflows.

---

# 77. WORKFLOW COMPLET À TESTER

Le workflow principal doit fonctionner réellement.

## Scénario

Un prospect écrit :

> Bonjour, nous souhaitons créer une boutique e-commerce pour notre entreprise en Suisse.

### Étape 1

Email reçu.

Créer :

```text
REQUEST #KPS-XXXX
```

### Étape 2

Claude analyse.

Détecte :

```text
Service = ECOMMERCE
Pays = Suisse
```

### Étape 3

Notifier le commercial.

### Étape 4

Créer une `QualificationSession`.

### Étape 5

Générer un lien sécurisé :

```text
https://kps.agency/qualification/[token]
```

### Étape 6

Envoyer le lien par email ou WhatsApp.

### Étape 7

Notifier l'équipe :

```text
Formulaire envoyé au prospect.
```

### Étape 8

Le prospect ouvre le lien.

Enregistrer :

```text
LINK_OPENED
```

### Étape 9

Le prospect commence le formulaire.

Enregistrer :

```text
FORM_STARTED
```

### Étape 10

Sauvegarder les réponses progressivement.

### Étape 11

Le prospect soumet.

Enregistrer :

```text
FORM_COMPLETED
```

### Étape 12

Notifier l'équipe.

### Étape 13

Claude analyse les réponses.

### Étape 14

Créer :

```text
QUALIFIED
```

ou :

```text
UNQUALIFIED
```

### Étape 15

Si qualifié :

```text
MATCHING_STARTED
```

### Étape 16

Identifier les profils compatibles.

### Étape 17

Notifier le responsable.

### Étape 18

Créer éventuellement une opportunité.

### Étape 19

Préparer le devis.

### Étape 20

Après validation :

```text
OPPORTUNITY WON
```

### Étape 21

Créer la mission.

### Étape 22

Notifier l'équipe affectée.

---

# 78. ARCHITECTURE DU FLUX

Le résultat final doit ressembler à :

```text
                    ┌───────────────┐
                    │ EMAIL         │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │ WHATSAPP      │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │ WEBSITE       │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ REQUEST       │
                    └───────┬───────┘
                            ▼
                    ┌───────────────┐
                    │ CLAUDE AI     │
                    └───────┬───────┘
                            ▼
                    ┌───────────────┐
                    │ CLASSIFICATION│
                    └───────┬───────┘
                            ▼
                    ┌───────────────┐
                    │ NOTIFICATION  │
                    └───────┬───────┘
                            ▼
                    ┌───────────────┐
                    │ QUALIFICATION │
                    │ LINK          │
                    └───────┬───────┘
                            ▼
                    ┌───────────────┐
                    │ CLIENT FORM   │
                    └───────┬───────┘
                            ▼
                    ┌───────────────┐
                    │ CLAUDE AI     │
                    └───────┬───────┘
                            ▼
                    ┌───────────────┐
                    │ QUALIFICATION │
                    └───────┬───────┘
                            ▼
                    ┌───────────────┐
                    │ NOTIFICATION  │
                    └───────┬───────┘
                            ▼
                    ┌───────────────┐
                    │ MATCHING      │
                    └───────┬───────┘
                            ▼
                    ┌───────────────┐
                    │ OPPORTUNITY   │
                    └───────┬───────┘
                            ▼
                    ┌───────────────┐
                    │ QUOTE         │
                    └───────┬───────┘
                            ▼
                    ┌───────────────┐
                    │ MISSION       │
                    └───────────────┘
```

---

# 79. DASHBOARD FINAL

Le dashboard doit permettre à KPS de comprendre instantanément :

```text
Aujourd'hui

48 demandes
21 nouveaux prospects
12 qualifiés
7 formulaires en attente
5 opportunités
3 devis à préparer
18 missions actives
```

Puis :

```text
Demandes par service

Website             14
E-commerce           8
SEO                  9
Maintenance          7
Application métier   6
Autres               4
```

Puis :

```text
À traiter maintenant

🔴 3 urgentes
🟠 8 à qualifier
🟡 5 réponses reçues
🟢 4 opportunités prêtes
```

---

# 80. CRITÈRES DE QUALITÉ

Le projet final doit être :

* maintenable ;
* scalable ;
* sécurisé ;
* testé ;
* documenté ;
* observable ;
* responsive ;
* production-ready.

Le code doit respecter :

* SOLID ;
* DRY ;
* séparation des responsabilités ;
* architecture modulaire ;
* TypeScript strict ;
* validation backend ;
* validation frontend ;
* gestion d'erreurs ;
* sécurité par défaut.

---

# 81. MODE D'EXÉCUTION

Avant de coder :

1. inspecter le repository ;
2. analyser l'existant ;
3. identifier les technologies déjà présentes ;
4. identifier les dépendances ;
5. identifier les contraintes ;
6. produire l'architecture ;
7. produire le schéma de base de données ;
8. produire le plan de développement.

Ensuite développer par phases.

Après chaque phase :

```text
lint
typecheck
tests
build
```

Corriger immédiatement les erreurs.

Ne pas continuer avec une architecture cassée.

---

# 82. PHASES DE DÉVELOPPEMENT

## Phase 1

Architecture + configuration.

## Phase 2

Supabase + migrations + database.

## Phase 3

Auth + RBAC.

## Phase 4

NestJS foundation.

## Phase 5

Next.js foundation + design system.

## Phase 6

Clients + contacts.

## Phase 7

Requests + inbox.

## Phase 8

Claude AI.

## Phase 9

Services + qualification forms.

## Phase 10

Qualification links.

## Phase 11

Email integration.

## Phase 12

WhatsApp integration.

## Phase 13

Events + Event Bus.

## Phase 14

Notifications.

## Phase 15

Workflow engine.

## Phase 16

Matching équipe.

## Phase 17

Opportunities.

## Phase 18

Quotes.

## Phase 19

Missions + tasks.

## Phase 20

Documents.

## Phase 21

Reports.

## Phase 22

Testing complet.

## Phase 23

Security audit.

## Phase 24

Docker + CI/CD.

## Phase 25

Production readiness.

---

# 83. PREMIÈRE ACTION

NE PAS commencer immédiatement par créer des écrans.

Commencer par inspecter le repository.

Ensuite produire :

```text
1. Architecture globale
2. Architecture frontend
3. Architecture backend
4. Schéma PostgreSQL
5. Relations
6. Modules NestJS
7. Modules Next.js
8. APIs
9. Événements
10. Workflows
11. Architecture Claude
12. Architecture qualification
13. Architecture email
14. Architecture WhatsApp
15. Architecture notifications
16. Architecture matching
17. Architecture CRM
18. Architecture sécurité
19. Plan de tests
20. Plan de déploiement
```

Puis commencer l'implémentation.

---

# 84. DÉFINITION OF DONE

Le produit est terminé uniquement lorsque le scénario suivant fonctionne réellement :

```text
Prospect
 ↓
Email / WhatsApp / Website
 ↓
Request créée
 ↓
Claude comprend la demande
 ↓
Service identifié
 ↓
Équipe notifiée
 ↓
Formulaire approprié sélectionné
 ↓
Lien sécurisé généré
 ↓
Lien envoyé au prospect
 ↓
Prospect ouvre le lien
 ↓
Progression enregistrée
 ↓
Prospect soumet
 ↓
Équipe notifiée
 ↓
Claude analyse les réponses
 ↓
Qualification
 ↓
Équipe notifiée
 ↓
Matching
 ↓
Profils identifiés
 ↓
Profils / responsable notifiés
 ↓
Opportunité
 ↓
Devis
 ↓
Validation
 ↓
Mission
 ↓
Équipe affectée
 ↓
Suivi
 ↓
Reporting
```

Toutes les étapes doivent être :

* réelles ;
* persistées ;
* sécurisées ;
* auditables ;
* testées ;
* visibles dans la timeline.

---

# 85. PRINCIPE FINAL

KPS Intelligence doit devenir le système central qui transforme automatiquement les demandes entrantes de KPS Agency en opportunités puis en missions.

Le système doit permettre à KPS de passer de :

> "Quelqu'un doit lire ce message et décider quoi faire."

à :

> "Le système comprend la demande, prépare les prochaines étapes, informe les bonnes personnes et laisse l'équipe prendre les décisions importantes."

L'objectif n'est donc pas de remplacer l'équipe KPS.

L'objectif est de supprimer le travail administratif répétitif et de permettre à l'équipe de se concentrer sur :

* les clients ;
* les décisions ;
* les propositions ;
* la conception des solutions ;
* la réalisation des missions.

**Commence par analyser le repository et produire l'architecture complète. N'implémente aucun mock à la place d'une fonctionnalité réelle.**
