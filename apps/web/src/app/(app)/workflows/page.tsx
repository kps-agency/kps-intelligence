import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { WorkflowsList } from "./workflows-list";

export const metadata = { title: "Workflows" };

export default async function WorkflowsPage() {
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("workflows.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
        <AccessDenied permission="workflows.read" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
        <p className="text-sm text-muted-foreground">
          Les automatismes de la plateforme : quand un événement arrive, si des conditions sont
          remplies, alors des actions s&apos;exécutent.
        </p>
      </div>
      <WorkflowsList />
    </div>
  );
}
