import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

// Client Supabase pour Server Components / Route Handlers — lit/écrit les
// cookies de session via l'API cookies() de Next.js. Utilisé uniquement
// pour connaître l'utilisateur courant, jamais pour lire des données
// métier (voir ARCHITECTURE.md §1).
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // set() échoue silencieusement dans un Server Component pur
            // (pas de réponse mutable) — le middleware se charge du
            // rafraîchissement de session dans ce cas.
          }
        },
      },
    },
  );
}
