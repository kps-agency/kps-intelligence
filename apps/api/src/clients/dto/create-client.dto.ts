import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from "class-validator";
import { ClientStatus, RequestSource } from "@kps/types";
import { BlankToNull, PHONE_PATTERN } from "../../common/dto-helpers";

const PHONE_MESSAGE = "Numéro de téléphone invalide.";

export class CreateClientDto {
  @BlankToNull()
  @IsString({ message: "Le nom de la société est requis." })
  @IsNotEmpty({ message: "Le nom de la société est requis." })
  @MaxLength(200, { message: "Le nom de la société est trop long (200 max)." })
  companyName!: string;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(100)
  country?: string | null;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(100)
  industry?: string | null;

  @IsOptional()
  @BlankToNull()
  @IsUrl({ require_protocol: false }, { message: "Adresse de site web invalide." })
  @MaxLength(300)
  website?: string | null;

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
  @IsEnum(ClientStatus, { message: "Statut client invalide." })
  status?: ClientStatus;

  @IsOptional()
  @IsEnum(RequestSource, { message: "Source invalide." })
  source?: RequestSource | null;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}
