import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserRoleDto } from "./dto/update-user-role.dto";
import { UsersService } from "./users.service";
import type { AuthenticatedUser } from "./users.types";

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get()
  @RequirePermissions("users.read")
  list() {
    return this.usersService.list();
  }

  @Post()
  @RequirePermissions("users.manage")
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(":id/role")
  @RequirePermissions("users.manage")
  updateRole(@Param("id") id: string, @Body() dto: UpdateUserRoleDto) {
    return this.usersService.updateRole(id, dto.roleKey);
  }
}
