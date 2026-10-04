"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@kps/ui";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useCurrentUser } from "@/components/current-user-context";
import { ApiError } from "@/lib/api-client";
import { useCreateOpportunity } from "@/lib/queries/opportunities";
import {
  NONE,
  OpportunityFields,
  opportunityFieldsSchema,
  toAmount,
  type OpportunityFieldsValues,
} from "./opportunity-fields";

export function CreateOpportunityDialog() {
  const { id: currentUserId } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const createOpportunity = useCreateOpportunity();
  const defaults: OpportunityFieldsValues = {
    title: "",
    description: "",
    clientId: NONE,
    serviceId: NONE,
    estimatedValue: "",
    currency: NONE,
    probability: "",
    ownerUserId: currentUserId,
    expectedCloseDate: "",
  };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<OpportunityFieldsValues>({
    resolver: zodResolver(opportunityFieldsSchema),
    defaultValues: defaults,
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset(defaults);
      createOpportunity.reset();
    }
    setOpen(next);
  }

  function onSubmit(values: OpportunityFieldsValues) {
    createOpportunity.mutate(
      {
        title: values.title,
        description: values.description || null,
        clientId: values.clientId === NONE ? null : values.clientId,
        serviceId: values.serviceId === NONE ? null : values.serviceId,
        estimatedValue: toAmount(values.estimatedValue),
        currency: values.currency === NONE ? undefined : values.currency,
        ownerUserId: values.ownerUserId === NONE ? null : values.ownerUserId,
        expectedCloseDate: values.expectedCloseDate || null,
      },
      { onSuccess: () => handleOpenChange(false) },
    );
  }

  const serverError = createOpportunity.error instanceof ApiError ? createOpportunity.error : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="shrink-0">
          <Plus aria-hidden="true" />
          Nouvelle opportunité
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle opportunité</DialogTitle>
          <DialogDescription>
            Saisie manuelle — une demande qualifiée crée la sienne automatiquement.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <OpportunityFields idPrefix="new-opp" register={register} errors={errors} currencyAuto />

          {serverError && (
            <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">{serverError.message}</p>
              {serverError.requestId && <p className="mt-1 text-xs">Référence : {serverError.requestId}</p>}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={createOpportunity.isPending}>
              {createOpportunity.isPending ? "Création..." : "Créer l'opportunité"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
