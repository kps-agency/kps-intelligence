import { Global, Module } from "@nestjs/common";
import { EventBus } from "./event-bus.service";
import { TimelineController } from "./timeline.controller";
import { TimelineService } from "./timeline.service";

// Global : presque tous les modules métier émettent des événements.
@Global()
@Module({
  controllers: [TimelineController],
  providers: [EventBus, TimelineService],
  exports: [EventBus, TimelineService],
})
export class EventsModule {}
