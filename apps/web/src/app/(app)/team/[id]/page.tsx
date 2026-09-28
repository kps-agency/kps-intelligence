import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { TeamMemberDetail } from "./team-member-detail";

export const metadata = { title: "Collaborateur" };

export default async function TeamMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("team.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Collaborateur</h1>
        <AccessDenied permission="team.read" />
      </div>
    );
  }
  return <TeamMemberDetail memberId={id} />;
}
