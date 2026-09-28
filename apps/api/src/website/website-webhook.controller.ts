import { Body, Controller, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth/public.decorator";
import { WebsiteSubmissionDto } from "./dto/website-submission.dto";
import { WebsiteIngestionService, type WebsiteIngestionResult } from "./website-ingestion.service";
import { WebsiteSignatureGuard } from "./website-signature.guard";

// Appelé par le serveur d'un site (jamais par un navigateur) : pas de JWT
// (@Public), l'authenticité est garantie par la signature HMAC du site
// (WebsiteSignatureGuard). Limite dédiée, plus stricte que la globale :
// un formulaire public ne produit pas des dizaines de soumissions par
// minute, un emballement côté site ne doit pas saturer l'analyse IA.
@ApiExcludeController()
@Public()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller("webhooks/website")
export class WebsiteWebhookController {
  constructor(private readonly ingestion: WebsiteIngestionService) {}

  @Post(":site")
  @HttpCode(200)
  @UseGuards(WebsiteSignatureGuard)
  receive(
    @Param("site") site: string,
    @Body() submission: WebsiteSubmissionDto,
  ): Promise<WebsiteIngestionResult> {
    return this.ingestion.ingest(site.toLowerCase(), submission);
  }
}
