import { IsUUID } from "class-validator";

export class CreateQualificationSessionDto {
  @IsUUID("4", { message: "formId doit être un UUID." })
  formId!: string;
}
