import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { EventEntityType } from "@kps/types";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { userActor } from "../events/event-bus.service";
import { TimelineService } from "../events/timeline.service";
import type { AuthenticatedUser } from "../users/users.types";
import {
  CreateQuoteDto,
  ListQuotesQueryDto,
  RejectQuoteDto,
  SendQuoteDto,
  UpdateQuoteDto,
} from "./dto/quote.dto";
import { QuotesService } from "./quotes.service";

function pdfFile(file: { filename: string; content: Buffer }): StreamableFile {
  return new StreamableFile(file.content, {
    type: "application/pdf",
    disposition: `attachment; filename="${file.filename}"`,
    length: file.content.length,
  });
}

// Pas de suppression : un devis envoyé est une pièce commerciale, son
// historique de versions reste consultable.
@ApiTags("quotes")
@ApiBearerAuth()
@Controller("quotes")
export class QuotesController {
  constructor(
    private readonly quotesService: QuotesService,
    private readonly timelineService: TimelineService,
  ) {}

  @Get()
  @RequirePermissions("quotes.read")
  list(@Query() query: ListQuotesQueryDto) {
    return this.quotesService.list(query);
  }

  @Get(":id")
  @RequirePermissions("quotes.read")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.quotesService.findById(id);
  }

  @Get(":id/pdf")
  @RequirePermissions("quotes.read")
  async pdf(@Param("id", ParseUUIDPipe) id: string) {
    return pdfFile(await this.quotesService.currentPdf(id));
  }

  @Get(":id/versions/:version/pdf")
  @RequirePermissions("quotes.read")
  async versionPdf(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("version", ParseIntPipe) version: number,
  ) {
    return pdfFile(await this.quotesService.versionPdf(id, version));
  }

  @Get(":id/timeline")
  @RequirePermissions("quotes.read")
  async timeline(@Param("id", ParseUUIDPipe) id: string) {
    await this.quotesService.findById(id);
    return this.timelineService.forEntity(EventEntityType.QUOTE, id);
  }

  @Post()
  @RequirePermissions("quotes.manage")
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.quotesService.create(dto, userActor(user));
  }

  @Put(":id")
  @RequirePermissions("quotes.manage")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateQuoteDto) {
    return this.quotesService.update(id, dto);
  }

  // Section 6 : l'envoi est toujours l'action explicite d'un utilisateur.
  @Post(":id/send")
  @HttpCode(200)
  @RequirePermissions("quotes.manage")
  send(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SendQuoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.send(id, dto, userActor(user));
  }

  @Post(":id/revise")
  @HttpCode(200)
  @RequirePermissions("quotes.manage")
  revise(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.quotesService.revise(id, userActor(user));
  }

  @Post(":id/accept")
  @HttpCode(200)
  @RequirePermissions("quotes.manage")
  accept(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.quotesService.accept(id, userActor(user));
  }

  @Post(":id/reject")
  @HttpCode(200)
  @RequirePermissions("quotes.manage")
  reject(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RejectQuoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.reject(id, dto, userActor(user));
  }
}
