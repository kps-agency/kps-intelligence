import { PartialType } from "@nestjs/swagger";
import { CreateClientDto } from "./create-client.dto";

// Tous les champs deviennent optionnels ; `null` efface un champ optionnel
// (les champs obligatoires — companyName, status — refusent `null` dans
// ClientsService.update).
export class UpdateClientDto extends PartialType(CreateClientDto) {}
