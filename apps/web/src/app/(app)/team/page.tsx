import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { TeamList } from "./team-list";

export const metadata = { title: "Équipe" };

export default async function TeamPage() {
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("team.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Équipe</h1>
        <AccessDenied permission="team.read" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Équipe</h1>
        <p className="text-sm text-muted-foreground">
          Compétences et disponibilités des collaborateurs — la base du matching des demandes.
        </p>
      </div>
      <TeamList />
    </div>
  );
}
