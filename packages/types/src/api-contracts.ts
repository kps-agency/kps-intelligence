import type {
  AiAnalysisStatus,
  ClientStatus,
  EventActorType,
  EventEntityType,
  EventType,
  FormFieldType,
  FormStatus,
  PriorityLevel,
  QualificationSessionStatus,
  RequestIntent,
  RequestSource,
  RequestStatus,
  ServiceSlug,
  ServiceStatus,
  UserRole,
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
  createdAt: string;
  updatedAt: string;
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
export interface AiAnalysisResponse {
  id: string;
  requestId: string;
  status: AiAnalysisStatus;
  model: string;
  confidence: number | null;
  // `null` quand status = FAILED.
  result: RequestAnalysisResult | null;
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

// Élément de GET /requests/:id/timeline (section 43), dans l'ordre
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

// Corps de toute réponse d'erreur (AllExceptionsFilter). `message` est un
// tableau pour les erreurs de validation.
export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  requestId: string | null;
}
