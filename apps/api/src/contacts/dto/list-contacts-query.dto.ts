import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination-query.dto";

export class ListContactsQueryDto extends PaginationQueryDto {
  // Recherche sur le prénom, le nom et l'email.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsUUID("4", { message: "clientId doit être un UUID." })
  clientId?: string;
}
