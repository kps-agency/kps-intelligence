"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function useSignOut() {
  const router = useRouter();
  return useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [router]);
}
