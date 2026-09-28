import { Module } from "@nestjs/common";
import { ConversationsModule } from "../conversations/conversations.module";
import { RequestsModule } from "../requests/requests.module";
import { EmailIngestionService } from "./email-ingestion.service";
import { EmailStatusController } from "./email-status.controller";
import { EmailService } from "./email.service";

@Module({
  imports: [RequestsModule, ConversationsModule],
  controllers: [EmailStatusController],
  providers: [EmailService, EmailIngestionService],
  exports: [EmailService],
})
export class EmailModule {}
