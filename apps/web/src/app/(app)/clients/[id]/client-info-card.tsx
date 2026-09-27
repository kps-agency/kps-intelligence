"use client";

import { CLIENT_STATUS_LABELS } from "@kps/shared";
import type { ClientResponse } from "@kps/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@kps/ui";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { CLIENT_STATUS_VARIANT } from "@/lib/client-status-display";
import { EditClientForm } from "./edit-client-form";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="break-words font-medium">{value ?? "—"}</p>
    </div>
  );
}

export function ClientInfoCard({
  client,
  canManage,
}: {
  client: ClientResponse;
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
          <EditClientForm client={client} onDone={() => setEditing(false)} />
        ) : (
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Statut</p>
              <Badge variant={CLIENT_STATUS_VARIANT[client.status]} className="mt-0.5">
                {CLIENT_STATUS_LABELS[client.status]}
              </Badge>
            </div>
            <Field label="Pays" value={client.country} />
            <Field label="Ville" value={client.city} />
            <Field label="Secteur" value={client.industry} />
            <Field label="Email" value={client.email} />
            <Field label="Téléphone" value={client.phone} />
            <Field label="Site web" value={client.website} />
            {client.notes && (
              <div className="sm:col-span-2">
                <p className="text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap font-medium">{client.notes}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
