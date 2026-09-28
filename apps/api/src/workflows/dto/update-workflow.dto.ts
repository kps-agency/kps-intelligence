import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import type { WorkflowCondition, WorkflowStep } from "@kps/types";

// Forme générale seulement : le contenu des conditions et des étapes est
// validé contre le vocabulaire autorisé par validateWorkflowDefinition.
export class UpdateWorkflowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  description!: string | null;

  @IsBoolean()
  isActive!: boolean;

  @IsArray()
  @ArrayMaxSize(20)
  @IsObject({ each: true })
  conditions!: WorkflowCondition[];

  @IsArray()
  @IsObject({ each: true })
  steps!: WorkflowStep[];

  @IsArray()
  @IsString({ each: true })
  cancelOn!: string[];
}
