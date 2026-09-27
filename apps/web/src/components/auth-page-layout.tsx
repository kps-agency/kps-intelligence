import { APP_NAME } from "@kps/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@kps/ui";
import type { ReactNode } from "react";

// Mise en page commune des pages publiques d'authentification (login,
// mot de passe oublié, réinitialisation).
export function AuthPageLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <p className="text-xl font-bold tracking-tight">{APP_NAME}</p>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle as="h1">{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
