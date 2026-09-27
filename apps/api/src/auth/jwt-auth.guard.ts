import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtVerifierService } from "./jwt-verifier.service";
import { IS_PUBLIC_KEY } from "./public.decorator";
import type { AuthenticatedRequest } from "./authenticated-request.interface";
import { UsersService } from "../users/users.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtVerifier: JwtVerifierService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Token manquant.");
    }
    const token = authHeader.slice("Bearer ".length);

    const payload = await this.jwtVerifier.verify(token);
    const authUserId = payload.sub;
    if (!authUserId) {
      throw new UnauthorizedException("Token invalide.");
    }

    const user = await this.usersService.findAuthContext(authUserId);
    if (!user) {
      throw new ForbiddenException("Compte inconnu ou désactivé.");
    }

    request.user = user;
    return true;
  }
}
