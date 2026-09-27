import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

// Paramètres de pagination communs à toutes les listes (voir API.md).
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "page doit être un entier." })
  @Min(1, { message: "page doit être supérieur ou égal à 1." })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "limit doit être un entier." })
  @Min(1, { message: "limit doit être supérieur ou égal à 1." })
  @Max(100, { message: "limit ne peut pas dépasser 100." })
  limit: number = 20;
}

// Bornes (incluses) de `.range()` pour la page demandée.
export function toRange(page: number, limit: number): [number, number] {
  const from = (page - 1) * limit;
  return [from, from + limit - 1];
}
