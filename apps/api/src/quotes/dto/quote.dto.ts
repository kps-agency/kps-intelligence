import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
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
  ValidateNested,
} from "class-validator";
import { QuoteStatus } from "@kps/types";
import { BlankToNull } from "../../common/dto-helpers";
import { PaginationQueryDto } from "../../common/pagination-query.dto";

const notNull = (_: unknown, value: unknown) => value !== null;
const MAX_AMOUNT = 9_999_999.99;

export class CreateQuoteDto {
  @IsUUID("4", { message: "opportunityId doit être un UUID." })
  opportunityId!: string;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @IsNotEmpty({ message: "Le titre ne peut pas être vide." })
  @MaxLength(200)
  title?: string;
}

export class QuoteItemDto {
  @BlankToNull()
  @IsString({ message: "La désignation de chaque ligne est requise." })
  @IsNotEmpty({ message: "La désignation de chaque ligne est requise." })
  @MaxLength(1000)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "La quantité doit être un nombre (2 décimales au plus)." })
  @Min(0.01, { message: "La quantité doit être supérieure à 0." })
  @Max(99_999.99)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Le prix unitaire doit être un montant." })
  @Min(0, { message: "Le prix unitaire ne peut pas être négatif." })
  @Max(MAX_AMOUNT)
  unitPrice!: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "La remise de ligne doit être un pourcentage." })
  @Min(0, { message: "La remise doit être comprise entre 0 et 100 %." })
  @Max(100, { message: "La remise doit être comprise entre 0 et 100 %." })
  discountPercent!: number;
}

// Contenu complet du brouillon : remplace l'en-tête et toutes les lignes.
export class UpdateQuoteDto {
  @BlankToNull()
  @IsString({ message: "Le titre est requis." })
  @IsNotEmpty({ message: "Le titre est requis." })
  @MaxLength(200)
  title!: string;

  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(3000)
  notes!: string | null;

  @Matches(/^[A-Z]{3}$/, { message: "La devise doit être un code à 3 lettres (ex. CHF)." })
  currency!: string;

  @ValidateIf(notNull)
  @IsISO8601({ strict: true }, { message: "La date de validité est invalide." })
  validUntil!: string | null;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "La remise doit être un pourcentage." })
  @Min(0, { message: "La remise doit être comprise entre 0 et 100 %." })
  @Max(100, { message: "La remise doit être comprise entre 0 et 100 %." })
  discountPercent!: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Le taux de TVA doit être un pourcentage." })
  @Min(0, { message: "Le taux de TVA doit être compris entre 0 et 100 %." })
  @Max(100, { message: "Le taux de TVA doit être compris entre 0 et 100 %." })
  taxRate!: number;

  @IsArray()
  @ArrayMaxSize(100, { message: "Un devis ne peut pas dépasser 100 lignes." })
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items!: QuoteItemDto[];
}

export class SendQuoteDto {
  @IsEmail({}, { message: "Adresse email du destinataire invalide." })
  @MaxLength(200)
  to!: string;

  @IsOptional()
  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(2000)
  message?: string | null;
}

export class RejectQuoteDto {
  @IsOptional()
  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}

export class ListQuotesQueryDto extends PaginationQueryDto {
  // Recherche sur la référence et le titre.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(QuoteStatus, { message: "Statut de devis invalide." })
  status?: QuoteStatus;

  @IsOptional()
  @IsUUID("4", { message: "opportunityId doit être un UUID." })
  opportunityId?: string;

  @IsOptional()
  @IsUUID("4", { message: "clientId doit être un UUID." })
  clientId?: string;
}
