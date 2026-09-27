import { IsIn } from "class-validator";
import { UserRole } from "@kps/types";

export class UpdateUserRoleDto {
  @IsIn(Object.values(UserRole))
  roleKey!: UserRole;
}
