import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { OpportunityBoard } from "./opportunity-board";

export const metadata = { title: "Opportunités" };

export default async function OpportunitiesPage() {
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("opportunities.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Opportunités</h1>
        <AccessDenied permission="opportunities.read" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Opportunités</h1>
        <p className="text-sm text-muted-foreground">
          Pipeline commercial — une demande qualifiée y entre automatiquement après le matching.
        </p>
      </div>
      <OpportunityBoard canManage={result.user.permissions.includes("opportunities.manage")} />
    </div>
  );
}
