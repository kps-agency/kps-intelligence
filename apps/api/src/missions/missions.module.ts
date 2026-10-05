import { Module } from "@nestjs/common";
import { MissionsController } from "./missions.controller";
import { MissionsService } from "./missions.service";
import { TasksService } from "./tasks.service";

@Module({
  controllers: [MissionsController],
  providers: [MissionsService, TasksService],
  exports: [MissionsService],
})
export class MissionsModule {}
