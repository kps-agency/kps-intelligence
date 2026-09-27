import { Module } from "@nestjs/common";
import { AI_SERVICE } from "./ai.service.interface";
import { AnthropicAiService } from "./anthropic-ai.service";

@Module({
  providers: [{ provide: AI_SERVICE, useClass: AnthropicAiService }],
  exports: [AI_SERVICE],
})
export class AiModule {}
