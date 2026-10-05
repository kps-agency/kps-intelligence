import {
  ClientStatus,
  FormFieldType,
  FormStatus,
  MissionStatus,
  OpportunityStatus,
  PriorityLevel,
  QuoteStatus,
  RequestIntent,
  RequestStatus,
  ServiceStatus,
  TaskStatus,
  UserRole,
} from "@kps/types";

// Constantes métier partagées, issues de prompt.md (sections 12, 21, 37).
// Toute règle métier chiffrée (délais, seuils) doit vivre ici plutôt
// qu'être répétée en dur dans les services.

export const APP_NAME = "KPS Intelligence";

/** Durée de validité par défaut d'un lien de qualification (section 37). */
export const QUALIFICATION_LINK_DEFAULT_EXPIRY_DAYS = 30;

/** Préfixe de référence des demandes, ex. KPS-2026-00482 (section 34). */
export const REQUEST_REFERENCE_PREFIX = "KPS";

/**
 * Libellés d'affichage des rôles (section 12). Les rôles sont un enum
 * fixe validé par l'API : ajouter un rôle = l'ajouter à UserRole, à la
 * base (seed) et ici.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: "Super administrateur",
  [UserRole.ADMIN]: "Administrateur",
  [UserRole.DIRECTOR]: "Directeur",
  [UserRole.SALES]: "Commercial",
  [UserRole.PROJECT_MANAGER]: "Chef de projet",
  [UserRole.TECHNICAL_MANAGER]: "Responsable technique",
  [UserRole.TEAM_MEMBER]: "Collaborateur",
  [UserRole.VIEWER]: "Observateur",
};

/** Libellés d'affichage des statuts client (section 13). */
export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  [ClientStatus.PROSPECT]: "Prospect",
  [ClientStatus.ACTIVE]: "Actif",
  [ClientStatus.INACTIVE]: "Inactif",
  [ClientStatus.CHURNED]: "Perdu",
};

/** Libellés d'affichage des statuts de demande (section 16). */
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  [RequestStatus.NEW]: "Nouvelle",
  [RequestStatus.RECEIVED]: "Reçue",
  [RequestStatus.AI_ANALYZING]: "Analyse IA en cours",
  [RequestStatus.ANALYZED]: "Analysée",
  [RequestStatus.FORM_PENDING]: "Formulaire à envoyer",
  [RequestStatus.FORM_SENT]: "Formulaire envoyé",
  [RequestStatus.WAITING_CLIENT]: "En attente du client",
  [RequestStatus.RESPONSE_RECEIVED]: "Réponse reçue",
  [RequestStatus.QUALIFYING]: "Qualification en cours",
  [RequestStatus.QUALIFIED]: "Qualifiée",
  [RequestStatus.UNQUALIFIED]: "Non qualifiée",
  [RequestStatus.MATCHING]: "Recherche d'équipe",
  [RequestStatus.ASSIGNED]: "Assignée",
  [RequestStatus.QUOTE_PENDING]: "Devis à préparer",
  [RequestStatus.QUOTE_SENT]: "Devis envoyé",
  [RequestStatus.NEGOTIATION]: "Négociation",
  [RequestStatus.WON]: "Gagnée",
  [RequestStatus.LOST]: "Perdue",
  [RequestStatus.CONVERTED_TO_MISSION]: "Convertie en mission",
  [RequestStatus.CLOSED]: "Clôturée",
};

/** Étapes du pipeline commercial, dans l'ordre des colonnes du Kanban (section 50). */
export const OPPORTUNITY_PIPELINE: OpportunityStatus[] = [
  OpportunityStatus.NEW,
  OpportunityStatus.QUALIFIED,
  OpportunityStatus.PROPOSAL_REQUIRED,
  OpportunityStatus.PROPOSAL_SENT,
  OpportunityStatus.NEGOTIATION,
  OpportunityStatus.WON,
  OpportunityStatus.LOST,
];

/** Libellés d'affichage des étapes d'une opportunité (section 50). */
export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  [OpportunityStatus.NEW]: "Nouvelle",
  [OpportunityStatus.QUALIFIED]: "Qualifiée",
  [OpportunityStatus.PROPOSAL_REQUIRED]: "Devis à préparer",
  [OpportunityStatus.PROPOSAL_SENT]: "Devis envoyé",
  [OpportunityStatus.NEGOTIATION]: "Négociation",
  [OpportunityStatus.WON]: "Gagnée",
  [OpportunityStatus.LOST]: "Perdue",
};

/**
 * Probabilité de gain (en %) appliquée quand une opportunité entre dans
 * une étape ; elle reste ajustable à la main jusqu'au changement d'étape
 * suivant.
 */
export const OPPORTUNITY_STAGE_PROBABILITY: Record<OpportunityStatus, number> = {
  [OpportunityStatus.NEW]: 10,
  [OpportunityStatus.QUALIFIED]: 25,
  [OpportunityStatus.PROPOSAL_REQUIRED]: 40,
  [OpportunityStatus.PROPOSAL_SENT]: 60,
  [OpportunityStatus.NEGOTIATION]: 75,
  [OpportunityStatus.WON]: 100,
  [OpportunityStatus.LOST]: 0,
};

/** Libellés d'affichage des statuts de devis (section 51). */
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  [QuoteStatus.DRAFT]: "Brouillon",
  [QuoteStatus.SENT]: "Envoyé",
  [QuoteStatus.ACCEPTED]: "Accepté",
  [QuoteStatus.REJECTED]: "Refusé",
  [QuoteStatus.EXPIRED]: "Expiré",
};

