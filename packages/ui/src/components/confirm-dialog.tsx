"use client";

import * as React from "react";
import { Button, type ButtonProps } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

export interface ConfirmDialogProps {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  isConfirming?: boolean;
  onConfirm: () => void;
}

// Le déclencheur est porté par le dialogue (comme CreateUserDialog en
// Phase 5) : c'est ce qui permet à Radix de rendre le focus au bon
// élément à la fermeture, y compris quand chaque ligne d'un tableau a son
// propre dialogue de confirmation.
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  confirmVariant = "destructive",
  isConfirming = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            disabled={isConfirming}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {isConfirming ? "..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
