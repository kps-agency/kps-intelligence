import { Module } from "@nestjs/common";
import { FormsModule } from "../forms/forms.module";
import { PublicQualificationController } from "./public-qualification.controller";
import { QualificationSessionsController } from "./qualification-sessions.controller";
import { QualificationSessionsService } from "./qualification-sessions.service";

@Module({
  imports: [FormsModule],
  controllers: [QualificationSessionsController, PublicQualificationController],
  providers: [QualificationSessionsService],
  exports: [QualificationSessionsService],
})
export class QualificationSessionsModule {}
