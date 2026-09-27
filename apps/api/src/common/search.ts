// Le terme de recherche saisi par l'utilisateur est inséré dans un filtre
// PostgREST (`.or("col.ilike.<motif>,...")`). Dans cette syntaxe, `,` sépare
// les conditions, `()` les groupent et `"` `\` servent à l'échappement :
// laisser passer ces caractères permettrait à l'utilisateur d'injecter
// d'autres conditions (ex. `x,status.eq.CHURNED`). On les retire, ainsi que
// les jokers `*` `%`, puis on entoure du joker `*` (« contient »).
const FILTER_SYNTAX_CHARS = /[,()"\\*%]/g;

export function toContainsPattern(term: string): string | null {
  const cleaned = term.replace(FILTER_SYNTAX_CHARS, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? `*${cleaned}*` : null;
}

// Découpe un terme de recherche en mots individuels, chacun prêt pour
// `.ilike`. Utile quand le terme peut porter sur plusieurs colonnes
// distinctes (ex. prénom + nom) : un utilisateur qui tape "Bob Durand" ne
// doit pas être bloqué parce qu'aucune colonne, prise seule, ne contient
// la chaîne entière — chaque mot doit matcher au moins un champ.
export function toWordPatterns(term: string): string[] {
  return term
    .split(/\s+/)
    .map(toContainsPattern)
    .filter((pattern): pattern is string => pattern !== null);
}
