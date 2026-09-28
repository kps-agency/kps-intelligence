import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../users/users.types";
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto";
import { UpdateNotificationPreferenceDto } from "./dto/update-notification-preference.dto";
import { NotificationsService } from "./notifications.service";

// Aucune permission requise : chaque utilisateur authentifié ne lit et ne
// modifie que ses propres notifications et préférences (filtre serveur
// sur l'utilisateur du jeton, jamais sur un id fourni par le client).
@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.list(user.id, query);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.unreadCount(user.id);
  }

  @Get("preferences")
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.preferences(user.id);
  }

  @Put("preferences")
  updatePreference(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    return this.notificationsService.updatePreference(user.id, dto);
  }

  @Post("read-all")
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Post(":id/read")
  markRead(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.notificationsService.markRead(user.id, id);
  }
}
