import { Transform } from "class-transformer";

// Numéro de téléphone/WhatsApp tolérant : « + » optionnel puis chiffres,
// espaces, points, tirets et parenthèses (ex. +41 79 123 45 67).
export const PHONE_PATTERN = /^\+?[0-9 ().-]{6,25}$/;

// Nettoie une chaîne saisie : espaces retirés aux extrémités, chaîne vide
// convertie en `null`. Évite de stocker des "" et permet à un champ
// obligatoire laissé vide d'échouer à la validation.
export function BlankToNull(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  });
}
