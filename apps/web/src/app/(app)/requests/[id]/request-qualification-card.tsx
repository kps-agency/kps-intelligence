"use client";

import type { RequestResponse } from "@kps/types";
import { Button, Card, CardContent, CardHeader, CardTitle, Select, Skeleton } from "@kps/ui";
import { ClipboardList } from "lucide-react";
import { useMemo, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { useForms } from "@/lib/queries/forms";
import {
  useCreateQualificationSession,
  useQualificationSessionsList,
} from "@/lib/queries/qualification-sessions";
import { useServices } from "@/lib/queries/services";
import { QualificationSessionRow } from "./qualification-session-row";

export function RequestQualificationCard({ request }: { request: RequestResponse }) {
  const forms = useForms();
  const services = useServices();
  const sessions = useQualificationSessionsList(request.id);
  const createSession = useCreateQualificationSession(request.id);

  // URL brute d'une session tout juste créée/régénérée dans cet affichage
  // — jamais persistée ni récupérable après un rechargement de la page.
  const [freshLinks, setFreshLinks] = useState<Record<string, string>>({});

  const publishedForms = useMemo(
    () => (forms.data ?? []).filter((f) => f.status === "PUBLISHED"),
    [forms.data],
  );
  const formNameById = useMemo(
    () => new Map((forms.data ?? []).map((f) => [f.id, f.name])),
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

  function generate() {
    if (!selectedFormId) return;
    createSession.mutate(selectedFormId, {
      onSuccess: (created) => {
        setFreshLinks((prev) => ({ ...prev, [created.id]: created.qualificationUrl }));
      },
    });
  }

  if (forms.isPending || services.isPending || sessions.isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2 text-base">
            <ClipboardList aria-hidden="true" className="size-4" />
            Qualification
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  if (publishedForms.length === 0 && (sessions.data ?? []).length === 0) {
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
      <CardContent className="flex flex-col gap-4">
        {sessions.isSuccess && sessions.data.length > 0 && (
          <div className="flex flex-col gap-3">
            {sessions.data.map((session) => (
              <QualificationSessionRow
                key={session.id}
                requestId={request.id}
                session={session}
                formName={formNameById.get(session.formId) ?? "Formulaire"}
                freshUrl={freshLinks[session.id]}
                onRegenerated={(url) =>
                  setFreshLinks((prev) => ({ ...prev, [session.id]: url }))
                }
              />
            ))}
          </div>
        )}

        {publishedForms.length > 0 && (
          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-sm text-muted-foreground">
              {sessions.isSuccess && sessions.data.length > 0
                ? "Générer un lien pour un autre formulaire :"
                : "Générer un lien de qualification à envoyer au client :"}
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
              <Button onClick={generate} disabled={!selectedFormId || createSession.isPending}>
                {createSession.isPending ? "Génération..." : "Générer le lien"}
              </Button>
            </div>
            {serverError && <p className="text-sm text-destructive">{serverError.message}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
