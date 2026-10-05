"use client";

import { OpportunityStatus, type OpportunityResponse } from "@kps/types";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@kps/ui";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MissionsCard } from "@/components/missions-card";
import { QuotesCard } from "@/components/quotes-card";
import { TimelineCard } from "@/components/timeline-card";
import { ApiError } from "@/lib/api-client";
import {
  OPPORTUNITY_PIPELINE,
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_STATUS_VARIANT,
  formatMoney,
  opportunityParty,
} from "@/lib/opportunity-display";
import {
  useChangeOpportunityStage,
  useOpportunity,
  useOpportunityTimeline,
} from "@/lib/queries/opportunities";
import { LostReasonDialog } from "../lost-reason-dialog";
import { EditOpportunityForm } from "./edit-opportunity-form";

const dateFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium" });
const dateTimeFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium", timeStyle: "short" });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <div className="break-words font-medium">{children}</div>
    </div>
  );
}

function StageCard({ opportunity, canManage }: { opportunity: OpportunityResponse; canManage: boolean }) {
  const changeStage = useChangeOpportunityStage();
  const [confirmLost, setConfirmLost] = useState(false);
  const error = changeStage.error instanceof ApiError ? changeStage.error : null;

  function select(status: OpportunityStatus) {
    if (status === opportunity.status) return;
    if (status === OpportunityStatus.LOST) setConfirmLost(true);
    else changeStage.mutate({ id: opportunity.id, status });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Étape</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div role="group" aria-label="Étape de l'opportunité" className="flex flex-wrap gap-2">
          {OPPORTUNITY_PIPELINE.map((status) => {
            const current = status === opportunity.status;
            return (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={current ? "default" : "outline"}
                aria-pressed={current}
                disabled={!canManage || changeStage.isPending}
                onClick={() => select(status)}
              >
                {OPPORTUNITY_STATUS_LABELS[status]}
              </Button>
            );
          })}
        </div>
        {opportunity.closedAt && (
          <p className="text-muted-foreground">
            {opportunity.status === OpportunityStatus.WON ? "Gagnée" : "Perdue"} le{" "}
            {dateTimeFormatter.format(new Date(opportunity.closedAt))}
            {opportunity.lostReason && ` — motif : ${opportunity.lostReason}`}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">
            {error.message}
          </p>
        )}
      </CardContent>
      <LostReasonDialog
        title={confirmLost ? opportunity.title : null}
        onCancel={() => setConfirmLost(false)}
        onConfirm={(lostReason) => {
          setConfirmLost(false);
          changeStage.mutate({ id: opportunity.id, status: OpportunityStatus.LOST, lostReason });
        }}
      />
    </Card>
  );
}

function InfoCard({ opportunity, canManage }: { opportunity: OpportunityResponse; canManage: boolean }) {
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
          <EditOpportunityForm opportunity={opportunity} onDone={() => setEditing(false)} />
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Client">
                {opportunity.clientId ? (
                  <Link
                    href={`/clients/${opportunity.clientId}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {opportunity.clientCompanyName}
                  </Link>
                ) : (
                  opportunityParty(opportunity)
                )}
              </Field>
              <Field label="Demande d'origine">
                {opportunity.requestId ? (
                  <Link
                    href={`/requests/${opportunity.requestId}`}
                    className="font-mono text-primary underline-offset-4 hover:underline"
                  >
                    {opportunity.requestReference}
                  </Link>
                ) : (
                  "Saisie manuelle"
                )}
              </Field>
              <Field label="Service">{opportunity.serviceName ?? "—"}</Field>
              <Field label="Valeur estimée">
                {opportunity.estimatedValue === null
                  ? "À estimer"
                  : formatMoney(opportunity.estimatedValue, opportunity.currency)}
              </Field>
              <Field label="Probabilité de gain">
                {opportunity.probability === null ? "—" : `${opportunity.probability} %`}
              </Field>
              <Field label="Responsable">{opportunity.ownerName ?? "Personne"}</Field>
              <Field label="Clôture prévue">
                {opportunity.expectedCloseDate
                  ? dateFormatter.format(new Date(opportunity.expectedCloseDate))
                  : "—"}
              </Field>
              <Field label="Créée le">{dateTimeFormatter.format(new Date(opportunity.createdAt))}</Field>
            </div>
            {opportunity.description && (
              <div>
                <p className="text-muted-foreground">Description</p>
                <p className="whitespace-pre-wrap">{opportunity.description}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function OpportunityDetail({
  opportunityId,
  canManage,
}: {
  opportunityId: string;
  canManage: boolean;
}) {
  const opportunity = useOpportunity(opportunityId);
  const timeline = useOpportunityTimeline(opportunityId);

  if (opportunity.isPending) {
    return (
      <div role="status" aria-label="Chargement de l'opportunité" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (opportunity.isError) {
    const notFound = opportunity.error instanceof ApiError && opportunity.error.statusCode === 404;
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-2 pt-6 text-sm">
          <p role="alert" className="text-destructive">
            {notFound ? "Cette opportunité n'existe pas." : `Erreur : ${opportunity.error.message}`}
          </p>
          <Link href="/opportunities" className="text-primary underline-offset-4 hover:underline">
            Retour au pipeline
          </Link>
        </CardContent>
      </Card>
    );
  }

  const data = opportunity.data;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/opportunities"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Opportunités
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="break-words text-2xl font-semibold tracking-tight">{data.title}</h1>
          <Badge variant={OPPORTUNITY_STATUS_VARIANT[data.status]}>
            {OPPORTUNITY_STATUS_LABELS[data.status]}
          </Badge>
        </div>
        <p className="text-muted-foreground">{opportunityParty(data)}</p>
      </div>

      <StageCard opportunity={data} canManage={canManage} />
      <InfoCard opportunity={data} canManage={canManage} />
      <QuotesCard opportunityId={data.id} canCreate={data.clientId !== null} />
      <MissionsCard opportunityId={data.id} />
      <TimelineCard timeline={timeline} />
    </div>
  );
}
