import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { BlankToNull } from "../../common/dto-helpers";

// Slug minuscule, chiffres et tirets — utilisé tel quel dans des URLs
// plus tard (ex. lien de qualification public en Phase 10).
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class CreateFormDto {
  @BlankToNull()
  @IsString({ message: "Le nom est requis." })
  @IsNotEmpty({ message: "Le nom est requis." })
  @MaxLength(200)
  name!: string;

  @BlankToNull()
  @IsString({ message: "Le slug est requis." })
  @IsNotEmpty({ message: "Le slug est requis." })
  @MaxLength(200)
  @Matches(SLUG_PATTERN, {
    message: "Le slug ne peut contenir que des minuscules, chiffres et tirets.",
  })
  slug!: string;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID("4", { message: "serviceId doit être un UUID." })
  serviceId?: string;
}
