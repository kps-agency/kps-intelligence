"use client";

import { PRIORITY_LABELS, REQUEST_STATUS_LABELS } from "@kps/shared";
import type { RequestResponse } from "@kps/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@kps/ui";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PRIORITY_VARIANT, REQUEST_STATUS_VARIANT } from "@/lib/request-display";
import { EditRequestForm } from "./edit-request-form";

const dateTimeFormatter = new Intl.DateTimeFormat("fr-CH", {
  dateStyle: "medium",
  timeStyle: "short",
});

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="break-words font-medium">{value ?? "—"}</p>
    </div>
  );
}

export function RequestInfoCard({
  request,
  canManage,
}: {
  request: RequestResponse;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <CardTitle as="h2">Informations</CardTitle>
        {canManage && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" />
            Modifier
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <EditRequestForm request={request} onDone={() => setEditing(false)} />
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant={REQUEST_STATUS_VARIANT[request.status]}>
                {REQUEST_STATUS_LABELS[request.status]}
              </Badge>
              {request.priority && (
                <Badge variant={PRIORITY_VARIANT[request.priority]}>
                  Priorité : {PRIORITY_LABELS[request.priority]}
                </Badge>
              )}
              {request.urgency && (
                <Badge variant={PRIORITY_VARIANT[request.urgency]}>
                  Urgence : {PRIORITY_LABELS[request.urgency]}
                </Badge>
              )}
            </div>

            {request.originalMessage && (
              <div>
                <p className="text-muted-foreground">Message</p>
                <p className="whitespace-pre-wrap font-medium">
                  {request.originalMessage}
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Client</p>
                {request.clientId ? (
                  <Link
                    href={`/clients/${request.clientId}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {request.clientCompanyName}
                  </Link>
                ) : (
                  <p className="font-medium">—</p>
                )}
              </div>
              <Field label="Contact" value={request.contactFullName} />
              <Field label="Assigné à" value={request.assignedUserName} />
              <Field label="Pays" value={request.country} />
              <Field label="Langue" value={request.language} />
              <Field label="Source" value={request.source} />
              <Field
                label="Service détecté"
                value={
                  request.detectedServiceName
                    ? [request.detectedServiceName, request.detectedSubservice]
                        .filter(Boolean)
                        .join(" — ")
                    : null
                }
              />
              <Field
                label="Reçue le"
                value={dateTimeFormatter.format(new Date(request.createdAt))}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
