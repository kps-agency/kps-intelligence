import { SetMetadata } from "@nestjs/common";

export const REQUIRE_PERMISSIONS_KEY = "require_permissions";

// Déclare les permissions RBAC requises pour accéder à une route.
// La matrice rôle -> permission reste pilotée par les tables
// roles/permissions/role_permissions, jamais par un test de rôle en dur.
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
