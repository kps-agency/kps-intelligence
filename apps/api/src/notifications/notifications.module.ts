import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { NotificationEmailQueue } from "./notification-email.queue";
import { NotificationsController } from "./notifications.controller";
import { NotificationsDispatcher } from "./notifications.dispatcher";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [EmailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsDispatcher, NotificationEmailQueue],
})
export class NotificationsModule {}
