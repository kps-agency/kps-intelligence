import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { ReportsView } from "./reports-view";

export const metadata = { title: "Rapports" };

export default async function ReportsPage() {
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("reports.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Rapports</h1>
        <AccessDenied permission="reports.read" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rapports</h1>
        <p className="text-sm text-muted-foreground">
          Volume, conversion et délais des demandes ; état du pipeline et des missions.
        </p>
      </div>
      <ReportsView />
    </div>
  );
}
