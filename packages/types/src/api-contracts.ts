import type {
  AiAnalysisKind,
  AiAnalysisStatus,
  AvailabilityStatus,
  ClientStatus,
  EventActorType,
  EventEntityType,
  EventType,
  FormFieldType,
  FormStatus,
  MissionStatus,
  NotificationChannel,
  OpportunityStatus,
  PriorityLevel,
  QualificationSessionStatus,
  QuoteStatus,
  QualificationVerdict,
  RequestIntent,
  RequestSource,
  RequestStatus,
  ServiceSlug,
  ServiceStatus,
  TaskStatus,
  UserRole,
  WorkflowRunStatus,
} from "./enums";

// Contrats partagés entre apps/api et apps/web : le frontend type ses
// appels avec ces formes au lieu de les redéfinir. Ce sont les formes JSON
// réellement renvoyées par l'API (voir apps/api/src/users).

// Réponse de GET /users/me.
export interface CurrentUserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleKey: UserRole;
  permissions: string[];
}

// Réponse de GET /users, POST /users, PATCH /users/:id/role.
export interface UserProfileResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsapp: string | null;
  avatarUrl: string | null;
  roleKey: UserRole;
  status: "ACTIVE" | "INACTIVE" | "INVITED" | "SUSPENDED";
  timezone: string;
  language: string;
  createdAt: string;
  updatedAt: string;
}

// Corps de POST /users.
export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  roleKey: UserRole;
  phone?: string;
}

// ---- Pagination (toutes les listes paginées de l'API) ----

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number };
}

// ---- CRM : clients ----

