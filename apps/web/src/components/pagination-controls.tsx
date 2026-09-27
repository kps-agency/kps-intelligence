"use client";

import { Button } from "@kps/ui";
import type { PaginatedResponse } from "@kps/types";

// Pagination Précédent/Suivant, commune à toutes les listes de l'API
// (contrat `PaginatedResponse`). Une pagination par numéros de page
// n'apporte rien tant qu'aucune liste ne dépasse quelques centaines de
// lignes — à revoir si ça change.
export function PaginationControls({
  meta,
  onPageChange,
}: {
  meta: PaginatedResponse<unknown>["meta"];
  onPageChange: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(meta.total / meta.limit));
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <p aria-live="polite">
        {meta.total === 0
          ? "Aucun résultat"
          : `${from}–${to} sur ${meta.total}`}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          Précédent
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={meta.page >= lastPage}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Suivant
        </Button>
      </div>
    </div>
  );
}
