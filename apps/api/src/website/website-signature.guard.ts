import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type RawBodyRequest,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { isValidWebsiteSignature, parseSiteSecrets } from "./website-signature";

// Garde plutôt que vérification dans le handler : elle s'exécute avant la
// validation du DTO, donc une requête non signée est refusée (401) sans
// jamais que son contenu soit interprété. Fail closed : un site sans
// secret configuré est refusé.
@Injectable()
export class WebsiteSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const site = String(req.params.site ?? "").toLowerCase();
    const secret = parseSiteSecrets(this.config.get<string>("WEBSITE_WEBHOOK_SECRETS")).get(site);
    if (!secret) {
      throw new ServiceUnavailableException("Ce site n'est pas configuré.");
    }

    const valid =
      req.rawBody !== undefined &&
      isValidWebsiteSignature({
        rawBody: req.rawBody,
        signatureHeader: req.header("x-kps-signature"),
        timestampHeader: req.header("x-kps-timestamp"),
        secret,
      });
    if (!valid) throw new UnauthorizedException("Signature invalide.");
    return true;
  }
}
