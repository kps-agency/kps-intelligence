// Remplace les variables {{nom}} d'un template. Une variable inconnue est
// une erreur de configuration : on échoue plutôt que d'envoyer un texte
// avec un trou ou un "{{...}}" visible par le destinataire.
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => {
    const value = variables[name];
    if (value === undefined) {
      throw new Error(`Variable de template inconnue : ${name}`);
    }
    return value;
  });
}
