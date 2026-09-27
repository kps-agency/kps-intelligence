import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kps/ui";
import { ShieldAlert } from "lucide-react";

// Affiché quand un utilisateur ouvre directement une URL dont il n'a pas
// la permission. L'API refuse de toute façon les données (403) : ceci
// n'est que l'explication côté interface.
export function AccessDenied({ permission }: { permission: string }) {
  return (
    <Card role="alert">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-warning" aria-hidden="true" />
          Accès refusé
        </CardTitle>
        <CardDescription>
          Votre rôle ne vous donne pas accès à cette page.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Permission requise : <code className="rounded bg-secondary px-1.5 py-0.5 text-foreground">{permission}</code>.
        Contactez un administrateur si vous pensez que c&apos;est une erreur.
      </CardContent>
    </Card>
  );
}
