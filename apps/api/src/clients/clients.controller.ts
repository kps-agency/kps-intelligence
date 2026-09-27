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
import { ClientsService } from "./clients.service";
import { CreateClientDto } from "./dto/create-client.dto";
import { ListClientsQueryDto } from "./dto/list-clients-query.dto";
import { UpdateClientDto } from "./dto/update-client.dto";

// Pas de suppression de client : un client porte l'historique commercial
// (demandes, devis, missions). On l'archive via son statut (INACTIVE /
// CHURNED). La suppression de données personnelles relève du RGPD (Phase 22).
@ApiTags("clients")
@ApiBearerAuth()
@Controller("clients")
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @RequirePermissions("clients.read")
  list(@Query() query: ListClientsQueryDto) {
    return this.clientsService.list(query);
  }

  @Get(":id")
  @RequirePermissions("clients.read")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.clientsService.findById(id);
  }

  @Post()
  @RequirePermissions("clients.manage")
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @Patch(":id")
  @RequirePermissions("clients.manage")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(id, dto);
  }
}
