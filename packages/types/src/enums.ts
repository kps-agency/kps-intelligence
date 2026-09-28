// Enums partagés frontend/backend, définis à partir de prompt.md
// (sections 4, 12, 15, 16, 22, 30, 43, 50, 52). Source de vérité unique :
// toute évolution de statut doit être ajoutée ici avant d'être utilisée
// côté API ou côté UI.

export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  ADMIN = "ADMIN",
  DIRECTOR = "DIRECTOR",
  SALES = "SALES",
  PROJECT_MANAGER = "PROJECT_MANAGER",
  TECHNICAL_MANAGER = "TECHNICAL_MANAGER",
  TEAM_MEMBER = "TEAM_MEMBER",
  VIEWER = "VIEWER",
}

export enum ClientStatus {
  PROSPECT = "PROSPECT",
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  CHURNED = "CHURNED",
}

export enum ServiceStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  COMING_SOON = "COMING_SOON",
}

export enum ServiceSlug {
  WEBSITE = "WEBSITE",
  ECOMMERCE = "ECOMMERCE",
  SEO = "SEO",
  MAINTENANCE = "MAINTENANCE",
  BUSINESS_APPLICATION = "BUSINESS_APPLICATION",
  // Extensions prévues (prompt.md section 15) — activées au fur et à
  // mesure, pas encore de formulaire de qualification associé.
  MOBILE_APP = "MOBILE_APP",
  AI = "AI",
  AUTOMATION = "AUTOMATION",
  SOFTWARE = "SOFTWARE",
  CONSULTING = "CONSULTING",
}

export enum PriorityLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

export enum RequestSource {
  WEBSITE = "WEBSITE",
  EMAIL = "EMAIL",
  WHATSAPP = "WHATSAPP",
  API = "API",
  MANUAL = "MANUAL",
}

export enum RequestStatus {
  NEW = "NEW",
  RECEIVED = "RECEIVED",
  AI_ANALYZING = "AI_ANALYZING",
  ANALYZED = "ANALYZED",
  FORM_PENDING = "FORM_PENDING",
  FORM_SENT = "FORM_SENT",
  WAITING_CLIENT = "WAITING_CLIENT",
  RESPONSE_RECEIVED = "RESPONSE_RECEIVED",
  QUALIFYING = "QUALIFYING",
  QUALIFIED = "QUALIFIED",
  UNQUALIFIED = "UNQUALIFIED",
  MATCHING = "MATCHING",
  ASSIGNED = "ASSIGNED",
  QUOTE_PENDING = "QUOTE_PENDING",
  QUOTE_SENT = "QUOTE_SENT",
  NEGOTIATION = "NEGOTIATION",
  WON = "WON",
  LOST = "LOST",
  CONVERTED_TO_MISSION = "CONVERTED_TO_MISSION",
  CLOSED = "CLOSED",
}

// Un seul type d'analyse pour l'instant (section 19). L'analyse des
// réponses de qualification (section 40, Phase 9+) et l'extraction de
// documents (section 55) ajouteront leurs propres valeurs plus tard.
export enum AiAnalysisKind {
  REQUEST_ANALYSIS = "REQUEST_ANALYSIS",
  // Analyse des réponses de qualification (section 40, Phase 16).
  QUALIFICATION_ANALYSIS = "QUALIFICATION_ANALYSIS",
}

export enum AvailabilityStatus {
  AVAILABLE = "AVAILABLE",
  BUSY = "BUSY",
  UNAVAILABLE = "UNAVAILABLE",
}

// Verdict de l'analyse des réponses (section 40). NEEDS_REVIEW : l'IA ne
// peut pas trancher, une validation humaine est requise.
export enum QualificationVerdict {
  QUALIFIED = "QUALIFIED",
  UNQUALIFIED = "UNQUALIFIED",
  NEEDS_REVIEW = "NEEDS_REVIEW",
}

