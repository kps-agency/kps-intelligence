import { createBrowserClient } from "@supabase/ssr";

// Client Supabase côté navigateur — clé publishable uniquement,
// utilisé exclusivement pour l'authentification (login/logout/session).
// Ne jamais l'utiliser pour lire des données métier (voir ARCHITECTURE.md §1).
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
