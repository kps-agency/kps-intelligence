import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { RequestsController } from "./requests.controller";
import { RequestsService } from "./requests.service";

@Module({
  imports: [AiModule],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
