import type { UserRole } from "./enums";

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

// Corps de toute réponse d'erreur (AllExceptionsFilter). `message` est un
// tableau pour les erreurs de validation.
export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  requestId: string | null;
}
