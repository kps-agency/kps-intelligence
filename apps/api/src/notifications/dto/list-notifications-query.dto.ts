import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { PriorityLevel } from "@kps/types";
import { PaginationQueryDto } from "../../common/pagination-query.dto";

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(["all", "unread", "read"], { message: "status doit valoir all, unread ou read." })
  status: "all" | "unread" | "read" = "all";

  @IsOptional()
  @IsEnum(PriorityLevel, { message: "Priorité invalide." })
  priority?: PriorityLevel;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
