"use client";

import { FORM_STATUS_LABELS } from "@kps/shared";
import { FormStatus } from "@kps/types";
import { Badge, Button, Card, CardContent, Select, Skeleton } from "@kps/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { useFormDetail, useUpdateForm } from "@/lib/queries/forms";
import { FORM_STATUS_VARIANT } from "@/lib/form-display";
import { StepCard } from "./step-card";
import { StepTitleDialog } from "./step-title-dialog";

export function FormBuilder({ formId, canManage }: { formId: string; canManage: boolean }) {
  const form = useFormDetail(formId);
  const updateForm = useUpdateForm(formId);
  const [addingStep, setAddingStep] = useState(false);

  if (form.isPending) {
    return (
      <div role="status" aria-label="Chargement du formulaire" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (form.isError) {
    const notFound = form.error instanceof ApiError && form.error.statusCode === 404;
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-2 pt-6 text-sm">
          <p role="alert" className="text-destructive">
            {notFound ? "Ce formulaire n'existe pas." : `Erreur : ${form.error.message}`}
          </p>
          <Link href="/forms" className="text-primary underline-offset-4 hover:underline">
            Retour à la liste des formulaires
          </Link>
        </CardContent>
      </Card>
    );
  }

  const data = form.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/forms" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Formulaires
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
        {data.description && <p className="text-muted-foreground">{data.description}</p>}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-6 text-sm">
          <span className="font-mono text-xs text-muted-foreground">{data.slug}</span>
          {data.serviceName && <Badge variant="outline">{data.serviceName}</Badge>}
          <span className="text-muted-foreground">Version {data.version}</span>

          <div className="ml-auto flex items-center gap-2">
            {canManage ? (
              <Select
                aria-label="Statut du formulaire"
                value={data.status}
                disabled={updateForm.isPending}
                onChange={(e) => updateForm.mutate({ status: e.target.value as FormStatus })}
                className="w-44"
              >
                {Object.values(FormStatus).map((value) => (
                  <option key={value} value={value}>
                    {FORM_STATUS_LABELS[value]}
                  </option>
                ))}
              </Select>
            ) : (
              <Badge variant={FORM_STATUS_VARIANT[data.status]}>{FORM_STATUS_LABELS[data.status]}</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {data.steps.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Ce formulaire n&apos;a pas encore d&apos;étape.
        </p>
      )}

      {data.steps.map((step, index) => (
        <StepCard
          key={step.id}
          form={data}
          step={step}
          isFirst={index === 0}
          isLast={index === data.steps.length - 1}
          canManage={canManage}
        />
      ))}

      {canManage && (
        <Button variant="outline" onClick={() => setAddingStep(true)} className="self-start">
          <Plus aria-hidden="true" />
          Ajouter une étape
        </Button>
      )}

      {addingStep && <StepTitleDialog formId={formId} onClose={() => setAddingStep(false)} />}
    </div>
  );
}
