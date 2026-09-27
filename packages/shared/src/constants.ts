import { UserRole } from "@kps/types";

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
