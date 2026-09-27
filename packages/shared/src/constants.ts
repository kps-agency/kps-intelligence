import { ClientStatus, PriorityLevel, RequestStatus, UserRole } from "@kps/types";

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

/** Libellés d'affichage des niveaux de priorité/urgence. */
export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  [PriorityLevel.LOW]: "Faible",
  [PriorityLevel.MEDIUM]: "Moyenne",
  [PriorityLevel.HIGH]: "Haute",
  [PriorityLevel.URGENT]: "Urgente",
};