export interface ClientResponse {
  id: string;
  companyName: string;
  country: string | null;
  city: string | null;
  industry: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  status: ClientStatus;
  source: RequestSource | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Élément de GET /clients : le client + le nombre de contacts.
export interface ClientListItemResponse extends ClientResponse {
  contactsCount: number;
}

// Corps de POST /clients (les champs optionnels vides sont omis).
export interface CreateClientRequest {
  companyName: string;
  country?: string;
  city?: string;
  industry?: string;
  website?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  status?: ClientStatus;
  source?: RequestSource;
  notes?: string;
}

// Corps de PATCH /clients/:id : `null` efface un champ optionnel.
export interface UpdateClientRequest {
  companyName?: string;
  country?: string | null;
  city?: string | null;
  industry?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  status?: ClientStatus;
  source?: RequestSource | null;
  notes?: string | null;
}

// ---- CRM : contacts ----

export interface ContactResponse {
  id: string;
  clientId: string;
  // Nom de la société, renseigné dans les listes qui traversent les clients.
  clientCompanyName: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  position: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

// Corps de POST /clients/:clientId/contacts. Le premier contact d'un client
// devient principal automatiquement.
export interface CreateContactRequest {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  position?: string;
  isPrimary?: boolean;
}

// Corps de PATCH /contacts/:id : `null` efface un champ optionnel.
export interface UpdateContactRequest {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  position?: string | null;
  // Seul `true` est accepté : on change de contact principal en en
  // désignant un autre.
  isPrimary?: true;
}

// ---- Requests (objet central) ----

// Réponse de GET/POST/PATCH /requests — le nom du client et du contact
// liés est inclus pour éviter un aller-retour supplémentaire côté liste.
export interface RequestResponse {
  id: string;
  reference: string;
  clientId: string | null;
  clientCompanyName: string | null;
  contactId: string | null;
  contactFullName: string | null;
  source: RequestSource;
  channel: string | null;
  subject: string;
  originalMessage: string | null;
  language: string | null;
  country: string | null;
  status: RequestStatus;
  priority: PriorityLevel | null;
  urgency: PriorityLevel | null;
  detectedServiceSlug: ServiceSlug | null;
  detectedServiceName: string | null;
  detectedSubservice: string | null;
  aiConfidence: number | null;
  // Commercial (ou autre utilisateur) en charge : destinataire prioritaire
  // des notifications de la demande (Phase 14).
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdAt: string;
  updatedAt: string;
}

// Élément de GET /requests/assignable-users : utilisateurs actifs pouvant
// gérer des demandes.
export interface AssignableUserResponse {
  id: string;
  fullName: string;
  roleKey: string;
}

// Corps de POST /requests (source MANUAL, fixée par le serveur).
export interface CreateRequestRequest {
  subject: string;
  originalMessage?: string;
  language?: string;
  country?: string;
  priority?: PriorityLevel;
  urgency?: PriorityLevel;
  clientId?: string;
  contactId?: string;
  assignedUserId?: string;
}

// Corps de PATCH /requests/:id. `null` sur clientId délie le client (et
// implicitement le contact) ; les autres `null` effacent le champ.
export interface UpdateRequestRequest {
  subject?: string;
  originalMessage?: string | null;
  language?: string | null;
  country?: string | null;
  status?: RequestStatus;
  priority?: PriorityLevel;
  urgency?: PriorityLevel;
  clientId?: string | null;
  contactId?: string | null;
  assignedUserId?: string | null;
}

// ---- Claude AI (analyse de demande, section 19) ----

// Résultat structuré renvoyé par Claude (contenu de `AiAnalysisResponse.result`
// quand status = COMPLETED). Forme figée par le schéma d'outil imposé à
// l'appel — jamais du texte libre reparsé.
export interface RequestAnalysisResult {
  intent: RequestIntent;
  service: ServiceSlug | null;
  subservice: string | null;
  language: string | null;
  country: string | null;
  companyName: string | null;
  summary: string;
  urgency: PriorityLevel | null;
  budget: string | null;
  deadline: string | null;
  missingInformation: string[];
  confidence: number;
  recommendedAction: string;
}

// Réponse de GET /requests/:id/analyses et POST /requests/:id/analyze.
// Résultat de l'analyse des réponses de qualification (section 40).
export interface QualificationAnalysisResult {
  qualificationStatus: QualificationVerdict;
  service: ServiceSlug | null;
  complexity: "LOW" | "MEDIUM" | "HIGH" | null;
  urgency: PriorityLevel | null;
  summary: string;
  missingInformation: string[];
  recommendedNextStep: string;
  confidence: number;
  // Compétences nécessaires, choisies dans le catalogue `skills`.
  requiredSkills: string[];
}

export interface AiAnalysisResponse {
  id: string;
  requestId: string;
  kind: AiAnalysisKind;
  status: AiAnalysisStatus;
  model: string;
  confidence: number | null;
  // `null` quand status = FAILED. Forme selon `kind`.
  result: RequestAnalysisResult | QualificationAnalysisResult | null;
  // Message générique seulement quand status = FAILED — jamais le détail
  // brut d'une erreur Anthropic.
  error: string | null;
  createdAt: string;
}

// ---- Services (section 15) ----

// Réponse de GET /services, GET /services/:id, PATCH /services/:id. Le
// catalogue de services est un ensemble fixe (ServiceSlug) pré-seedé en
// base — pas de création depuis l'API, seulement configuration.
export interface ServiceResponse {
  id: string;
  slug: ServiceSlug;
  name: string;
  description: string | null;
  status: ServiceStatus;
  qualificationFormId: string | null;
  qualificationFormName: string | null;
  createdAt: string;
  updatedAt: string;
}

// Corps de PATCH /services/:id.
export interface UpdateServiceRequest {
  name?: string;
  description?: string | null;
  status?: ServiceStatus;
  // `null` délie le formulaire de qualification du service.
  qualificationFormId?: string | null;
}

// ---- Formulaires dynamiques (form builder, sections 30-32) ----

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
}

// Condition d'affichage la plus simple possible (exemple de la section
// 30 : « Avez-vous déjà un site ? OUI → URL »). Un champ n'est affiché
// que si le champ `field` (par sa clé) a déjà pour valeur `equals`.
export interface FormFieldCondition {
  field: string;
  equals: string;
}

export interface FormFieldResponse {
  id: string;
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options: FormFieldOption[] | null;
  validation: FormFieldValidation | null;
  conditionalLogic: FormFieldCondition | null;
  orderIndex: number;
}

export interface FormStepResponse {
  id: string;
  title: string;
  orderIndex: number;
  fields: FormFieldResponse[];
}

// Réponse de GET /forms (liste, sans le détail des étapes/champs).
export interface FormListItemResponse {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: FormStatus;
  version: number;
  serviceId: string | null;
  serviceName: string | null;
  stepCount: number;
  fieldCount: number;
  createdAt: string;
  updatedAt: string;
}

// Réponse de GET /forms/:id : le formulaire complet, étapes et champs
// triés par orderIndex — c'est cette forme que le moteur de rendu
// dynamique (frontend) consomme directement, jamais un composant codé en
// dur par service.
export interface FormResponse
  extends Omit<FormListItemResponse, "stepCount" | "fieldCount"> {
  steps: FormStepResponse[];
}

// Corps de POST /forms.
export interface CreateFormRequest {
  name: string;
  slug: string;
  description?: string;
  serviceId?: string;
}

// Corps de PATCH /forms/:id.
export interface UpdateFormRequest {
  name?: string;
  description?: string | null;
  status?: FormStatus;
  serviceId?: string | null;
}

// Corps de POST /forms/:formId/steps et PATCH .../steps/:stepId.
export interface CreateFormStepRequest {
  title: string;
}
export interface UpdateFormStepRequest {
  title?: string;
}

// Corps de POST .../steps/reorder et .../fields/reorder : l'ordre complet
// des identifiants, dans l'ordre voulu.
export interface ReorderRequest {
  orderedIds: string[];
}

// Corps de POST .../fields et PATCH .../fields/:fieldId.
export interface CreateFormFieldRequest {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  options?: FormFieldOption[];
  validation?: FormFieldValidation;
  conditionalLogic?: FormFieldCondition | null;
}
export interface UpdateFormFieldRequest {
  key?: string;
  label?: string;
  type?: FormFieldType;
  required?: boolean;
  options?: FormFieldOption[] | null;
  validation?: FormFieldValidation | null;
  conditionalLogic?: FormFieldCondition | null;
}

// ---- Sessions de qualification (sections 22-23-37-38) ----
//
// Créées et remplissables via des routes authentifiées depuis la Phase 9
// (au nom d'un client, depuis la fiche demande). La Phase 10 ajoute la
// route publique par token (/qualification/:token) au-dessus de la même
// session — sans dupliquer la logique — plus le suivi (section 38) et la
// gestion admin du lien (révoquer/prolonger/régénérer, section 37).

export interface QualificationSessionResponse {
  id: string;
  requestId: string;
  formId: string;
  status: QualificationSessionStatus;
  expiresAt: string;
  sentAt: string | null;
  openedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastActivityAt: string | null;
  // Proportion de champs du formulaire (toutes étapes confondues) ayant
  // une réponse non vide — indicateur de suivi (section 38), pas une
  // mesure exacte de complétion (ignore la visibilité conditionnelle).
  progressPercent: number;
  createdAt: string;
}

// Réponse de POST création et de POST régénération : contient l'URL
// publique complète. Le token brut n'est jamais stocké ni retrouvable
// ensuite (seul son hash SHA-256 l'est) — cette réponse est donc la
// SEULE occasion de le récupérer.
export interface QualificationSessionCreatedResponse extends QualificationSessionResponse {
  qualificationUrl: string;
}

// Réponse de GET /qualification-sessions/:id : la session, le formulaire
// complet à rendre, et les réponses déjà enregistrées (clé = form_fields.key)
// pour restaurer l'état si le prospect (ou l'admin en test) revient.
export interface QualificationSessionDetailResponse
  extends QualificationSessionResponse {
  form: FormResponse;
  responses: Record<string, unknown>;
}

// Corps de POST /requests/:id/qualification-sessions.
export interface CreateQualificationSessionRequest {
  formId: string;
}

// Corps de POST /qualification-sessions/:id/extend. Sans `days`, prolonge
// de QUALIFICATION_LINK_DEFAULT_EXPIRY_DAYS (packages/shared) à partir
// d'aujourd'hui ou de l'expiration actuelle, la plus tardive des deux.
export interface ExtendQualificationSessionRequest {
  days?: number;
}

// Corps de PUT /qualification-sessions/:id/responses/:fieldKey et de
// PUT /public/qualification/:token/responses/:fieldKey.
export interface SaveFormResponseRequest {
  value: unknown;
}

// ---- Page publique de qualification (sections 23-24-34) ----
//
// Contrat volontairement minimal et différent du contrat authentifié :
// jamais de score IA, de notes internes, de profil interne ou de tout
// champ qui ne serait pas déjà destiné au prospect lui-même.
export interface PublicQualificationSessionResponse {
  status: QualificationSessionStatus;
  expiresAt: string;
  contactFirstName: string | null;
  serviceName: string | null;
  requestReference: string;
  form: FormResponse;
  responses: Record<string, unknown>;
}

// Élément de GET /requests/:id/timeline et GET /opportunities/:id/timeline
// (section 43), dans l'ordre
// chronologique. `actorName` n'est renseigné que pour un acteur USER.
export interface TimelineEventResponse {
  id: string;
  type: EventType;
  entityType: EventEntityType;
  entityId: string;
  actorType: EventActorType;
  actorName: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

// ---- Notifications (sections 41-42) ----

export interface NotificationResponse {
  id: string;
  eventType: EventType;
  title: string;
  body: string;
  priority: PriorityLevel;
  // Chemin relatif dans l'application (ex. /requests/<id>), null si aucun.
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface UnreadNotificationsCountResponse {
  count: number;
}

// Une ligne de GET /notifications/preferences : un type d'événement pour
// lequel l'utilisateur peut être notifié, et l'état de chaque canal.
// `locked` : notification critique, le canal ne peut pas être coupé.
export interface NotificationPreferenceResponse {
  eventType: EventType;
  label: string;
  channels: Record<
    Extract<NotificationChannel, "IN_APP" | "EMAIL">,
    { enabled: boolean; locked: boolean }
  >;
}

export interface UpdateNotificationPreferenceRequest {
  eventType: EventType;
  channel: NotificationChannel;
  enabled: boolean;
}

// ---- Équipe et matching (sections 47, 48) ----

export interface SkillResponse {
  id: string;
  name: string;
  category: string | null;
}

export interface TeamMemberSkill {
  skillId: string;
  name: string;
  category: string | null;
  proficiencyLevel: number;
  yearsExperience: number | null;
}

export interface TeamMemberAvailability {
  status: AvailabilityStatus;
  capacityHoursPerWeek: number | null;
  availableFrom: string | null;
  notes: string | null;
}

export interface TeamMemberResponse {
  id: string;
  fullName: string;
  email: string;
  roleKey: string;
  languages: string[];
  country: string | null;
  timezone: string;
  expertise: string | null;
  skills: TeamMemberSkill[];
  availability: TeamMemberAvailability | null;
  activeAssignments: number;
}

// Historique de projets (section 47) : demandes sur lesquelles le
// collaborateur a été affecté.
export interface TeamMemberHistoryItem {
  requestId: string;
  reference: string;
  subject: string;
  status: RequestStatus;
  serviceName: string | null;
  assignedAt: string;
}

// Missions du collaborateur (Phase 19) : celles dont il est membre ou
// chef de projet.
export interface TeamMemberMissionItem {
  missionId: string;
  title: string;
  status: MissionStatus;
  clientCompanyName: string | null;
  roleOnMission: string | null;
  isProjectManager: boolean;
}

export interface TeamMemberDetailResponse extends TeamMemberResponse {
  history: TeamMemberHistoryItem[];
  missions: TeamMemberMissionItem[];
}

export interface UpdateTeamProfileRequest {
  languages: string[];
  country: string | null;
  timezone: string;
  expertise: string | null;
}

export interface UpdateTeamSkillsRequest {
  skills: { skillId: string; proficiencyLevel: number; yearsExperience: number | null }[];
}

export type UpdateAvailabilityRequest = TeamMemberAvailability;

// Score explicable (section 48) : chaque point gagné ou perdu est justifié.
export interface MatchingExplanation {
  positives: string[];
  negatives: string[];
  requiredSkills: string[];
  factors: { skills: number; experience: number; availability: number; language: number };
}

export interface MatchingCandidateResponse {
  userId: string;
  fullName: string;
  roleKey: string;
  rank: number;
  score: number;
  explanation: MatchingExplanation;
  assigned: boolean;
}

export interface RequestTeamMemberResponse {
  userId: string;
  fullName: string;
  score: number | null;
  assignedAt: string;
  assignedByName: string | null;
}

export interface RequestMatchingResponse {
  ranAt: string | null;
  requiredSkills: string[];
  candidates: MatchingCandidateResponse[];
  teamMembers: RequestTeamMemberResponse[];
}

// ---- Opportunités (section 50) ----

export interface OpportunityResponse {
  id: string;
  title: string;
  description: string | null;
  status: OpportunityStatus;
  // Demande d'origine (absente pour une opportunité saisie à la main).
  requestId: string | null;
  requestReference: string | null;
  // Le prospect d'une demande entrante n'a pas toujours de fiche client :
  // `contactFullName` (contact de la demande) le désigne en attendant.
  clientId: string | null;
  clientCompanyName: string | null;
  contactFullName: string | null;
  serviceId: string | null;
  serviceName: string | null;
  estimatedValue: number | null;
  currency: string | null;
  // Probabilité de gain en % : celle de l'étape par défaut, ajustable.
  probability: number | null;
  ownerUserId: string | null;
  ownerName: string | null;
  expectedCloseDate: string | null;
  lostReason: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Total d'une colonne du Kanban, par devise (jamais d'addition de devises
// différentes). `weightedValue` = valeur × probabilité.
export interface OpportunityColumnTotal {
  currency: string;
  value: number;
  weightedValue: number;
}

export interface OpportunityBoardColumn {
  status: OpportunityStatus;
  count: number;
  totals: OpportunityColumnTotal[];
  // Les plus récemment modifiées d'abord, plafonnées par colonne (`count`
  // donne le total réel).
  items: OpportunityResponse[];
}

// Réponse de GET /opportunities/board : une colonne par étape, dans
// l'ordre du pipeline.
export interface OpportunityBoardResponse {
  columns: OpportunityBoardColumn[];
}

// Corps de POST /opportunities. Avec `requestId`, l'opportunité est créée
// depuis la demande (titre, client, service, responsable repris de la
// demande) : les autres champs sont alors ignorés.
export interface CreateOpportunityRequest {
  requestId?: string;
  title?: string;
  description?: string | null;
  clientId?: string | null;
  serviceId?: string | null;
  estimatedValue?: number | null;
  currency?: string | null;
  ownerUserId?: string | null;
  expectedCloseDate?: string | null;
}

// Corps de PATCH /opportunities/:id. `null` efface le champ. L'étape se
// change par PATCH /opportunities/:id/stage.
export interface UpdateOpportunityRequest {
  title?: string;
  description?: string | null;
  clientId?: string | null;
  serviceId?: string | null;
  estimatedValue?: number | null;
  currency?: string | null;
  probability?: number | null;
  ownerUserId?: string | null;
  expectedCloseDate?: string | null;
}

// Corps de PATCH /opportunities/:id/stage.
export interface ChangeOpportunityStageRequest {
  status: OpportunityStatus;
  // Pris en compte uniquement pour l'étape LOST.
  lostReason?: string | null;
}

// ---- Devis (section 51) ----

export interface QuoteItemResponse {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  // Montant de la ligne, hors taxe, remise de ligne déduite.
  total: number;
}

// Totaux d'un devis, toujours calculés par le serveur.
export interface QuoteTotals {
  subtotal: number;
  // Montant de la remise globale (discountPercent appliqué au sous-total).
  discount: number;
  taxAmount: number;
  // Total TTC.
  total: number;
}

export interface QuoteListItemResponse extends QuoteTotals {
  id: string;
  reference: string;
  title: string;
  // EXPIRED est déduit : devis envoyé dont la date de validité est passée.
  status: QuoteStatus;
  opportunityId: string;
  opportunityTitle: string;
  clientId: string;
  clientCompanyName: string;
  currency: string;
  discountPercent: number;
  taxRate: number;
  validUntil: string | null;
  sentAt: string | null;
  sentTo: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteVersionResponse {
  version: number;
  total: number;
  currency: string;
  sentTo: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface QuoteResponse extends QuoteListItemResponse {
  notes: string | null;
  requestId: string | null;
  // Destinataire proposé à l'envoi : contact de la demande, sinon contact
  // principal ou email du client.
  suggestedRecipient: string | null;
  items: QuoteItemResponse[];
  versions: QuoteVersionResponse[];
}

// Corps de POST /quotes : le devis naît en brouillon, sans ligne.
export interface CreateQuoteRequest {
  opportunityId: string;
  title?: string;
}

export interface QuoteItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
}

// Corps de PUT /quotes/:id : le contenu complet du brouillon.
export interface UpdateQuoteRequest {
  title: string;
  notes: string | null;
  currency: string;
  validUntil: string | null;
  discountPercent: number;
  taxRate: number;
  items: QuoteItemInput[];
}

// Corps de POST /quotes/:id/send.
export interface SendQuoteRequest {
  to: string;
  message?: string | null;
}

export interface RejectQuoteRequest {
  reason?: string | null;
}

// Identité de l'émetteur des devis (GET/PUT /company-settings).
export interface CompanySettingsResponse {
  legalName: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  vatNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  iban: string | null;
  defaultTaxRate: number;
  quoteValidityDays: number;
  quoteTerms: string | null;
  updatedAt: string;
}

export type UpdateCompanySettingsRequest = Omit<CompanySettingsResponse, "updatedAt">;

// ---- Missions & tâches (sections 52-53) ----

export interface MissionMemberResponse {
  userId: string;
  fullName: string;
  roleOnMission: string | null;
}

export interface MissionListItemResponse {
  id: string;
  title: string;
  status: MissionStatus;
  priority: PriorityLevel | null;
  clientId: string | null;
  clientCompanyName: string | null;
  opportunityId: string | null;
  serviceId: string | null;
  serviceName: string | null;
  projectManagerId: string | null;
  projectManagerName: string | null;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  currency: string | null;
  // Avancement : tâches terminées / tâches non annulées.
  tasksDone: number;
  tasksTotal: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MissionResponse extends MissionListItemResponse {
  description: string | null;
  blockedReason: string | null;
  completedAt: string | null;
  requestId: string | null;
  requestReference: string | null;
  members: MissionMemberResponse[];
}

// Corps de POST /missions. Avec `opportunityId`, la mission est créée
// depuis l'opportunité (idempotent) et les autres champs sont ignorés.
export interface CreateMissionRequest {
  opportunityId?: string;
  title?: string;
  clientId?: string | null;
  serviceId?: string | null;
  projectManagerId?: string | null;
  description?: string | null;
}

// Corps de PATCH /missions/:id. `null` efface le champ.
export interface UpdateMissionRequest {
  title?: string;
  description?: string | null;
  clientId?: string | null;
  serviceId?: string | null;
  projectManagerId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  priority?: PriorityLevel;
  budget?: number | null;
  currency?: string | null;
}

// Corps de PATCH /missions/:id/status. `reason` pour BLOCKED.
export interface ChangeMissionStatusRequest {
  status: MissionStatus;
  reason?: string | null;
}

export interface AddMissionMemberRequest {
  userId: string;
  roleOnMission?: string | null;
}

export interface TaskResponse {
  id: string;
  missionId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: PriorityLevel | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  completedAt: string | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  priority?: PriorityLevel;
}

// Corps de PATCH /tasks/:id. Le responsable d'une tâche (sans
// missions.manage) ne peut en changer que le statut.
export interface UpdateTaskRequest {
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  priority?: PriorityLevel;
  status?: TaskStatus;
}

export interface TaskCommentResponse {
  id: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  createdAt: string;
}

// ---- Workflow Engine (sections 39, 45, 46) ----

export type WorkflowConditionOperator =
  | "eq"
  | "neq"
  | "in"
  | "notIn"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "exists"
  | "notExists";

export interface WorkflowCondition {
  field: string;
  operator: WorkflowConditionOperator;
  value?: string | number | boolean | (string | number)[];
}

export interface WorkflowStep {
  delayMinutes: number;
  conditions: WorkflowCondition[];
  action: { type: string; params: Record<string, string | number | boolean> };
}

export interface WorkflowResponse {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  triggerEvent: EventType;
  conditions: WorkflowCondition[];
  steps: WorkflowStep[];
  cancelOn: EventType[];
  isActive: boolean;
  updatedAt: string;
}

export interface WorkflowStepLogEntry {
  index: number;
  status: "DONE" | "SKIPPED" | "FAILED";
  at: string;
  detail: string | null;
}

export interface WorkflowRunResponse {
  id: string;
  workflowId: string;
  requestId: string | null;
  requestReference: string | null;
  status: WorkflowRunStatus;
  currentStep: number;
  nextStepAt: string | null;
  stepsLog: WorkflowStepLogEntry[];
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

// GET /workflows/vocabulary : ce qu'une définition peut contenir.
export interface WorkflowVocabularyResponse {
  fields: { key: string; label: string; type: "string" | "number" | "boolean" }[];
  actions: { type: string; label: string; params: Record<string, readonly string[]> }[];
}

// Corps de PUT /workflows/:id : la définition complète, revalidée par le
// serveur (champs, opérateurs et actions autorisés).
export interface UpdateWorkflowRequest {
  name: string;
  description: string | null;
  isActive: boolean;
  conditions: WorkflowCondition[];
  steps: WorkflowStep[];
  cancelOn: EventType[];
}

// Corps de toute réponse d'erreur (AllExceptionsFilter). `message` est un
// tableau pour les erreurs de validation.
export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  requestId: string | null;
}
