import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { RequestsList } from "./requests-list";

export const metadata = { title: "Demandes" };

export default async function RequestsPage() {
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("requests.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Demandes</h1>
        <AccessDenied permission="requests.read" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Demandes</h1>
        <p className="text-sm text-muted-foreground">
          Toutes les demandes reçues par KPS Agency.
        </p>
      </div>
      <RequestsList canManage={result.user.permissions.includes("requests.manage")} />
    </div>
  );
}
