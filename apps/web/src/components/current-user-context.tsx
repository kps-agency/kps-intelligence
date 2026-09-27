"use client";

import type { CurrentUserResponse } from "@kps/types";
import { createContext, useContext, type ReactNode } from "react";

const CurrentUserContext = createContext<CurrentUserResponse | null>(null);

// Le layout serveur résout l'utilisateur une fois (GET /users/me) et le
// passe ici : les composants client lisent le rôle/permissions sans
// refaire d'appel. Sert uniquement à adapter l'UI — l'API vérifie les
// permissions à chaque requête.
export function CurrentUserProvider({
  user,
  children,
}: {
  user: CurrentUserResponse;
  children: ReactNode;
}) {
  return (
    <CurrentUserContext.Provider value={user}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): CurrentUserResponse {
  const user = useContext(CurrentUserContext);
  if (!user) {
    throw new Error("useCurrentUser doit être utilisé sous <CurrentUserProvider>.");
  }
  return user;
}

export function useHasPermission(permission: string): boolean {
  return useCurrentUser().permissions.includes(permission);
}
