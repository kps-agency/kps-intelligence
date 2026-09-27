import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { UserRole } from "@kps/types";

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsIn(Object.values(UserRole))
  roleKey!: UserRole;

  @IsOptional()
  @IsString()
  phone?: string;
}
