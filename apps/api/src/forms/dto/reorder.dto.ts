import { ArrayMinSize, ArrayUnique, IsUUID } from "class-validator";

export class ReorderDto {
  @ArrayMinSize(1, { message: "La liste ne peut pas être vide." })
  @ArrayUnique({ message: "Chaque identifiant ne peut apparaître qu'une fois." })
  @IsUUID("4", { each: true, message: "Chaque identifiant doit être un UUID." })
  orderedIds!: string[];
}
