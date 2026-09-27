"use client";

import type { FormFieldResponse } from "@kps/types";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Skeleton, Textarea } from "@kps/ui";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";
import {
  useQualificationSession,
  useSaveFormResponse,
  useSubmitQualificationSession,
} from "@/lib/queries/qualification-sessions";

function isFieldVisible(field: FormFieldResponse, values: Record<string, unknown>): boolean {
  if (!field.conditionalLogic) return true;
  return values[field.conditionalLogic.field] === field.conditionalLogic.equals;
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

const INPUT_TYPE: Partial<Record<FormFieldResponse["type"], string>> = {
  EMAIL: "email",
  PHONE: "tel",
  URL: "url",
  NUMBER: "number",
  CURRENCY: "number",
  RANGE: "number",
  DATE: "date",
};

function QualificationField({
  field,
  value,
  disabled,
  onChange,
  onCommit,
}: {
  field: FormFieldResponse;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
  onCommit: (value: unknown) => void;
}) {
  const id = `qf-${field.id}`;

  if (field.type === "FILE") {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <p className="text-sm text-muted-foreground">
          Le téléversement de fichiers n&apos;est pas encore disponible.
        </p>
      </div>
    );
  }

  if (field.type === "TEXTAREA") {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <Textarea
          id={id}
          disabled={disabled}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onCommit(e.target.value.trim() === "" ? null : e.target.value)}
        />
      </div>
    );
  }

  if (field.type === "SELECT") {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <Select
          id={id}
          disabled={disabled}
          value={(value as string) ?? ""}
          onChange={(e) => {
            onChange(e.target.value);
            onCommit(e.target.value === "" ? null : e.target.value);
          }}
        >
          <option value="">Sélectionner...</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
    );
  }

  if (field.type === "RADIO") {
    return (
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{field.label}</legend>
        {field.options?.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={id}
              disabled={disabled}
              checked={value === o.value}
              onChange={() => {
                onChange(o.value);
                onCommit(o.value);
              }}
              className="size-4 border-input"
            />
            {o.label}
          </label>
        ))}
      </fieldset>
    );
  }

  if (field.type === "MULTI_SELECT" || field.type === "CHECKBOX") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{field.label}</legend>
        {field.options?.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={disabled}
              checked={selected.includes(o.value)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...selected, o.value]
                  : selected.filter((v) => v !== o.value);
                onChange(next);
                onCommit(next.length === 0 ? null : next);
              }}
              className="size-4 rounded border-input"
            />
            {o.label}
          </label>
        ))}
      </fieldset>
    );
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      <Input
        id={id}
        type={INPUT_TYPE[field.type] ?? "text"}
        disabled={disabled}
        value={(value as string | number) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") {
            onCommit(null);
          } else if (INPUT_TYPE[field.type] === "number") {
            onCommit(Number(raw));
          } else {
            onCommit(raw);
          }
        }}
      />
    </div>
  );
}

