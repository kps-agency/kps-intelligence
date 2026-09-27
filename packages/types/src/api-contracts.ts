import type { UserRole } from "./enums";

// Contrat partagé entre apps/api (réponse de GET /users/me) et apps/web
// (typage du fetch côté frontend) — évite de redéfinir la même forme aux
// deux bouts.
export interface CurrentUserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleKey: UserRole;
  permissions: string[];
}
