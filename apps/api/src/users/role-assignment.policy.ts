import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@kps/types";
import type { AuthenticatedUser } from "./users.types";

interface RoleAssignment {
  actor: AuthenticatedUser;
  // Absent à la création d'un utilisateur (il n'existe pas encore).
  targetUserId?: string;
  targetCurrentRole?: string;
  newRole: string;
}

/**
 * Empêche l'élévation de privilèges par la gestion des utilisateurs.
 * `users.manage` seul ne suffit pas à attribuer n'importe quel rôle :
 *  - personne ne modifie son propre rôle (un ADMIN ne peut ni se
 *    promouvoir, ni se rétrograder par erreur) ;
 *  - seul un SUPER_ADMIN peut attribuer le rôle SUPER_ADMIN, ou modifier
 *    le rôle d'un SUPER_ADMIN existant.
 */
export function assertCanAssignRole({
  actor,
  targetUserId,
  targetCurrentRole,
  newRole,
}: RoleAssignment): void {
  if (targetUserId !== undefined && targetUserId === actor.id) {
    throw new ForbiddenException("Vous ne pouvez pas modifier votre propre rôle.");
  }

  const actorIsSuperAdmin = actor.roleKey === UserRole.SUPER_ADMIN;
  const touchesSuperAdmin =
    newRole === UserRole.SUPER_ADMIN || targetCurrentRole === UserRole.SUPER_ADMIN;

  if (touchesSuperAdmin && !actorIsSuperAdmin) {
    throw new ForbiddenException(
      "Seul un super administrateur peut attribuer ou modifier ce rôle.",
    );
  }
}
