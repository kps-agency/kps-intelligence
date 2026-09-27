import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ClientStatus } from "@kps/types";
import { PaginationQueryDto } from "../../common/pagination-query.dto";

export class ListClientsQueryDto extends PaginationQueryDto {
  // Recherche sur le nom de société, l'email et la ville.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(ClientStatus, { message: "Statut client invalide." })
  status?: ClientStatus;
}
