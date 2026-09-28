import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { BlankToNull } from "../../common/dto-helpers";

export class WebsiteSubmissionContactDto {
  @BlankToNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @BlankToNull()
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(200)
  company?: string | null;
}

// Réponse structurée du formulaire (type de projet, budget...), en
// libellés lisibles : elle est ajoutée au message analysé par Claude et
// affichée telle quelle dans la demande.
export class WebsiteSubmissionFieldDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label!: string;

  @IsString()
  @MaxLength(5000)
  value!: string;
}

// Contrat du webhook des sites (voir docs/API.md) : indépendant de tout
// site, chaque site y convertit ses propres formulaires.
export class WebsiteSubmissionDto {
  // Identifiant de la soumission côté site (clé d'idempotence).
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,100}$/, { message: "externalId invalide." })
  externalId!: string;

  // Formulaire d'origine sur le site ("quote", "linkedin-redesign"...).
  @IsString()
  @Matches(/^[a-z0-9-]{1,50}$/, { message: "formType invalide." })
  formType!: string;

  @ValidateNested()
  @Type(() => WebsiteSubmissionContactDto)
  contact!: WebsiteSubmissionContactDto;

  @BlankToNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  subject!: string;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(10000)
  message?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => WebsiteSubmissionFieldDto)
  fields?: WebsiteSubmissionFieldDto[];

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(10)
  locale?: string | null;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string | null;

  @IsOptional()
  @IsISO8601()
  submittedAt?: string;
}
