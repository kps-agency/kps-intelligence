import { Controller, Get } from "@nestjs/common";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { RolesService } from "./roles.service";

@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions("roles.read")
  list() {
    return this.rolesService.list();
  }
}
