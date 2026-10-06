"use client";

import type { FormResponse } from "@kps/types";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@kps/ui";
import { useEffect, useState } from "react";
import { QualificationField } from "@/components/qualification-field";
import { QUALIFICATION_COPY, type QualificationLocale } from "@/lib/qualification-copy";
import { isFieldVisible, missingRequiredLabels } from "@/lib/qualification-form-logic";

// Moteur de rendu partagé entre le runner authentifié (admin,
// /requests/[id]/qualification/[sessionId]) et la page publique
// (/qualification/[token]) : uniquement l'expérience de remplissage
// (étapes, navigation, logique conditionnelle, autosave). Chaque appelant
// gère lui-même ses propres états de chargement/erreur/complété — quand
// la session est COMPLETED, l'appelant n'affiche pas ce composant.
export function MultiStepQualificationForm({
  form,
  initialResponses,
  readOnly,
  readOnlyNotice,
  onSaveField,
  onSubmit,
  isSaving,
  isSubmitting,
  locale = "fr",
  consent,
}: {
  form: FormResponse;
  initialResponses: Record<string, unknown>;
  readOnly: boolean;
  readOnlyNotice?: string;
  onSaveField: (fieldKey: string, value: unknown) => Promise<unknown>;
  onSubmit: () => Promise<unknown>;
  isSaving: boolean;
  isSubmitting: boolean;
  // Langue des textes d'interface (les questions gardent celle du formulaire).
  locale?: QualificationLocale;
  // Page publique : accord du prospect, demandé à la dernière étape et
  // exigé pour envoyer (section 66).
  consent?: { checked: boolean; onChange: (checked: boolean) => void; label: string; detail: string };
}) {
  const copy = QUALIFICATION_COPY[locale];
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>(initialResponses);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setValues(initialResponses), [initialResponses]);

  const steps = form.steps;
  const currentStep = steps[stepIndex];
  if (!currentStep) return null;
  const visibleFields = currentStep.fields.filter((f) => isFieldVisible(f, values));
  const isLastStep = stepIndex === steps.length - 1;

  function commit(fieldKey: string, value: unknown) {
    setValues((prev) => ({ ...prev, [fieldKey]: value }));
    if (readOnly) return;
    onSaveField(fieldKey, value).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : copy.saveFailed);
    });
  }

  function goNext() {
    const missing = missingRequiredLabels(visibleFields, values);
    if (missing.length > 0) {
      setError(copy.missing(missing));
      return;
    }
    setError(null);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function handleSubmit() {
    const missing = missingRequiredLabels(visibleFields, values);
    if (missing.length > 0) {
      setError(copy.missing(missing));
      return;
    }
    if (consent && !consent.checked) {
      setError(copy.consentRequired);
      return;
    }
    setError(null);
    onSubmit().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : copy.submitFailed);
    });
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between">
          <CardTitle as="h1" className="text-lg">
            {form.name}
          </CardTitle>
          <Badge variant="outline">
            {copy.step(stepIndex + 1, steps.length)}
          </Badge>
        </div>
        <div
          role="progressbar"
          aria-label={copy.progress}
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
        {readOnly && readOnlyNotice && (
          <p className="text-sm text-muted-foreground">{readOnlyNotice}</p>
        )}

        {visibleFields.map((field) => (
          <QualificationField
            key={field.id}
            field={field}
            value={values[field.key]}
            disabled={readOnly}
            onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
            onCommit={(v) => commit(field.key, v)}
          />
        ))}

        {consent && isLastStep && !readOnly && (
          <div className="flex items-start gap-3 rounded-md border p-3">
            <input
              id="qualification-consent"
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-primary"
              checked={consent.checked}
              aria-describedby="qualification-consent-detail"
              onChange={(event) => consent.onChange(event.target.checked)}
            />
            <div className="flex flex-col gap-1 text-sm">
              <label htmlFor="qualification-consent" className="font-medium">
                {consent.label}
              </label>
              <p id="qualification-consent-detail" className="text-muted-foreground">
                {consent.detail}
              </p>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => Math.max(i - 1, 0))}
          >
            {copy.previous}
          </Button>
          {isLastStep ? (
            <Button type="button" disabled={readOnly || isSubmitting || isSaving} onClick={handleSubmit}>
              {isSubmitting ? copy.submitting : isSaving ? copy.saving : copy.submit}
            </Button>
          ) : (
            <Button type="button" disabled={isSaving} onClick={goNext}>
              {copy.next}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
