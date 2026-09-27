"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kps/ui";
import { useRouter } from "next/navigation";
import { useSignOut } from "@/lib/use-sign-out";

// Écran plein page pour les états où le shell ne peut pas s'afficher
// (pas de profil, API injoignable) : explique le problème et propose de
// réessayer ou de se déconnecter, plutôt qu'une page blanche.
export function FullPageMessage({
  title,
  description,
  canRetry,
}: {
  title: string;
  description: string;
  canRetry?: boolean;
}) {
  const router = useRouter();
  const signOut = useSignOut();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md" role="alert">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {canRetry && (
            <Button onClick={() => router.refresh()}>Réessayer</Button>
          )}
          <Button variant="outline" onClick={() => void signOut()}>
            Se déconnecter
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
