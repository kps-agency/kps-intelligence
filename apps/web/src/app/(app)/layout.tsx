import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { FullPageMessage } from "@/components/full-page-message";
import { Providers } from "@/components/providers";
import { getCurrentUser } from "@/lib/session";

// Layout de toutes les pages authentifiées : résout l'utilisateur côté
// serveur et n'affiche le shell (sidebar/topbar) que si le profil est
// valide. Chaque état d'échec a un écran explicite, jamais une page vide.
export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const result = await getCurrentUser();

  if (result.status === "unauthenticated") {
    redirect("/login");
  }

  if (result.status === "session-rejected") {
    return (
      <FullPageMessage
        title="Session refusée"
        description="Le serveur a refusé votre session. Déconnectez-vous puis reconnectez-vous."
      />
    );
  }

  if (result.status === "no-profile") {
    return (
      <FullPageMessage
        title="Compte non activé"
        description="Votre connexion est valide mais aucun profil actif n'y est associé. Contactez un administrateur."
      />
    );
  }

  if (result.status === "api-unavailable") {
    return (
      <FullPageMessage
        title="Service indisponible"
        description="Le serveur ne répond pas pour le moment. Réessayez dans quelques instants."
        canRetry
      />
    );
  }

  return (
    <Providers>
      <AppShell user={result.user}>{children}</AppShell>
    </Providers>
  );
}
