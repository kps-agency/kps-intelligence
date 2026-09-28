import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { QualificationSessionsModule } from "../qualification-sessions/qualification-sessions.module";
import { QualificationAnalysisController } from "./qualification-analysis.controller";
import { QualificationAnalysisService } from "./qualification-analysis.service";

@Module({
  imports: [AiModule, QualificationSessionsModule],
  controllers: [QualificationAnalysisController],
  providers: [QualificationAnalysisService],
  exports: [QualificationAnalysisService],
})
export class QualificationAnalysisModule {}
