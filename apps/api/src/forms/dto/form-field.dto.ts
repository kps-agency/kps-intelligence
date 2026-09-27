import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { FormFieldType } from "@kps/types";
import { BlankToNull } from "../../common/dto-helpers";

// Identifiant utilisé comme clé de réponse (form_responses) et référencé
// par les conditions d'affichage d'autres champs — camelCase strict,
// aucun espace ni caractère spécial.
const FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
const KEY_MESSAGE =
  "La clé doit commencer par une minuscule et ne contenir que des lettres/chiffres (camelCase).";

export class FormFieldOptionDto {
  @IsString()
  @IsNotEmpty({ message: "La valeur de l'option est requise." })
  @MaxLength(200)
  value!: string;

  @IsString()
  @IsNotEmpty({ message: "Le libellé de l'option est requis." })
  @MaxLength(200)
  label!: string;
}

export class FormFieldValidationDto {
  @IsOptional()
  @IsNumber()
  min?: number;

  @IsOptional()
  @IsNumber()
  max?: number;

  @IsOptional()
  @IsNumber()
  minLength?: number;

  @IsOptional()
  @IsNumber()
  maxLength?: number;
}

export class FormFieldConditionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(FIELD_KEY_PATTERN, { message: KEY_MESSAGE })
  field!: string;

  @IsString()
  @IsNotEmpty({ message: "La valeur de la condition est requise." })
  @MaxLength(200)
  equals!: string;
}

export class CreateFormFieldDto {
  @BlankToNull()
  @IsString()
  @IsNotEmpty({ message: "La clé du champ est requise." })
  @MaxLength(100)
  @Matches(FIELD_KEY_PATTERN, { message: KEY_MESSAGE })
  key!: string;

  @BlankToNull()
  @IsString({ message: "Le libellé est requis." })
  @IsNotEmpty({ message: "Le libellé est requis." })
  @MaxLength(500)
  label!: string;

  @IsEnum(FormFieldType, { message: "Type de champ invalide." })
  type!: FormFieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: "Au moins une option est requise." })
  @ValidateNested({ each: true })
  @Type(() => FormFieldOptionDto)
  options?: FormFieldOptionDto[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FormFieldValidationDto)
  validation?: FormFieldValidationDto;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsObject()
  @ValidateNested()
  @Type(() => FormFieldConditionDto)
  conditionalLogic?: FormFieldConditionDto | null;
}

export class UpdateFormFieldDto {
  @IsOptional()
  @BlankToNull()
  @IsString()
  @IsNotEmpty({ message: "La clé du champ est requise." })
  @MaxLength(100)
  @Matches(FIELD_KEY_PATTERN, { message: KEY_MESSAGE })
  key?: string;

  @IsOptional()
  @BlankToNull()
  @IsString({ message: "Le libellé est requis." })
  @IsNotEmpty({ message: "Le libellé est requis." })
  @MaxLength(500)
  label?: string;

  @IsOptional()
  @IsEnum(FormFieldType, { message: "Type de champ invalide." })
  type?: FormFieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsArray()
  @ArrayMinSize(1, { message: "Au moins une option est requise." })
  @ValidateNested({ each: true })
  @Type(() => FormFieldOptionDto)
  options?: FormFieldOptionDto[] | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsObject()
  @ValidateNested()
  @Type(() => FormFieldValidationDto)
  validation?: FormFieldValidationDto | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsObject()
  @ValidateNested()
  @Type(() => FormFieldConditionDto)
  conditionalLogic?: FormFieldConditionDto | null;
}
