import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { ClientsList } from "./clients-list";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("clients.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <AccessDenied permission="clients.read" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="text-sm text-muted-foreground">
          Entreprises accompagnées par KPS Agency.
        </p>
      </div>
      <ClientsList canManage={result.user.permissions.includes("clients.manage")} />
    </div>
  );
}
