import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { ServiceStatus } from "@kps/types";
import { BlankToNull } from "../../common/dto-helpers";

// Le catalogue de services est un ensemble fixe (ServiceSlug), pré-seedé
// en base — pas de création/suppression depuis l'API, seulement
// configuration des champs métier.
export class UpdateServiceDto {
  @IsOptional()
  @BlankToNull()
  @IsString({ message: "Le nom est requis." })
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsEnum(ServiceStatus, { message: "Statut de service invalide." })
  status?: ServiceStatus;

  // `null` délie le formulaire de qualification du service.
  @IsOptional()
  @BlankToNull()
  @IsUUID("4", { message: "qualificationFormId doit être un UUID." })
  qualificationFormId?: string | null;
}
