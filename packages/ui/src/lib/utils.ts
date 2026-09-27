import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Fusionne des classes Tailwind en résolvant les conflits (la dernière
// gagne) — base de tous les composants qui acceptent un `className`.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
