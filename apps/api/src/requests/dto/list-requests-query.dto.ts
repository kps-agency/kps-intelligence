import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { RequestSource, RequestStatus } from "@kps/types";
import { PaginationQueryDto } from "../../common/pagination-query.dto";

export class ListRequestsQueryDto extends PaginationQueryDto {
  // Recherche sur la référence, le sujet et le message d'origine.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(RequestStatus, { message: "Statut de demande invalide." })
  status?: RequestStatus;

  @IsOptional()
  @IsEnum(RequestSource, { message: "Source invalide." })
  source?: RequestSource;

  @IsOptional()
  @IsUUID("4", { message: "clientId doit être un UUID." })
  clientId?: string;
}
