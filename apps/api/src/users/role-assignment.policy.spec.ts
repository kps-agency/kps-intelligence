import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@kps/types";
import { assertCanAssignRole } from "./role-assignment.policy";
import type { AuthenticatedUser } from "./users.types";

function actor(roleKey: UserRole, id = "actor-1"): AuthenticatedUser {
  return {
    id,
    email: "actor@kps.agency",
    firstName: "A",
    lastName: "B",
    roleKey,
    permissions: ["users.manage"],
  };
}

describe("assertCanAssignRole", () => {
  it("autorise un ADMIN à attribuer un rôle ordinaire à un autre utilisateur", () => {
    expect(() =>
      assertCanAssignRole({
        actor: actor(UserRole.ADMIN),
        targetUserId: "user-2",
        targetCurrentRole: UserRole.VIEWER,
        newRole: UserRole.SALES,
      }),
    ).not.toThrow();
  });

  it("interdit de modifier son propre rôle, même pour un SUPER_ADMIN", () => {
    expect(() =>
      assertCanAssignRole({
        actor: actor(UserRole.SUPER_ADMIN, "me"),
        targetUserId: "me",
        targetCurrentRole: UserRole.SUPER_ADMIN,
        newRole: UserRole.ADMIN,
      }),
    ).toThrow(ForbiddenException);
  });

  it("interdit à un ADMIN de se promouvoir ou de promouvoir quelqu'un SUPER_ADMIN", () => {
    expect(() =>
      assertCanAssignRole({
        actor: actor(UserRole.ADMIN),
        targetUserId: "user-2",
        targetCurrentRole: UserRole.VIEWER,
        newRole: UserRole.SUPER_ADMIN,
      }),
    ).toThrow(ForbiddenException);
  });

  it("interdit à un ADMIN de rétrograder un SUPER_ADMIN", () => {
    expect(() =>
      assertCanAssignRole({
        actor: actor(UserRole.ADMIN),
        targetUserId: "user-2",
        targetCurrentRole: UserRole.SUPER_ADMIN,
        newRole: UserRole.VIEWER,
      }),
    ).toThrow(ForbiddenException);
  });

  it("autorise un SUPER_ADMIN à promouvoir un autre utilisateur SUPER_ADMIN", () => {
    expect(() =>
      assertCanAssignRole({
        actor: actor(UserRole.SUPER_ADMIN),
        targetUserId: "user-2",
        targetCurrentRole: UserRole.ADMIN,
        newRole: UserRole.SUPER_ADMIN,
      }),
    ).not.toThrow();
  });

  it("à la création : un ADMIN ne peut pas créer un SUPER_ADMIN, mais peut créer les autres rôles", () => {
    expect(() =>
      assertCanAssignRole({ actor: actor(UserRole.ADMIN), newRole: UserRole.SUPER_ADMIN }),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertCanAssignRole({ actor: actor(UserRole.ADMIN), newRole: UserRole.DIRECTOR }),
    ).not.toThrow();
  });
});
