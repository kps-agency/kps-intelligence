"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { OpportunityResponse } from "@kps/types";
import { Button } from "@kps/ui";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { ApiError } from "@/lib/api-client";
import { useUpdateOpportunity } from "@/lib/queries/opportunities";
import {
  NONE,
  OpportunityFields,
  opportunityFieldsSchema,
  toAmount,
  type OpportunityFieldsValues,
} from "../opportunity-fields";

type FormValues = OpportunityFieldsValues;

function toFormValues(opportunity: OpportunityResponse): FormValues {
  return {
    title: opportunity.title,
    description: opportunity.description ?? "",
    clientId: opportunity.clientId ?? NONE,
    serviceId: opportunity.serviceId ?? NONE,
    estimatedValue: opportunity.estimatedValue === null ? "" : String(opportunity.estimatedValue),
    currency: opportunity.currency ?? "EUR",
    ownerUserId: opportunity.ownerUserId ?? NONE,
    expectedCloseDate: opportunity.expectedCloseDate ?? "",
    probability: opportunity.probability === null ? "" : String(opportunity.probability),
  };
}

export function EditOpportunityForm({
  opportunity,
  onDone,
}: {
  opportunity: OpportunityResponse;
  onDone: () => void;
}) {
  const updateOpportunity = useUpdateOpportunity(opportunity.id);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(opportunityFieldsSchema), defaultValues: toFormValues(opportunity) });

  useEffect(() => reset(toFormValues(opportunity)), [opportunity, reset]);

  function onSubmit(values: FormValues) {
    updateOpportunity.mutate(
      {
        title: values.title,
        description: values.description || null,
        clientId: values.clientId === NONE ? null : values.clientId,
        serviceId: values.serviceId === NONE ? null : values.serviceId,
        estimatedValue: toAmount(values.estimatedValue),
        currency: values.currency,
        probability: values.probability === "" ? null : Number(values.probability),
        ownerUserId: values.ownerUserId === NONE ? null : values.ownerUserId,
        expectedCloseDate: values.expectedCloseDate || null,
      },
      { onSuccess: onDone },
    );
  }

  const serverError = updateOpportunity.error instanceof ApiError ? updateOpportunity.error : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <OpportunityFields
        idPrefix="edit-opp"
        register={register}
        errors={errors}
        currencyAuto={false}
        withProbability
      />

      {serverError && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {serverError.message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" disabled={updateOpportunity.isPending || !isDirty}>
          {updateOpportunity.isPending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
