import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ContactsService } from "./contacts.service";
import { CreateContactDto } from "./dto/create-contact.dto";
import { ListContactsQueryDto } from "./dto/list-contacts-query.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";

// Un contact appartient toujours à un client : création et liste par
// client sous /clients/:clientId/contacts ; liste transversale, lecture,
// modification et suppression sous /contacts.
@ApiTags("contacts")
@ApiBearerAuth()
@Controller()
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get("clients/:clientId/contacts")
  @RequirePermissions("contacts.read")
  listByClient(@Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.contactsService.listByClient(clientId);
  }

  @Post("clients/:clientId/contacts")
  @RequirePermissions("contacts.manage")
  create(
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() dto: CreateContactDto,
  ) {
    return this.contactsService.create(clientId, dto);
  }

  @Get("contacts")
  @RequirePermissions("contacts.read")
  list(@Query() query: ListContactsQueryDto) {
    return this.contactsService.list(query);
  }

  @Get("contacts/:id")
  @RequirePermissions("contacts.read")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.contactsService.findById(id);
  }

  @Patch("contacts/:id")
  @RequirePermissions("contacts.manage")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateContactDto) {
    return this.contactsService.update(id, dto);
  }

  @Delete("contacts/:id")
  @HttpCode(204)
  @RequirePermissions("contacts.manage")
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.contactsService.remove(id);
  }
}
