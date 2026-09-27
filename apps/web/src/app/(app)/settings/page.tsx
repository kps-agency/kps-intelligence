import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { UsersAdmin } from "./users-admin";

export const metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const result = await getCurrentUser();
  // Le layout n'affiche cette page que pour un utilisateur valide ; ce
  // garde sert uniquement au typage (layout et page se rendent en parallèle).
  if (result.status !== "ok") return null;

  const canReadUsers = result.user.permissions.includes("users.read");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
        <p className="text-sm text-muted-foreground">
          Administration de la plateforme.
        </p>
      </div>

      {canReadUsers ? (
        <UsersAdmin />
      ) : (
        <AccessDenied permission="users.read" />
      )}
    </div>
  );
}
