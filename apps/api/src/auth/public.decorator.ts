import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "is_public";

// Marque une route comme accessible sans authentification (health check,
// futures routes publiques de qualification en Phase 10).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