export enum AiAnalysisStatus {
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

// Intentions détectables sur une demande entrante (section 19 du prompt).
export enum RequestIntent {
  SERVICE_REQUEST = "SERVICE_REQUEST",
  EXISTING_CLIENT = "EXISTING_CLIENT",
  SUPPORT_REQUEST = "SUPPORT_REQUEST",
  MAINTENANCE_REQUEST = "MAINTENANCE_REQUEST",
  MODIFICATION_REQUEST = "MODIFICATION_REQUEST",
  QUOTE_REQUEST = "QUOTE_REQUEST",
  SPAM = "SPAM",
  OUT_OF_SCOPE = "OUT_OF_SCOPE",
}

export enum QualificationSessionStatus {
  CREATED = "CREATED",
  SENT = "SENT",
  OPENED = "OPENED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  EXPIRED = "EXPIRED",
  CANCELLED = "CANCELLED",
}

export enum OpportunityStatus {
  NEW = "NEW",
  QUALIFIED = "QUALIFIED",
  PROPOSAL_REQUIRED = "PROPOSAL_REQUIRED",
  PROPOSAL_SENT = "PROPOSAL_SENT",
  NEGOTIATION = "NEGOTIATION",
  WON = "WON",
  LOST = "LOST",
}

export enum MissionStatus {
  PLANNED = "PLANNED",
  IN_PROGRESS = "IN_PROGRESS",
  BLOCKED = "BLOCKED",
  ON_HOLD = "ON_HOLD",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum FormStatus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}

export enum FormFieldType {
  TEXT = "TEXT",
  TEXTAREA = "TEXTAREA",
  EMAIL = "EMAIL",
  PHONE = "PHONE",
  NUMBER = "NUMBER",
  SELECT = "SELECT",
  MULTI_SELECT = "MULTI_SELECT",
  RADIO = "RADIO",
  CHECKBOX = "CHECKBOX",
  DATE = "DATE",
  URL = "URL",
  FILE = "FILE",
  CURRENCY = "CURRENCY",
  RANGE = "RANGE",
}

export enum NotificationChannel {
  IN_APP = "IN_APP",
  EMAIL = "EMAIL",
  WHATSAPP = "WHATSAPP",
}

export enum EventActorType {
  SYSTEM = "SYSTEM",
  AI = "AI",
  USER = "USER",
  AUTOMATION = "AUTOMATION",
}

// Catalogue d'événements du système (prompt.md section 4).
// Toute nouvelle étape métier doit ajouter son événement ici avant
// d'être émise par un service.
export enum EventType {
  REQUEST_RECEIVED = "REQUEST_RECEIVED",
  REQUEST_ANALYSIS_STARTED = "REQUEST_ANALYSIS_STARTED",
  REQUEST_ANALYSIS_COMPLETED = "REQUEST_ANALYSIS_COMPLETED",
  SERVICE_DETECTED = "SERVICE_DETECTED",
  QUALIFICATION_REQUIRED = "QUALIFICATION_REQUIRED",
  QUALIFICATION_LINK_CREATED = "QUALIFICATION_LINK_CREATED",
  QUALIFICATION_LINK_SENT = "QUALIFICATION_LINK_SENT",
  QUALIFICATION_LINK_OPENED = "QUALIFICATION_LINK_OPENED",
  FORM_STARTED = "FORM_STARTED",
  FORM_PROGRESS_UPDATED = "FORM_PROGRESS_UPDATED",
  FORM_COMPLETED = "FORM_COMPLETED",
  QUALIFICATION_ANALYSIS_STARTED = "QUALIFICATION_ANALYSIS_STARTED",
  QUALIFICATION_ANALYSIS_COMPLETED = "QUALIFICATION_ANALYSIS_COMPLETED",
  REQUEST_QUALIFIED = "REQUEST_QUALIFIED",
  REQUEST_UNQUALIFIED = "REQUEST_UNQUALIFIED",
  MATCHING_STARTED = "MATCHING_STARTED",
  MATCHING_COMPLETED = "MATCHING_COMPLETED",
  TEAM_MEMBER_RECOMMENDED = "TEAM_MEMBER_RECOMMENDED",
  TEAM_MEMBER_ASSIGNED = "TEAM_MEMBER_ASSIGNED",
  QUOTE_REQUIRED = "QUOTE_REQUIRED",
  QUOTE_CREATED = "QUOTE_CREATED",
  QUOTE_SENT = "QUOTE_SENT",
  QUOTE_ACCEPTED = "QUOTE_ACCEPTED",
  QUOTE_REJECTED = "QUOTE_REJECTED",
  MISSION_CREATED = "MISSION_CREATED",
  MISSION_ASSIGNED = "MISSION_ASSIGNED",
  MISSION_STATUS_CHANGED = "MISSION_STATUS_CHANGED",
  MISSION_BLOCKED = "MISSION_BLOCKED",
  REQUEST_CLOSED = "REQUEST_CLOSED",
  // Ajout hors catalogue section 4 : requis par la gestion d'erreur IA
  // (prompt.md section 68 — une panne Claude doit produire un événement
  // visible plutôt qu'être avalée silencieusement).
  AI_ANALYSIS_FAILED = "AI_ANALYSIS_FAILED",
  // Ajouts Phase 13 : étapes déjà réelles du produit, nécessaires pour que
  // la timeline (section 43) reconstitue fidèlement l'historique.
  REQUEST_STATUS_CHANGED = "REQUEST_STATUS_CHANGED",
  QUALIFICATION_LINK_REVOKED = "QUALIFICATION_LINK_REVOKED",
  QUALIFICATION_LINK_EXTENDED = "QUALIFICATION_LINK_EXTENDED",
  QUALIFICATION_LINK_EXPIRED = "QUALIFICATION_LINK_EXPIRED",
  CONVERSATION_MESSAGE_RECEIVED = "CONVERSATION_MESSAGE_RECEIVED",
  // Ajouts Phase 14.
  REQUEST_ASSIGNED = "REQUEST_ASSIGNED",
  TEAM_NOTIFIED = "TEAM_NOTIFIED",
  // Ajout Phase 15 (relances, section 39).
  QUALIFICATION_REMINDER_SENT = "QUALIFICATION_REMINDER_SENT",
  // Ajout Phase 16.
  TEAM_MEMBER_UNASSIGNED = "TEAM_MEMBER_UNASSIGNED",
}

export enum WorkflowRunStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  WAITING = "WAITING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum EventEntityType {
  REQUEST = "request",
  QUALIFICATION_SESSION = "qualification_session",
  CONVERSATION = "conversation",
}
