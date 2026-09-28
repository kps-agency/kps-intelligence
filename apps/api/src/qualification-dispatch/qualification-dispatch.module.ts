import { Module } from "@nestjs/common";
import { ConversationsModule } from "../conversations/conversations.module";
import { EmailModule } from "../email/email.module";
import { QualificationSessionsModule } from "../qualification-sessions/qualification-sessions.module";
import { ServicesModule } from "../services/services.module";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { QualificationDispatchHandlers } from "./qualification-dispatch.handlers";

@Module({
  imports: [
    ServicesModule,
    QualificationSessionsModule,
    ConversationsModule,
    EmailModule,
    WhatsappModule,
  ],
  providers: [QualificationDispatchHandlers],
})
export class QualificationDispatchModule {}
