import { Module } from "@nestjs/common";
import { QualificationSessionsModule } from "../qualification-sessions/qualification-sessions.module";
import { RequestsModule } from "../requests/requests.module";
import { ServicesModule } from "../services/services.module";
import { WhatsappIngestionService } from "./whatsapp-ingestion.service";
import { WhatsappWebhookController } from "./whatsapp-webhook.controller";
import { WhatsappService } from "./whatsapp.service";

@Module({
  imports: [RequestsModule, ServicesModule, QualificationSessionsModule],
  controllers: [WhatsappWebhookController],
  providers: [WhatsappService, WhatsappIngestionService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
