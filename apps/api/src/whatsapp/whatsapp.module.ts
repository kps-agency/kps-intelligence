import { Module } from "@nestjs/common";
import { ConversationsModule } from "../conversations/conversations.module";
import { RequestsModule } from "../requests/requests.module";
import { WhatsappIngestionService } from "./whatsapp-ingestion.service";
import { WhatsappWebhookController } from "./whatsapp-webhook.controller";
import { WhatsappService } from "./whatsapp.service";

@Module({
  imports: [RequestsModule, ConversationsModule],
  controllers: [WhatsappWebhookController],
  providers: [WhatsappService, WhatsappIngestionService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
