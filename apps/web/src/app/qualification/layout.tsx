import type { ReactNode } from "react";
import { Providers } from "@/components/providers";

// Segment public (aucune session Supabase, voir middleware.ts qui exclut
// /qualification de la protection par cookie) : a besoin de son propre
// QueryClientProvider, normalement fourni par (app)/layout.tsx.
export default function QualificationLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
