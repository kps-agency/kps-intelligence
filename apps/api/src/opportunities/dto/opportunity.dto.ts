import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { OpportunityStatus } from "@kps/types";
import { BlankToNull } from "../../common/dto-helpers";
import { PaginationQueryDto } from "../../common/pagination-query.dto";

const MAX_VALUE = 9_999_999_999.99;
const notNull = (_: unknown, value: unknown) => value !== null;

export class CreateOpportunityDto {
  // Création depuis une demande : titre, client, service et responsable
  // sont repris de la demande.
  @IsOptional()
  @IsUUID("4", { message: "requestId doit être un UUID." })
  requestId?: string;

  @ValidateIf((dto: CreateOpportunityDto) => !dto.requestId)
  @BlankToNull()
  @IsString({ message: "Le titre est requis." })
  @IsNotEmpty({ message: "Le titre est requis." })
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsUUID("4", { message: "clientId doit être un UUID." })
  clientId?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsUUID("4", { message: "serviceId doit être un UUID." })
  serviceId?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "La valeur estimée doit être un montant." })
  @Min(0, { message: "La valeur estimée ne peut pas être négative." })
  @Max(MAX_VALUE)
  estimatedValue?: number | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^[A-Z]{3}$/, { message: "La devise doit être un code à 3 lettres (ex. CHF)." })
  currency?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsUUID("4", { message: "ownerUserId doit être un UUID." })
  ownerUserId?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsISO8601({ strict: true }, { message: "La date de clôture prévue est invalide." })
  expectedCloseDate?: string | null;
}

export class UpdateOpportunityDto {
  @IsOptional()
  @BlankToNull()
  @IsString({ message: "Le titre ne peut pas être vide." })
  @IsNotEmpty({ message: "Le titre ne peut pas être vide." })
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsUUID("4", { message: "clientId doit être un UUID." })
  clientId?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsUUID("4", { message: "serviceId doit être un UUID." })
  serviceId?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "La valeur estimée doit être un montant." })
  @Min(0, { message: "La valeur estimée ne peut pas être négative." })
  @Max(MAX_VALUE)
  estimatedValue?: number | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^[A-Z]{3}$/, { message: "La devise doit être un code à 3 lettres (ex. CHF)." })
  currency?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsInt({ message: "La probabilité doit être un entier entre 0 et 100." })
  @Min(0, { message: "La probabilité doit être un entier entre 0 et 100." })
  @Max(100, { message: "La probabilité doit être un entier entre 0 et 100." })
  probability?: number | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsUUID("4", { message: "ownerUserId doit être un UUID." })
  ownerUserId?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsISO8601({ strict: true }, { message: "La date de clôture prévue est invalide." })
  expectedCloseDate?: string | null;
}

export class ChangeOpportunityStageDto {
  @IsEnum(OpportunityStatus, { message: "Étape invalide." })
  status!: OpportunityStatus;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(1000)
  lostReason?: string | null;
}

export class ListOpportunitiesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OpportunityStatus, { message: "Étape invalide." })
  status?: OpportunityStatus;

  @IsOptional()
  @IsUUID("4", { message: "ownerUserId doit être un UUID." })
  ownerUserId?: string;

  @IsOptional()
  @IsUUID("4", { message: "clientId doit être un UUID." })
  clientId?: string;

  @IsOptional()
  @IsUUID("4", { message: "requestId doit être un UUID." })
  requestId?: string;
}

export class OpportunityBoardQueryDto {
  @IsOptional()
  @IsUUID("4", { message: "ownerUserId doit être un UUID." })
  ownerUserId?: string;

  // Recherche sur le titre, le client, le contact et la référence de la demande.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
