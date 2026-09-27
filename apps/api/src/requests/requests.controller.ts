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
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { CreateRequestDto } from "./dto/create-request.dto";
import { ListRequestsQueryDto } from "./dto/list-requests-query.dto";
import { UpdateRequestDto } from "./dto/update-request.dto";
import { RequestsService } from "./requests.service";

// Pas de suppression de demande : c'est l'objet central de tout le
// pipeline (section 16 du prompt), son historique doit rester traçable.
// Source MANUAL uniquement pour l'instant — EMAIL/WHATSAPP/WEBSITE/API
// arriveront par webhook aux Phases 11-12, jamais via ce endpoint.
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
  create(@Body() dto: CreateRequestDto) {
    return this.requestsService.create(dto);
  }

  @Patch(":id")
  @RequirePermissions("requests.manage")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateRequestDto) {
    return this.requestsService.update(id, dto);
  }

  // Re-déclenchement manuel (section 19) : utile après une analyse en échec
  // ou à faible confiance, ou si la demande a été modifiée depuis.
  @Post(":id/analyze")
  @RequirePermissions("requests.manage")
  analyze(@Param("id", ParseUUIDPipe) id: string) {
    return this.requestsService.analyze(id);
  }

  @Get(":id/analyses")
  @RequirePermissions("requests.read")
  listAnalyses(@Param("id", ParseUUIDPipe) id: string) {
    return this.requestsService.listAnalyses(id);
  }
}
