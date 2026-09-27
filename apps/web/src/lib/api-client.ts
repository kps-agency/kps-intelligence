import type { ApiErrorResponse } from "@kps/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Erreur typée renvoyée par tout appel à apps/api qui échoue. `requestId`
// permet à un utilisateur de le communiquer pour retrouver la trace dans
// les logs de l'API.
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly requestId: string | null,
    public readonly details: string[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Appels côté navigateur uniquement (composants client / TanStack Query).
// Les Server Components utilisent lib/session.ts, qui lit la session dans
// les cookies. Le token vient de la session Supabase ; c'est l'API qui
// fait autorité en le vérifiant (JWKS) à chaque requête.
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  let response: Response;
  try {
    response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, "Le serveur est injoignable.", null, []);
  }

  if (!response.ok) {
    let body: Partial<ApiErrorResponse> = {};
    try {
      body = (await response.json()) as Partial<ApiErrorResponse>;
    } catch {
      // Corps non JSON (proxy, panne) : on retombe sur un message générique.
    }
    const details = Array.isArray(body.message)
      ? body.message
      : body.message
        ? [body.message]
        : [];
    throw new ApiError(
      response.status,
      details[0] ?? `Erreur ${response.status}`,
      body.requestId ?? null,
      details,
    );
  }

  return (await response.json()) as T;
}