export function QualificationRunner({
  requestId,
  sessionId,
  canEdit,
}: {
  requestId: string;
  sessionId: string;
  canEdit: boolean;
}) {
  const session = useQualificationSession(sessionId);
  const saveResponse = useSaveFormResponse(sessionId);
  const submit = useSubmitQualificationSession(sessionId);
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (session.data) setValues(session.data.responses);
  }, [session.data]);

  if (session.isPending) {
    return (
      <div role="status" aria-label="Chargement de la qualification" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (session.isError) {
    const notFound = session.error instanceof ApiError && session.error.statusCode === 404;
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-2 pt-6 text-sm">
          <p role="alert" className="text-destructive">
            {notFound ? "Cette session de qualification n'existe pas." : `Erreur : ${session.error.message}`}
          </p>
          <Link href={`/requests/${requestId}`} className="text-primary underline-offset-4 hover:underline">
            Retour à la demande
          </Link>
        </CardContent>
      </Card>
    );
  }

  const data = session.data;
  const steps = data.form.steps;
  const readOnly = !canEdit || data.status === "COMPLETED";

  if (data.status === "COMPLETED") {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href={`/requests/${requestId}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Retour à la demande
        </Link>
        <Card>
          <CardHeader>
            <CardTitle as="h1" className="flex items-center gap-2">
              <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
              Qualification terminée
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {steps.map((step) => (
              <div key={step.id}>
                <h2 className="font-medium">{step.title}</h2>
                <dl className="mt-2 grid gap-2 text-sm">
                  {step.fields
                    .filter((f) => isFieldVisible(f, data.responses) && !isEmpty(data.responses[f.key]))
                    .map((f) => (
                      <div key={f.id} className="grid gap-0.5">
                        <dt className="text-muted-foreground">{f.label}</dt>
                        <dd>
                          {Array.isArray(data.responses[f.key])
                            ? (data.responses[f.key] as string[]).join(", ")
                            : String(data.responses[f.key])}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStep = steps[stepIndex];
  if (!currentStep) return null;
  const visibleFields = currentStep.fields.filter((f) => isFieldVisible(f, values));
  const isLastStep = stepIndex === steps.length - 1;

  function commit(fieldKey: string, value: unknown) {
    saveResponse.mutate(
      { fieldKey, value },
      {
        onError: (error) => {
          setSubmitError(error instanceof ApiError ? error.message : "Échec de l'enregistrement.");
        },
      },
    );
  }

  function missingRequiredLabels() {
    return visibleFields.filter((f) => f.required && isEmpty(values[f.key])).map((f) => f.label);
  }

  function goNext() {
    const missing = missingRequiredLabels();
    if (missing.length > 0) {
      setSubmitError(`Champs requis manquants : ${missing.join(", ")}`);
      return;
    }
    setSubmitError(null);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function handleSubmit() {
    const missing = missingRequiredLabels();
    if (missing.length > 0) {
      setSubmitError(`Champs requis manquants : ${missing.join(", ")}`);
      return;
    }
    submit.mutate(undefined, {
      onError: (error) => {
        setSubmitError(error instanceof ApiError ? error.message : "Échec de la soumission.");
      },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/requests/${requestId}`}
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Retour à la demande
      </Link>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between">
            <CardTitle as="h1" className="text-lg">
              {data.form.name}
            </CardTitle>
            <Badge variant="outline">
              Étape {stepIndex + 1} / {steps.length}
            </Badge>
          </div>
          <div
            role="progressbar"
            aria-label="Progression de la qualification"
            aria-valuenow={stepIndex + 1}
            aria-valuemin={1}
            aria-valuemax={steps.length}
            className="h-2 w-full overflow-hidden rounded-full bg-secondary"
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
            />
          </div>
          <h2 className="text-base font-medium">{currentStep.title}</h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {readOnly && (
            <p className="text-sm text-muted-foreground">
              Lecture seule — vous n&apos;avez pas la permission de modifier cette qualification.
            </p>
          )}

          {visibleFields.map((field) => (
            <QualificationField
              key={field.id}
              field={field}
              value={values[field.key]}
              disabled={readOnly}
              onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
              onCommit={(v) => {
                setValues((prev) => ({ ...prev, [field.key]: v }));
                if (!readOnly) commit(field.key, v);
              }}
            />
          ))}

          {submitError && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {submitError}
            </p>
          )}

          <div className="flex justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((i) => Math.max(i - 1, 0))}
            >
              Précédent
            </Button>
            {isLastStep ? (
              <Button
                type="button"
                disabled={readOnly || submit.isPending || saveResponse.isPending}
                onClick={handleSubmit}
              >
                {submit.isPending
                  ? "Envoi..."
                  : saveResponse.isPending
                    ? "Enregistrement..."
                    : "Soumettre"}
              </Button>
            ) : (
              <Button type="button" disabled={saveResponse.isPending} onClick={goNext}>
                Suivant
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
