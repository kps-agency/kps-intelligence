import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { BlankToNull, PHONE_PATTERN } from "../../common/dto-helpers";

const PHONE_MESSAGE = "Numéro de téléphone invalide.";

export class CreateContactDto {
  @BlankToNull()
  @IsString({ message: "Le prénom est requis." })
  @IsNotEmpty({ message: "Le prénom est requis." })
  @MaxLength(100)
  firstName!: string;

  @BlankToNull()
  @IsString({ message: "Le nom est requis." })
  @IsNotEmpty({ message: "Le nom est requis." })
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @BlankToNull()
  @IsEmail({}, { message: "Adresse email invalide." })
  @MaxLength(200)
  email?: string | null;

  @IsOptional()
  @BlankToNull()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone?: string | null;

  @IsOptional()
  @BlankToNull()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  whatsapp?: string | null;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(100)
  position?: string | null;

  // Le premier contact d'un client est principal quoi qu'il arrive.
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
