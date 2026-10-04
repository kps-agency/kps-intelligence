import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { CompanySettingsCard } from "./company-settings-card";
import { UsersAdmin } from "./users-admin";

export const metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const result = await getCurrentUser();
  // Le layout n'affiche cette page que pour un utilisateur valide ; ce
  // garde sert uniquement au typage (layout et page se rendent en parallèle).
  if (result.status !== "ok") return null;

  const { permissions } = result.user;
  const canReadUsers = permissions.includes("users.read");
  const canReadCompany = permissions.includes("quotes.read");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
        <p className="text-sm text-muted-foreground">
          Administration de la plateforme.
        </p>
      </div>

      {canReadCompany && <CompanySettingsCard canManage={permissions.includes("settings.manage")} />}
      {canReadUsers && <UsersAdmin />}
      {!canReadCompany && !canReadUsers && <AccessDenied permission="users.read" />}
    </div>
  );
}
