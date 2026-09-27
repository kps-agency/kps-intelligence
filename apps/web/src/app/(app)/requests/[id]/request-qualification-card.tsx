"use client";

import type { RequestResponse } from "@kps/types";
import { Button, Card, CardContent, CardHeader, CardTitle, Select } from "@kps/ui";
import { ClipboardList } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { useForms } from "@/lib/queries/forms";
import { useCreateQualificationSession } from "@/lib/queries/qualification-sessions";
import { useServices } from "@/lib/queries/services";

export function RequestQualificationCard({ request }: { request: RequestResponse }) {
  const forms = useForms();
  const services = useServices();
  const createSession = useCreateQualificationSession(request.id);
  const router = useRouter();

  const publishedForms = useMemo(
    () => (forms.data ?? []).filter((f) => f.status === "PUBLISHED"),
    [forms.data],
  );

  const defaultFormId = useMemo(() => {
    const service = (services.data ?? []).find((s) => s.slug === request.detectedServiceSlug);
    if (!service?.qualificationFormId) return "";
    return publishedForms.some((f) => f.id === service.qualificationFormId)
      ? service.qualificationFormId
      : "";
  }, [services.data, request.detectedServiceSlug, publishedForms]);

  const [formId, setFormId] = useState("");
  const selectedFormId = formId || defaultFormId || publishedForms[0]?.id || "";

  function start() {
    if (!selectedFormId) return;
    createSession.mutate(selectedFormId, {
      onSuccess: (session) => {
        router.push(`/requests/${request.id}/qualification/${session.id}`);
      },
    });
  }

  if (forms.isPending || services.isPending) return null;

  if (publishedForms.length === 0) {
    return null;
  }

  const serverError = createSession.error instanceof ApiError ? createSession.error : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2 text-base">
          <ClipboardList aria-hidden="true" className="size-4" />
          Qualification
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Remplir le formulaire de qualification au nom du client.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            aria-label="Formulaire de qualification"
            value={selectedFormId}
            onChange={(e) => setFormId(e.target.value)}
            className="sm:max-w-xs"
          >
            {publishedForms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
          <Button onClick={start} disabled={!selectedFormId || createSession.isPending}>
            {createSession.isPending ? "Démarrage..." : "Démarrer / reprendre"}
          </Button>
        </div>
        {serverError && <p className="text-sm text-destructive">{serverError.message}</p>}
      </CardContent>
    </Card>
  );
}
