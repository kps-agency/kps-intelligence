import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import type { AuthenticatedUser } from "../users/users.types";
import { PrivacyService, type RequestOrigin } from "./privacy.service";

function origin(user: AuthenticatedUser, request: Request): RequestOrigin {
  const userAgent = request.headers["user-agent"];
  return { userId: user.id, ip: request.ip ?? null, userAgent: typeof userAgent === "string" ? userAgent.slice(0, 500) : null };
}

// Réservé à `privacy.manage` (administrateurs) : ces opérations exposent
// ou détruisent toutes les données d'une personne.
@ApiTags("privacy")
@ApiBearerAuth()
@Controller("contacts/:id")
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Get("personal-data")
  @RequirePermissions("privacy.manage")
  export(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.privacyService.exportContact(id, origin(user, request));
  }

  @Post("anonymize")
  @HttpCode(200)
  @RequirePermissions("privacy.manage")
  anonymize(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.privacyService.anonymizeContact(id, origin(user, request));
  }
}
