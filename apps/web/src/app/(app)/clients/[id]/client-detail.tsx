"use client";

import { Card, CardContent, Skeleton } from "@kps/ui";
import Link from "next/link";
import { MissionsCard } from "@/components/missions-card";
import { OpportunitiesCard } from "@/components/opportunities-card";
import { QuotesCard } from "@/components/quotes-card";
import { ApiError } from "@/lib/api-client";
import { useClient } from "@/lib/queries/clients";
import { ClientInfoCard } from "./client-info-card";
import { ContactsPanel } from "./contacts-panel";

export function ClientDetail({
  clientId,
  canManageClients,
  canManageContacts,
}: {
  clientId: string;
  canManageClients: boolean;
  canManageContacts: boolean;
}) {
  const client = useClient(clientId);

  if (client.isPending) {
    return (
      <div role="status" aria-label="Chargement du client" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (client.isError) {
    const notFound = client.error instanceof ApiError && client.error.statusCode === 404;
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-2 pt-6 text-sm">
          <p role="alert" className="text-destructive">
            {notFound ? "Ce client n'existe pas." : `Erreur : ${client.error.message}`}
          </p>
          <Link href="/clients" className="text-primary underline-offset-4 hover:underline">
            Retour à la liste des clients
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/clients"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Clients
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {client.data.companyName}
        </h1>
      </div>

      <ClientInfoCard client={client.data} canManage={canManageClients} />
      <ContactsPanel clientId={clientId} canManage={canManageContacts} />
      <OpportunitiesCard clientId={clientId} />
      <QuotesCard clientId={clientId} />
      <MissionsCard clientId={clientId} />
    </div>
  );
}
