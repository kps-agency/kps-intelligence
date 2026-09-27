"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api-client";

export function Providers({ children }: { children: ReactNode }) {
  // Un client par montage (pas au niveau module) : sur le serveur, un
  // client partagé fuiterait des données entre utilisateurs.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Une erreur 4xx (permission, validation) ne se résout pas en
            // réessayant : on ne retente que les pannes réseau / 5xx.
            retry: (failureCount, error) =>
              !(error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) &&
              failureCount < 2,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
