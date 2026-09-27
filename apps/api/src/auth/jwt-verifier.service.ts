import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// Vérifie les JWT émis par Supabase Auth via son endpoint JWKS (clés
// asymétriques — nouveau système de clés Supabase, voir SECURITY.md).
// Aucun secret partagé n'est utilisé pour cette vérification.
@Injectable()
export class JwtVerifierService {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(configService: ConfigService) {
    const jwksUrl = configService.getOrThrow<string>("SUPABASE_JWKS_URL");
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  async verify(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.jwks);
      return payload;
    } catch {
      throw new UnauthorizedException("Token invalide ou expiré.");
    }
  }
}
