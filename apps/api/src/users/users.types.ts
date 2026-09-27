// Contexte RBAC résolu pour un utilisateur authentifié, attaché à
// request.user par le JwtAuthGuard — jamais reconstruit ailleurs.
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleKey: string;
  permissions: string[];
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsapp: string | null;
  avatarUrl: string | null;
  roleKey: string;
  status: string;
  timezone: string;
  language: string;
  createdAt: string;
  updatedAt: string;
}
