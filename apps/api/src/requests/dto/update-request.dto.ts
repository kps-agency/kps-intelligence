import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from "class-validator";
import { PriorityLevel, RequestStatus } from "@kps/types";
import { BlankToNull } from "../../common/dto-helpers";

export class UpdateRequestDto {
  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(300)
  subject?: string;

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
  @IsEnum(RequestStatus, { message: "Statut de demande invalide." })
  status?: RequestStatus;

  @IsOptional()
  @IsEnum(PriorityLevel, { message: "Priorité invalide." })
  priority?: PriorityLevel;

  @IsOptional()
  @IsEnum(PriorityLevel, { message: "Urgence invalide." })
  urgency?: PriorityLevel;

  // `null` délie le client (et donc implicitement le contact).
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID("4", { message: "clientId doit être un UUID." })
  clientId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID("4", { message: "contactId doit être un UUID." })
  contactId?: string | null;
}
