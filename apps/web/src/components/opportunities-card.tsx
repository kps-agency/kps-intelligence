"use client";

import type { OpportunityResponse } from "@kps/types";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@kps/ui";
import { Handshake } from "lucide-react";
import Link from "next/link";
import { useHasPermission } from "@/components/current-user-context";
import { ApiError } from "@/lib/api-client";
import {
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_STATUS_VARIANT,
  formatMoney,
} from "@/lib/opportunity-display";
import { useCreateOpportunity, useOpportunities } from "@/lib/queries/opportunities";

function OpportunityRow({ opportunity }: { opportunity: OpportunityResponse }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <Link
          href={`/opportunities/${opportunity.id}`}
          className="break-words font-medium text-primary underline-offset-4 hover:underline"
        >
          {opportunity.title}
        </Link>
        <Badge variant={OPPORTUNITY_STATUS_VARIANT[opportunity.status]}>
          {OPPORTUNITY_STATUS_LABELS[opportunity.status]}
        </Badge>
      </span>
      <span className="text-muted-foreground">
        {opportunity.estimatedValue === null
          ? "Valeur à estimer"
          : formatMoney(opportunity.estimatedValue, opportunity.currency)}
        {opportunity.ownerName && ` · ${opportunity.ownerName}`}
      </span>
    </li>
  );
}

// Opportunités liées à une demande (au plus une, créée automatiquement
// après le matching) ou à un client (section 49).
export function OpportunitiesCard({ requestId, clientId }: { requestId?: string; clientId?: string }) {
  const canRead = useHasPermission("opportunities.read");
  const canManage = useHasPermission("opportunities.manage");
  const opportunities = useOpportunities({ page: 1, limit: 50, requestId, clientId }, canRead);
  const create = useCreateOpportunity();

  if (!canRead) return null;
  const error = create.error instanceof ApiError ? create.error : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <CardTitle as="h2" className="flex items-center gap-2">
          <Handshake aria-hidden="true" className="size-4" />
          {requestId ? "Opportunité" : "Opportunités"}
        </CardTitle>
        {requestId && canManage && opportunities.data?.data.length === 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={create.isPending}
            onClick={() => create.mutate({ requestId })}
            className="shrink-0"
          >
            {create.isPending ? "Création..." : "Créer l'opportunité"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {opportunities.isPending && <Skeleton className="h-5 w-2/3" />}
        {opportunities.isError && (
          <p role="alert" className="text-destructive">
            Impossible de charger les opportunités.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">
            {error.message}
          </p>
        )}
        {opportunities.data &&
          (opportunities.data.data.length === 0 ? (
            <p className="text-muted-foreground">
              {requestId
                ? "Aucune opportunité pour l'instant : elle est créée automatiquement quand le matching d'une demande qualifiée est terminé."
                : "Aucune opportunité pour ce client."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {opportunities.data.data.map((opportunity) => (
                <OpportunityRow key={opportunity.id} opportunity={opportunity} />
              ))}
            </ul>
          ))}
      </CardContent>
    </Card>
  );
}
