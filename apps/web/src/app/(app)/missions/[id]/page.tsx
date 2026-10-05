import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { MissionDetail } from "./mission-detail";

export const metadata = { title: "Mission" };

export default async function MissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("missions.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Mission</h1>
        <AccessDenied permission="missions.read" />
      </div>
    );
  }

  return <MissionDetail missionId={id} canManage={result.user.permissions.includes("missions.manage")} />;
}
