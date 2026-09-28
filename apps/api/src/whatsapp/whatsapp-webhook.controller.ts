import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  type RawBodyRequest,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeController } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { Public } from "../auth/public.decorator";
import { isValidMetaSignature, safeEqual } from "./webhook-signature";
import { WhatsappIngestionService } from "./whatsapp-ingestion.service";

// Webhook appelé par Meta, pas par un utilisateur : pas de JWT (@Public),
// l'authenticité est garantie par le verify token (abonnement) puis par la
// signature HMAC de chaque notification. Sans secret configuré, tout est
// refusé (fail closed). Rate limiting désactivé : Meta envoie en rafales
// et rejoue tout webhook refusé.
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller("webhooks/whatsapp")
export class WhatsappWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly ingestion: WhatsappIngestionService,
  ) {}

  @Get()
  @Header("Content-Type", "text/plain")
  verify(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") token?: string,
    @Query("hub.challenge") challenge?: string,
  ): string {
    const expected = this.config.get<string>("WHATSAPP_VERIFY_TOKEN");
    if (!expected || mode !== "subscribe" || !token || !challenge || !safeEqual(token, expected)) {
      throw new ForbiddenException("Vérification du webhook refusée.");
    }
    return challenge;
  }

  @Post()
  @HttpCode(200)
  receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Body() body: unknown,
  ): { received: true } {
    const appSecret = this.config.get<string>("WHATSAPP_APP_SECRET");
    if (!appSecret) {
      throw new ServiceUnavailableException("WhatsApp n'est pas configuré.");
    }
    if (!req.rawBody || !isValidMetaSignature(req.rawBody, signature, appSecret)) {
      throw new UnauthorizedException("Signature du webhook invalide.");
    }

    this.ingestion.handleWebhook(body);
    return { received: true };
  }
}
