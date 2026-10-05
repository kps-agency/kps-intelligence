import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { MissionsList } from "./missions-list";

export const metadata = { title: "Missions" };

export default async function MissionsPage() {
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("missions.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Missions</h1>
        <AccessDenied permission="missions.read" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Missions</h1>
        <p className="text-sm text-muted-foreground">
          Une opportunité gagnée crée sa mission automatiquement, avec l&apos;équipe affectée à la demande.
        </p>
      </div>
      <MissionsList canManage={result.user.permissions.includes("missions.manage")} />
    </div>
  );
}
