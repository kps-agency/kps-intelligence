import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { BlankToNull } from "../../common/dto-helpers";

export class CreateFormStepDto {
  @BlankToNull()
  @IsString({ message: "Le titre est requis." })
  @IsNotEmpty({ message: "Le titre est requis." })
  @MaxLength(200)
  title!: string;
}

export class UpdateFormStepDto {
  @IsOptional()
  @BlankToNull()
  @IsString({ message: "Le titre est requis." })
  @IsNotEmpty({ message: "Le titre est requis." })
  @MaxLength(200)
  title?: string;
}
