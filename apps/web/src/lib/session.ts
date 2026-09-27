import type { CurrentUserResponse } from "@kps/types";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentUserResult =
  | { status: "ok"; user: CurrentUserResponse }
  | { status: "unauthenticated" }
  | { status: "session-rejected" }
  | { status: "no-profile" }
  | { status: "api-unavailable" };

// Résout l'utilisateur courant (profil + rôle + permissions) en appelant
// GET /users/me avec le token de la session. `cache` garantit un seul
// appel par requête même si le layout et la page le demandent.
//
// - unauthenticated : pas de session Supabase (le middleware redirige
//   déjà, ceci est un filet de sécurité).
// - session-rejected : Supabase juge la session valide mais l'API refuse
//   le token (401). On n'affiche PAS /login : le middleware renverrait
//   aussitôt vers /dashboard (boucle) — l'utilisateur doit se déconnecter.
// - no-profile : session valide mais aucun profil actif en base (compte
//   désactivé ou jamais provisionné) — l'API répond 403.
// - api-unavailable : l'API ne répond pas ou renvoie une erreur serveur.
export const getCurrentUser = cache(async (): Promise<CurrentUserResult> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) return { status: "unauthenticated" };

  let response: Response;
  try {
    response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    return { status: "api-unavailable" };
  }

  if (response.status === 401) return { status: "session-rejected" };
  if (response.status === 403) return { status: "no-profile" };
  if (!response.ok) return { status: "api-unavailable" };

  return { status: "ok", user: (await response.json()) as CurrentUserResponse };
});
