import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { IsEnum, IsUUID } from "class-validator";
import { DOCUMENT_MAX_SIZE_BYTES } from "@kps/shared";
import { DocumentEntityType } from "@kps/types";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import type { AuthenticatedUser } from "../users/users.types";
import { DocumentsService, type UploadedFile as ReceivedFile } from "./documents.service";

class DocumentTargetDto {
  @IsEnum(DocumentEntityType, { message: "Type d'objet invalide." })
  entityType!: DocumentEntityType;

  @IsUUID("4", { message: "entityId doit être un UUID." })
  entityId!: string;
}

// `documents.*` ouvre la porte ; le service exige en plus le droit de
// lecture de l'objet auquel le document est rattaché.
@ApiTags("documents")
@ApiBearerAuth()
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @RequirePermissions("documents.read")
  list(@Query() query: DocumentTargetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.list(query.entityType, query.entityId, user);
  }

  // La limite de taille est appliquée dès la réception (413 au-delà) : le
  // fichier n'est jamais chargé en entier s'il est trop gros.
  @Post()
  @RequirePermissions("documents.manage")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: DOCUMENT_MAX_SIZE_BYTES, files: 1 } }))
  upload(
    @Body() body: DocumentTargetDto,
    @UploadedFile() file: ReceivedFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.upload(body.entityType, body.entityId, file, user);
  }

  @Get(":id/download")
  @RequirePermissions("documents.read")
  download(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.download(id, user);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("documents.manage")
  remove(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.remove(id, user);
  }
}
