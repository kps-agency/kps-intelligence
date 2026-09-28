import { ROLE_LABELS } from "@kps/shared";
import type { AvailabilityStatus, UserRole } from "@kps/types";
import type { BadgeProps } from "@kps/ui";

export const AVAILABILITY: Record<AvailabilityStatus, { label: string; variant: BadgeProps["variant"] }> = {
  AVAILABLE: { label: "Disponible", variant: "success" },
  BUSY: { label: "Disponibilité limitée", variant: "warning" },
  UNAVAILABLE: { label: "Indisponible", variant: "destructive" },
};

export function roleLabel(roleKey: string): string {
  return ROLE_LABELS[roleKey as UserRole] ?? roleKey;
}

export const LEVEL_LABELS: Record<number, string> = {
  1: "Notions",
  2: "Débutant",
  3: "Intermédiaire",
  4: "Confirmé",
  5: "Expert",
};
