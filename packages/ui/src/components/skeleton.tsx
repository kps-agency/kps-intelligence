import * as React from "react";
import { cn } from "../lib/utils";

// Purement décoratif : masqué aux lecteurs d'écran. Le conteneur qui
// l'utilise doit porter aria-busy / un libellé de chargement.
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
