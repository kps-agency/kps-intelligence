"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@kps/ui";
import { useEffect, useState } from "react";

// Passer une opportunité à « Perdue » demande confirmation : le motif
// (facultatif) est la seule trace du pourquoi dans l'historique.
export function LostReasonDialog({
  title,
  onCancel,
  onConfirm,
}: {
  // Titre de l'opportunité concernée ; `null` = dialogue fermé.
  title: string | null;
  onCancel: () => void;
  onConfirm: (reason: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (title !== null) setReason("");
  }, [title]);

  return (
    <Dialog open={title !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Opportunité perdue</DialogTitle>
          <DialogDescription>« {title} » passera à l&apos;étape Perdue.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm(reason.trim() || null);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="lost-reason">Motif (facultatif)</Label>
            <Textarea
              id="lost-reason"
              maxLength={1000}
              placeholder="Budget, concurrent retenu, projet abandonné..."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Annuler
            </Button>
            <Button type="submit" variant="destructive">
              Marquer comme perdue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
