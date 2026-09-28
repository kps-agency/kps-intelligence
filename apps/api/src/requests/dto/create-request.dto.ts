import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { PriorityLevel } from "@kps/types";
import { BlankToNull } from "../../common/dto-helpers";

// Création manuelle (source MANUAL — inbox interne, avant branchement
// email/WhatsApp en Phases 11-12). `source` n'est pas un champ du DTO :
// le service le fixe à MANUAL.
export class CreateRequestDto {
  @BlankToNull()
  @IsString({ message: "Le sujet est requis." })
  @IsNotEmpty({ message: "Le sujet est requis." })
  @MaxLength(300)
  subject!: string;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(10000)
  originalMessage?: string | null;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(10)
  language?: string | null;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(100)
  country?: string | null;

  @IsOptional()
  @IsEnum(PriorityLevel, { message: "Priorité invalide." })
  priority?: PriorityLevel;

  @IsOptional()
  @IsEnum(PriorityLevel, { message: "Urgence invalide." })
  urgency?: PriorityLevel;

  @IsOptional()
  @IsUUID("4", { message: "clientId doit être un UUID." })
  clientId?: string;

  // Doit appartenir au client désigné par clientId — vérifié par le
  // service, pas exprimable par un décorateur de validation isolé.
  @IsOptional()
  @IsUUID("4", { message: "contactId doit être un UUID." })
  contactId?: string;

  @IsOptional()
  @IsUUID("4", { message: "assignedUserId doit être un UUID." })
  assignedUserId?: string;
}
