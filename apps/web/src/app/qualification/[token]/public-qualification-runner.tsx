"use client";

import { APP_NAME } from "@kps/shared";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@kps/ui";
import { CheckCircle2, Clock, ShieldOff } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { MultiStepQualificationForm } from "@/components/multi-step-qualification-form";
import {
  usePublicQualification,
  useSavePublicFormResponse,
  useSubmitPublicQualification,
} from "@/lib/queries/public-qualification";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-4 py-10 sm:py-16">
      <p className="text-xl font-bold tracking-tight">{APP_NAME}</p>
      <div className="w-full max-w-2xl">{children}</div>
    </main>
  );
}

export function PublicQualificationRunner({ token }: { token: string }) {
  const session = usePublicQualification(token);
  const saveResponse = useSavePublicFormResponse(token);
  const submit = useSubmitPublicQualification(token);

  if (session.isPending) {
    return (
      <Shell>
        <div role="status" aria-label="Chargement" className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64" />
        </div>
      </Shell>
    );
  }

  if (session.isError) {
    const notFound = session.error instanceof ApiError && session.error.statusCode === 404;
    return (
      <Shell>
        <Card>
          <CardContent className="pt-6 text-sm">
            <p role="alert" className="text-destructive">
              {notFound
                ? "Ce lien de qualification est introuvable."
                : "Une erreur est survenue. Merci de réessayer dans quelques instants."}
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const data = session.data;

  if (data.status === "CANCELLED") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle as="h1" className="flex items-center gap-2 text-lg">
              <ShieldOff aria-hidden="true" className="size-5 text-muted-foreground" />
              Lien désactivé
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Ce lien de qualification n&apos;est plus valide. Contactez {APP_NAME} pour en obtenir un
            nouveau.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (data.status === "EXPIRED") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle as="h1" className="flex items-center gap-2 text-lg">
              <Clock aria-hidden="true" className="size-5 text-muted-foreground" />
              Lien expiré
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Ce lien de qualification a expiré. Contactez {APP_NAME} pour en obtenir un nouveau.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (data.status === "COMPLETED") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle as="h1" className="flex items-center gap-2 text-lg">
              <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
              Merci pour votre demande
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>Nous avons bien reçu les informations concernant votre projet.</p>
            <p>Notre équipe va maintenant analyser votre besoin et reviendra vers vous.</p>
            <p className="mt-2 font-mono text-muted-foreground">
              Référence : {data.requestReference}
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="flex flex-col gap-1 pt-6 text-sm">
            <p>Bonjour{data.contactFirstName ? ` ${data.contactFirstName}` : ""},</p>
            {data.serviceName ? (
              <p>
                Merci pour votre demande concernant <strong>{data.serviceName}</strong>.
              </p>
            ) : (
              <p>Merci pour votre demande.</p>
            )}
            <p className="text-muted-foreground">
              Quelques informations nous permettront de mieux comprendre votre besoin.
            </p>
          </CardContent>
        </Card>

        <MultiStepQualificationForm
          form={data.form}
          initialResponses={data.responses}
          readOnly={false}
          isSaving={saveResponse.isPending}
          isSubmitting={submit.isPending}
          onSaveField={(fieldKey, value) => saveResponse.mutateAsync({ fieldKey, value })}
          onSubmit={() => submit.mutateAsync()}
        />
      </div>
    </Shell>
  );
}
