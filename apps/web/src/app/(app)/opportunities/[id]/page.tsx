import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { OpportunityDetail } from "./opportunity-detail";

export const metadata = { title: "Opportunité" };

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("opportunities.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Opportunité</h1>
        <AccessDenied permission="opportunities.read" />
      </div>
    );
  }

  return (
    <OpportunityDetail
      opportunityId={id}
      canManage={result.user.permissions.includes("opportunities.manage")}
    />
  );
}
