import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { FormStatus } from "@kps/types";
import { BlankToNull } from "../../common/dto-helpers";

// Le slug est immuable après création (référencé tel quel une fois un
// formulaire publié) : seuls name/description/status/serviceId changent.
export class UpdateFormDto {
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
  @IsEnum(FormStatus, { message: "Statut de formulaire invalide." })
  status?: FormStatus;

  @IsOptional()
  @BlankToNull()
  @IsUUID("4", { message: "serviceId doit être un UUID." })
  serviceId?: string | null;
}
