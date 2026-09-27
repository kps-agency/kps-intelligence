import { IsOptional } from "class-validator";

// La forme de `value` dépend du type du champ ciblé (texte, nombre,
// tableau de valeurs...) — validée/coercée dans QualificationSessionsService
// contre la définition réelle du champ, pas ici. `@IsOptional()` (plutôt
// que @IsDefined()) est nécessaire pour laisser passer `null` : dans
// class-validator, IsDefined traite `null` comme "non défini" et le
// rejetterait, alors que `null` est justement notre façon d'effacer une
// réponse déjà enregistrée. Une valeur manquante ou invalide est de toute
// façon rejetée ensuite par la coercion par type du champ.
export class SaveFormResponseDto {
  @IsOptional()
  value?: unknown;
}
