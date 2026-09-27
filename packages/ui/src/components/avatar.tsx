import * as React from "react";
import { cn } from "../lib/utils";

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  firstName: string;
  lastName: string;
}

// Avatar à initiales (pas de photo pour l'instant : users.avatar_url sera
// géré avec les documents/Storage en Phase 20). Décoratif : le nom est
// toujours affiché à côté.
export function Avatar({
  firstName,
  lastName,
  className,
  ...props
}: AvatarProps) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary",
        className,
      )}
      {...props}
    >
      {initials}
    </span>
  );
}
