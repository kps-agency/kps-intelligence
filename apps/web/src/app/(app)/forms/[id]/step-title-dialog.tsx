"use client";

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label } from "@kps/ui";
import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api-client";
import { useCreateStep, useUpdateStep } from "@/lib/queries/forms";

export function StepTitleDialog({
  formId,
  step,
  onClose,
}: {
  formId: string;
  step?: { id: string; title: string };
  onClose: () => void;
}) {
  const [title, setTitle] = useState(step?.title ?? "");
  const createStep = useCreateStep(formId);
  const updateStep = useUpdateStep(formId, step?.id ?? "");
  const mutation = step ? updateStep : createStep;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    mutation.mutate({ title: title.trim() }, { onSuccess: onClose });
  }

  const serverError = mutation.error instanceof ApiError ? mutation.error : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{step ? "Renommer l'étape" : "Ajouter une étape"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="step-title">Titre de l&apos;étape</Label>
            <Input
              id="step-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          {serverError && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending || !title.trim()}>
              {mutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