export interface QuoteLineInput {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
}

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Calcul d'un devis (section 51). Source unique : l'API l'applique à
 * l'enregistrement (elle fait autorité), l'interface s'en sert pour
 * l'aperçu pendant la saisie. Chaque ligne est arrondie au centime, puis
 * la remise globale et la taxe sont calculées sur les montants arrondis.
 */
export function computeQuoteTotals(
  lines: QuoteLineInput[],
  discountPercent: number,
  taxRate: number,
): { lineTotals: number[]; subtotal: number; discount: number; taxAmount: number; total: number } {
  const lineTotals = lines.map((line) =>
    roundMoney(line.quantity * line.unitPrice * (1 - line.discountPercent / 100)),
  );
  const subtotal = roundMoney(lineTotals.reduce((sum, value) => sum + value, 0));
  const discount = roundMoney((subtotal * discountPercent) / 100);
  const taxAmount = roundMoney(((subtotal - discount) * taxRate) / 100);
  return { lineTotals, subtotal, discount, taxAmount, total: roundMoney(subtotal - discount + taxAmount) };
}

/** Libellés d'affichage des statuts de mission (section 52). */
export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  [MissionStatus.PLANNED]: "Planifiée",
  [MissionStatus.IN_PROGRESS]: "En cours",
  [MissionStatus.BLOCKED]: "Bloquée",
  [MissionStatus.ON_HOLD]: "En pause",
  [MissionStatus.COMPLETED]: "Terminée",
  [MissionStatus.CANCELLED]: "Annulée",
};

/** Libellés d'affichage des statuts de tâche (section 53). */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: "À faire",
  [TaskStatus.IN_PROGRESS]: "En cours",
  [TaskStatus.BLOCKED]: "Bloquée",
  [TaskStatus.DONE]: "Terminée",
  [TaskStatus.CANCELLED]: "Annulée",
};

/** Taille maximale d'un document déposé (section 54), en octets. */
export const DOCUMENT_MAX_SIZE_BYTES = 15 * 1024 * 1024;

/**
 * Types de fichier acceptés (section 54 : cahiers des charges, PDF,
 * images, devis, contrats). Clé = type MIME, valeur = extensions admises.
 */
export const DOCUMENT_ALLOWED_TYPES: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "text/plain": ["txt"],
  "text/csv": ["csv"],
};

/** Libellés d'affichage des niveaux de priorité/urgence. */
export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  [PriorityLevel.LOW]: "Faible",
  [PriorityLevel.MEDIUM]: "Moyenne",
  [PriorityLevel.HIGH]: "Haute",
  [PriorityLevel.URGENT]: "Urgente",
};

/** Libellés d'affichage des intentions détectées par l'analyse IA (section 19). */
export const REQUEST_INTENT_LABELS: Record<RequestIntent, string> = {
  [RequestIntent.SERVICE_REQUEST]: "Nouvelle demande de service",
  [RequestIntent.EXISTING_CLIENT]: "Client existant",
  [RequestIntent.SUPPORT_REQUEST]: "Demande de support",
  [RequestIntent.MAINTENANCE_REQUEST]: "Demande de maintenance",
  [RequestIntent.MODIFICATION_REQUEST]: "Demande de modification",
  [RequestIntent.QUOTE_REQUEST]: "Demande de devis",
  [RequestIntent.SPAM]: "Spam",
  [RequestIntent.OUT_OF_SCOPE]: "Hors périmètre",
};

/**
 * Sous ce seuil de confiance (section 71), une analyse IA doit être
 * signalée comme nécessitant une validation humaine plutôt qu'être prise
 * telle quelle.
 */
export const AI_LOW_CONFIDENCE_THRESHOLD = 0.6;

/** Libellés d'affichage des statuts de service (section 15). */
export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  [ServiceStatus.ACTIVE]: "Actif",
  [ServiceStatus.INACTIVE]: "Inactif",
  [ServiceStatus.COMING_SOON]: "Bientôt disponible",
};

/** Libellés d'affichage des statuts de formulaire (section 30). */
export const FORM_STATUS_LABELS: Record<FormStatus, string> = {
  [FormStatus.DRAFT]: "Brouillon",
  [FormStatus.PUBLISHED]: "Publié",
  [FormStatus.ARCHIVED]: "Archivé",
};

/** Libellés d'affichage des types de champ du form builder (section 30). */
export const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  [FormFieldType.TEXT]: "Texte court",
  [FormFieldType.TEXTAREA]: "Texte long",
  [FormFieldType.EMAIL]: "Email",
  [FormFieldType.PHONE]: "Téléphone",
  [FormFieldType.NUMBER]: "Nombre",
  [FormFieldType.SELECT]: "Liste déroulante",
  [FormFieldType.MULTI_SELECT]: "Sélection multiple",
  [FormFieldType.RADIO]: "Choix unique",
  [FormFieldType.CHECKBOX]: "Cases à cocher",
  [FormFieldType.DATE]: "Date",
  [FormFieldType.URL]: "URL",
  [FormFieldType.FILE]: "Fichier",
  [FormFieldType.CURRENCY]: "Montant",
  [FormFieldType.RANGE]: "Plage",
};

/** Types de champ dont les options (valeur/libellé) doivent être fournies. */
export const OPTION_BASED_FIELD_TYPES: FormFieldType[] = [
  FormFieldType.SELECT,
  FormFieldType.MULTI_SELECT,
  FormFieldType.RADIO,
  FormFieldType.CHECKBOX,
];
