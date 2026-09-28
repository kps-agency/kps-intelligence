import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { AvailabilityStatus } from "@kps/types";

export class UpdateTeamProfileDto {
  // Codes ISO 639-1 (fr, en, wo...).
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(/^[a-z]{2}$/, { each: true, message: "Chaque langue doit être un code ISO à 2 lettres." })
  languages!: string[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  country!: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timezone!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  expertise!: string | null;
}

export class TeamSkillDto {
  @IsUUID("4")
  skillId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  proficiencyLevel!: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  @Max(60)
  yearsExperience!: number | null;
}

export class UpdateTeamSkillsDto {
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => TeamSkillDto)
  skills!: TeamSkillDto[];
}

export class UpdateAvailabilityDto {
  @IsEnum(AvailabilityStatus, { message: "Statut de disponibilité invalide." })
  status!: AvailabilityStatus;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(80)
  capacityHoursPerWeek!: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  availableFrom!: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  notes!: string | null;
}

export class CreateSkillDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  category!: string | null;
}
