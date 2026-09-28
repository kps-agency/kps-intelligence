import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { WorkflowDetail } from "./workflow-detail";

export const metadata = { title: "Workflow" };

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("workflows.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Workflow</h1>
        <AccessDenied permission="workflows.read" />
      </div>
    );
  }

  return (
    <WorkflowDetail
      workflowId={id}
      canManage={result.user.permissions.includes("workflows.manage")}
    />
  );
}
