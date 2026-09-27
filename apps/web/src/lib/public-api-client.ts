import type { ApiErrorResponse } from "@kps/types";
import { ApiError } from "@/lib/api-client";

// Variante de apiFetch sans session Supabase : le prospect qui ouvre un
// lien de qualification n'a pas de compte (section 23-24 du prompt).
// Cible /api/v1/public/*, jamais une route authentifiée.
export async function publicApiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
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

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
