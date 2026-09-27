import { Module } from "@nestjs/common";
import { FormsModule } from "../forms/forms.module";
import { QualificationSessionsController } from "./qualification-sessions.controller";
import { QualificationSessionsService } from "./qualification-sessions.service";

@Module({
  imports: [FormsModule],
  controllers: [QualificationSessionsController],
  providers: [QualificationSessionsService],
})
export class QualificationSessionsModule {}
