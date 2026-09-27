import type { CurrentUserResponse } from "@kps/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

async function fetchCurrentUser(
  accessToken: string,
): Promise<CurrentUserResponse | null> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  return (await response.json()) as CurrentUserResponse;
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  const currentUser = session
    ? await fetchCurrentUser(session.access_token)
    : null;

  return (
    <main className="flex min-h-screen flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <LogoutButton />
      </header>

      {currentUser ? (
        <section className="rounded-lg border border-border p-6">
          <p>
            Connecté en tant que <strong>{currentUser.firstName} {currentUser.lastName}</strong>{" "}
            ({currentUser.email})
          </p>
          <p className="text-muted-foreground">Rôle : {currentUser.roleKey}</p>
          <p className="text-muted-foreground">
            Permissions : {currentUser.permissions.length > 0
              ? currentUser.permissions.join(", ")
              : "aucune"}
          </p>
        </section>
      ) : (
        <p className="text-destructive">
          Impossible de charger le profil depuis l&apos;API (session absente ou
          API inaccessible).
        </p>
      )}
    </main>
  );
}
