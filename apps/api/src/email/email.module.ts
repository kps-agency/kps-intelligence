import { Module } from "@nestjs/common";
import { QualificationSessionsModule } from "../qualification-sessions/qualification-sessions.module";
import { RequestsModule } from "../requests/requests.module";
import { ServicesModule } from "../services/services.module";
import { EmailIngestionService } from "./email-ingestion.service";
import { EmailStatusController } from "./email-status.controller";
import { EmailService } from "./email.service";

@Module({
  imports: [RequestsModule, ServicesModule, QualificationSessionsModule],
  controllers: [EmailStatusController],
  providers: [EmailService, EmailIngestionService],
  exports: [EmailService],
})
export class EmailModule {}
