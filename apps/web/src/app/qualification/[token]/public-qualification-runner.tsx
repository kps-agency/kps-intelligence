"use client";

import { APP_NAME } from "@kps/shared";
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@kps/ui";
import { CheckCircle2, Clock, Languages, ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { MultiStepQualificationForm } from "@/components/multi-step-qualification-form";
import { QUALIFICATION_COPY, type QualificationLocale } from "@/lib/qualification-copy";
import {
  usePublicQualification,
  useSavePublicFormResponse,
  useSubmitPublicQualification,
} from "@/lib/queries/public-qualification";

function Shell({
  children,
  locale,
  onLocaleChange,
}: {
  children: React.ReactNode;
  locale: QualificationLocale;
  onLocaleChange: (locale: QualificationLocale) => void;
}) {
  const other: QualificationLocale = locale === "fr" ? "en" : "fr";
  return (
    <main lang={locale} className="flex min-h-screen flex-col items-center gap-6 p-4 py-10 sm:py-16">
      <div className="flex w-full max-w-2xl items-center justify-between gap-4">
        <p className="text-xl font-bold tracking-tight">{APP_NAME}</p>
        {/* Le libellé est dans la langue proposée : c'est celle que lit la personne qui la cherche. */}
        <Button type="button" variant="ghost" size="sm" lang={other} onClick={() => onLocaleChange(other)}>
          <Languages aria-hidden="true" />
          {QUALIFICATION_COPY[locale].languageSwitch}
        </Button>
      </div>
      <div className="w-full max-w-2xl">{children}</div>
    </main>
  );
}

// Tant que la session n'est pas chargée, la langue du navigateur ; ensuite
// celle de la demande, sauf si le prospect en a choisi une lui-même.
function browserLocale(): QualificationLocale {
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("en") ? "en" : "fr";
}

export function PublicQualificationRunner({ token }: { token: string }) {
  const session = usePublicQualification(token);
  const saveResponse = useSavePublicFormResponse(token);
  const submit = useSubmitPublicQualification(token);
  const [chosen, setChosen] = useState<QualificationLocale | null>(null);
  const [fallback, setFallback] = useState<QualificationLocale>("fr");
  const [consent, setConsent] = useState(false);

  useEffect(() => setFallback(browserLocale()), []);

  const locale = chosen ?? session.data?.language ?? fallback;
  const copy = QUALIFICATION_COPY[locale];
  const shell = (children: React.ReactNode) => (
    <Shell locale={locale} onLocaleChange={setChosen}>
      {children}
    </Shell>
  );

  if (session.isPending) {
    return shell(
      <div role="status" aria-label={copy.loading} className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>,
    );
  }

  if (session.isError) {
    const notFound = session.error instanceof ApiError && session.error.statusCode === 404;
    return shell(
      <Card>
        <CardContent className="pt-6 text-sm">
          <p role="alert" className="text-destructive">
            {notFound ? copy.notFound : copy.genericError}
          </p>
        </CardContent>
      </Card>,
    );
  }

  const data = session.data;

  if (data.status === "CANCELLED" || data.status === "EXPIRED") {
    const cancelled = data.status === "CANCELLED";
    const Icon = cancelled ? ShieldOff : Clock;
    return shell(
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="flex items-center gap-2 text-lg">
            <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
            {cancelled ? copy.cancelledTitle : copy.expiredTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {cancelled ? copy.cancelledBody(APP_NAME) : copy.expiredBody(APP_NAME)}
        </CardContent>
      </Card>,
    );
  }

  if (data.status === "COMPLETED") {
    return shell(
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="flex items-center gap-2 text-lg">
            <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
            {copy.completedTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {copy.completedLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p className="mt-2 font-mono text-muted-foreground">
            {copy.reference} : {data.requestReference}
          </p>
        </CardContent>
      </Card>,
    );
  }

  return shell(
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-1 pt-6 text-sm">
          <p>{copy.greeting(data.contactFirstName)}</p>
          {data.serviceName ? (
            <p>
              {copy.thanksAbout} <strong>{data.serviceName}</strong>.
            </p>
          ) : (
            <p>{copy.thanks}</p>
          )}
          <p className="text-muted-foreground">{copy.intro}</p>
        </CardContent>
      </Card>

      <MultiStepQualificationForm
        form={data.form}
        initialResponses={data.responses}
        readOnly={false}
        isSaving={saveResponse.isPending}
        isSubmitting={submit.isPending}
        locale={locale}
        consent={{
          checked: consent,
          onChange: setConsent,
          label: copy.consentLabel,
          detail: copy.consentDetail(APP_NAME),
        }}
        onSaveField={(fieldKey, value) => saveResponse.mutateAsync({ fieldKey, value })}
        onSubmit={() => submit.mutateAsync(consent)}
      />
    </div>,
  );
}
