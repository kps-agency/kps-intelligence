import { IsBoolean, IsEnum } from "class-validator";
import { EventType, NotificationChannel } from "@kps/types";

export class UpdateNotificationPreferenceDto {
  @IsEnum(EventType, { message: "Type d'événement invalide." })
  eventType!: EventType;

  @IsEnum(NotificationChannel, { message: "Canal invalide." })
  channel!: NotificationChannel;

  @IsBoolean()
  enabled!: boolean;
}
