import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRE_PERMISSIONS_KEY } from "./require-permissions.decorator";
import type { AuthenticatedRequest } from "./authenticated-request.interface";

// S'exécute après JwtAuthGuard (qui a peuplé request.user.permissions à
// partir de la matrice role_permissions en base). Ne fait rien si la
// route ne déclare aucune permission requise.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const hasAll = required.every((permission) =>
      request.user.permissions.includes(permission),
    );
    if (!hasAll) {
      throw new ForbiddenException("Permission insuffisante.");
    }
    return true;
  }
}
