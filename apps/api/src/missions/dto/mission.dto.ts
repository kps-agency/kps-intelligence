import {
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
} from "class-validator";
import { MissionStatus, PriorityLevel, TaskStatus } from "@kps/types";
import { BlankToNull } from "../../common/dto-helpers";
import { PaginationQueryDto } from "../../common/pagination-query.dto";

const notNull = (_: unknown, value: unknown) => value !== null;

export class CreateMissionDto {
  // Création depuis une opportunité : titre, client, service, budget et
  // équipe sont repris de l'opportunité et de sa demande.
  @IsOptional()
  @IsUUID("4", { message: "opportunityId doit être un UUID." })
  opportunityId?: string;

  @ValidateIf((dto: CreateMissionDto) => !dto.opportunityId)
  @BlankToNull()
  @IsString({ message: "Le titre est requis." })
  @IsNotEmpty({ message: "Le titre est requis." })
  @MaxLength(200)
  title?: string;

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
  @IsUUID("4", { message: "projectManagerId doit être un UUID." })
  projectManagerId?: string | null;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(5000)
  description?: string | null;
}

export class UpdateMissionDto {
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
  @IsUUID("4", { message: "projectManagerId doit être un UUID." })
  projectManagerId?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsISO8601({ strict: true }, { message: "La date de début est invalide." })
  startDate?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsISO8601({ strict: true }, { message: "La date de fin est invalide." })
  endDate?: string | null;

  @IsOptional()
  @IsEnum(PriorityLevel, { message: "Priorité invalide." })
  priority?: PriorityLevel;

  @IsOptional()
  @ValidateIf(notNull)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Le budget doit être un montant." })
  @Min(0, { message: "Le budget ne peut pas être négatif." })
  @Max(9_999_999_999.99)
  budget?: number | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^[A-Z]{3}$/, { message: "La devise doit être un code à 3 lettres (ex. CHF)." })
  currency?: string | null;
}

export class ChangeMissionStatusDto {
  @IsEnum(MissionStatus, { message: "Statut de mission invalide." })
  status!: MissionStatus;

  @IsOptional()
  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}

export class AddMissionMemberDto {
  @IsUUID("4", { message: "userId doit être un UUID." })
  userId!: string;

  @IsOptional()
  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(100)
  roleOnMission?: string | null;
}

export class ListMissionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(MissionStatus, { message: "Statut de mission invalide." })
  status?: MissionStatus;

  @IsOptional()
  @IsUUID("4", { message: "clientId doit être un UUID." })
  clientId?: string;

  @IsOptional()
  @IsUUID("4", { message: "opportunityId doit être un UUID." })
  opportunityId?: string;

  // Missions dont cet utilisateur est membre ou chef de projet.
  @IsOptional()
  @IsUUID("4", { message: "memberId doit être un UUID." })
  memberId?: string;
}

export class CreateTaskDto {
  @BlankToNull()
  @IsString({ message: "Le titre de la tâche est requis." })
  @IsNotEmpty({ message: "Le titre de la tâche est requis." })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsUUID("4", { message: "assigneeId doit être un UUID." })
  assigneeId?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsISO8601({ strict: true }, { message: "L'échéance est invalide." })
  dueDate?: string | null;

  @IsOptional()
  @IsEnum(PriorityLevel, { message: "Priorité invalide." })
  priority?: PriorityLevel;
}

export class UpdateTaskDto {
  @IsOptional()
  @BlankToNull()
  @IsString({ message: "Le titre ne peut pas être vide." })
  @IsNotEmpty({ message: "Le titre ne peut pas être vide." })
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @BlankToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsUUID("4", { message: "assigneeId doit être un UUID." })
  assigneeId?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsISO8601({ strict: true }, { message: "L'échéance est invalide." })
  dueDate?: string | null;

  @IsOptional()
  @IsEnum(PriorityLevel, { message: "Priorité invalide." })
  priority?: PriorityLevel;

  @IsOptional()
  @IsEnum(TaskStatus, { message: "Statut de tâche invalide." })
  status?: TaskStatus;
}

export class CreateTaskCommentDto {
  @BlankToNull()
  @IsString({ message: "Le commentaire est vide." })
  @IsNotEmpty({ message: "Le commentaire est vide." })
  @MaxLength(3000)
  body!: string;
}
