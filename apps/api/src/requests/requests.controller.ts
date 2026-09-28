import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { userActor } from "../events/event-bus.service";
import type { AuthenticatedUser } from "../users/users.types";
import { CreateRequestDto } from "./dto/create-request.dto";
import { ListRequestsQueryDto } from "./dto/list-requests-query.dto";
import { UpdateRequestDto } from "./dto/update-request.dto";
import { RequestsService } from "./requests.service";

// Pas de suppression de demande : c'est l'objet central de tout le
// pipeline (section 16 du prompt), son historique doit rester traçable.
// Source MANUAL uniquement — EMAIL/WHATSAPP arrivent par ingestion
// (modules email et whatsapp), jamais via ce endpoint.
@ApiTags("requests")
@ApiBearerAuth()
@Controller("requests")
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  @RequirePermissions("requests.read")
  list(@Query() query: ListRequestsQueryDto) {
    return this.requestsService.list(query);
  }

  @Get(":id")
  @RequirePermissions("requests.read")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.requestsService.findById(id);
  }

  @Post()
  @RequirePermissions("requests.manage")
  create(@Body() dto: CreateRequestDto, @CurrentUser() user: AuthenticatedUser) {
    return this.requestsService.create(dto, userActor(user));
  }

  @Patch(":id")
  @RequirePermissions("requests.manage")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requestsService.update(id, dto, userActor(user));
  }

  // Re-déclenchement manuel (section 19) : utile après une analyse en échec
  // ou à faible confiance, ou si la demande a été modifiée depuis.
  @Post(":id/analyze")
  @RequirePermissions("requests.manage")
  analyze(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.requestsService.analyze(id, userActor(user));
  }

  @Get(":id/analyses")
  @RequirePermissions("requests.read")
  listAnalyses(@Param("id", ParseUUIDPipe) id: string) {
    return this.requestsService.listAnalyses(id);
  }
}
