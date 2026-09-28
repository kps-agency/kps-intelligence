import { Module } from "@nestjs/common";
import { ConversationsModule } from "../conversations/conversations.module";
import { EmailModule } from "../email/email.module";
import { MatchingModule } from "../matching/matching.module";
import { QualificationAnalysisModule } from "../qualification-analysis/qualification-analysis.module";
import { QualificationSessionsModule } from "../qualification-sessions/qualification-sessions.module";
import { ServicesModule } from "../services/services.module";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { WorkflowActionsService } from "./workflow-actions.service";
import { WorkflowEngine } from "./workflow-engine.service";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";

@Module({
  imports: [
    ServicesModule,
    QualificationSessionsModule,
    ConversationsModule,
    EmailModule,
    WhatsappModule,
    QualificationAnalysisModule,
    MatchingModule,
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowEngine, WorkflowActionsService],
})
export class WorkflowsModule {}
