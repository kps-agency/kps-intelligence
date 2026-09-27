import { OmitType, PartialType } from "@nestjs/swagger";
import { Equals, IsOptional } from "class-validator";
import { CreateContactDto } from "./create-contact.dto";

// `null` efface un champ optionnel (les champs obligatoires — firstName,
// lastName — refusent `null` dans ContactsService.update).
export class UpdateContactDto extends PartialType(
  OmitType(CreateContactDto, ["isPrimary"] as const),
) {
  // Seul `true` est accepté : on change de contact principal en en
  // désignant un autre, on n'en laisse pas un client sans principal.
  @IsOptional()
  @Equals(true, {
    message: "isPrimary ne peut valoir que true (désigner ce contact comme principal).",
  })
  isPrimary?: true;
}
