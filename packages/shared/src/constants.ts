// Constantes métier partagées, issues de prompt.md (sections 21, 37).
// Toute règle métier chiffrée (délais, seuils) doit vivre ici plutôt
// qu'être répétée en dur dans les services.

export const APP_NAME = "KPS Intelligence";

/** Durée de validité par défaut d'un lien de qualification (section 37). */
export const QUALIFICATION_LINK_DEFAULT_EXPIRY_DAYS = 30;

/** Préfixe de référence des demandes, ex. KPS-2026-00482 (section 34). */
export const REQUEST_REFERENCE_PREFIX = "KPS";
