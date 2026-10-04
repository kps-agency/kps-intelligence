import {
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { BlankToNull } from "../common/dto-helpers";

const notNull = (_: unknown, value: unknown) => value !== null;

// Définition complète : un champ laissé vide est effacé (`null`).
export class UpdateCompanySettingsDto {
  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(200)
  legalName!: string | null;

  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(300)
  address!: string | null;

  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(20)
  postalCode!: string | null;

  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(100)
  city!: string | null;

  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(100)
  country!: string | null;

  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(50)
  vatNumber!: string | null;

  @BlankToNull()
  @ValidateIf(notNull)
  @IsEmail({}, { message: "Adresse email invalide." })
  @MaxLength(200)
  email!: string | null;

  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(50)
  phone!: string | null;

  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(200)
  website!: string | null;

  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(50)
  iban!: string | null;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Le taux de TVA doit être un nombre." })
  @Min(0, { message: "Le taux de TVA doit être compris entre 0 et 100." })
  @Max(100, { message: "Le taux de TVA doit être compris entre 0 et 100." })
  defaultTaxRate!: number;

  @IsInt({ message: "La durée de validité doit être un nombre de jours entier." })
  @Min(1, { message: "La durée de validité doit être comprise entre 1 et 365 jours." })
  @Max(365, { message: "La durée de validité doit être comprise entre 1 et 365 jours." })
  quoteValidityDays!: number;

  @IsOptional()
  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(3000)
  quoteTerms!: string | null;
}
