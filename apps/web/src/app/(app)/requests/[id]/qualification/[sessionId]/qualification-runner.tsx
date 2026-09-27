"use client";

import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@kps/ui";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { ApiError } from "@/lib/api-client";
import { isEmptyValue, isFieldVisible } from "@/lib/qualification-form-logic";
import {
  useQualificationSession,
  useSaveFormResponse,
  useSubmitQualificationSession,
} from "@/lib/queries/qualification-sessions";
import { MultiStepQualificationForm } from "@/components/multi-step-qualification-form";

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

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/requests/${requestId}`}
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Retour à la demande
      </Link>

      {data.status === "COMPLETED" ? (
        <Card>
          <CardHeader>
            <CardTitle as="h1" className="flex items-center gap-2">
              <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
              Qualification terminée
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {data.form.steps.map((step) => (
              <div key={step.id}>
                <h2 className="font-medium">{step.title}</h2>
                {/* dt/dd en enfants directs de dl (règle d'accessibilité
                    "definition-list") : pas de <div> intermédiaire par
                    paire, le groupement visuel vient du seul espacement. */}
                <dl className="mt-2 grid gap-1 text-sm">
                  {step.fields
                    .filter(
                      (f) => isFieldVisible(f, data.responses) && !isEmptyValue(data.responses[f.key]),
                    )
                    .map((f) => (
                      <Fragment key={f.id}>
                        <dt className="mt-1.5 text-muted-foreground first:mt-0">{f.label}</dt>
                        <dd>
                          {Array.isArray(data.responses[f.key])
                            ? (data.responses[f.key] as string[]).join(", ")
                            : String(data.responses[f.key])}
                        </dd>
                      </Fragment>
                    ))}
                </dl>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <MultiStepQualificationForm
          form={data.form}
          initialResponses={data.responses}
          readOnly={!canEdit}
          readOnlyNotice="Lecture seule — vous n'avez pas la permission de modifier cette qualification."
          isSaving={saveResponse.isPending}
          isSubmitting={submit.isPending}
          onSaveField={(fieldKey, value) =>
            saveResponse.mutateAsync({ fieldKey, value })
          }
          onSubmit={() => submit.mutateAsync()}
        />
      )}
    </div>
  );
}
