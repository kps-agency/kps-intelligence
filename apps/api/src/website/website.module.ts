import { Module } from "@nestjs/common";
import { ConversationsModule } from "../conversations/conversations.module";
import { RequestsModule } from "../requests/requests.module";
import { WebsiteIngestionService } from "./website-ingestion.service";
import { WebsiteSignatureGuard } from "./website-signature.guard";
import { WebsiteWebhookController } from "./website-webhook.controller";

@Module({
  imports: [RequestsModule, ConversationsModule],
  controllers: [WebsiteWebhookController],
  providers: [WebsiteIngestionService, WebsiteSignatureGuard],
})
export class WebsiteModule {}
