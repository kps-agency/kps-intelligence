"use client";

import { Card, CardContent, Skeleton } from "@kps/ui";
import Link from "next/link";
import { ApiError } from "@/lib/api-client";
import { useRequestDetail } from "@/lib/queries/requests";
import { RequestAnalysisCard } from "./request-analysis-card";
import { RequestInfoCard } from "./request-info-card";
import { RequestQualificationCard } from "./request-qualification-card";

export function RequestDetail({
  requestId,
  canManage,
}: {
  requestId: string;
  canManage: boolean;
}) {
  const req = useRequestDetail(requestId);

  if (req.isPending) {
    return (
      <div role="status" aria-label="Chargement de la demande" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (req.isError) {
    const notFound = req.error instanceof ApiError && req.error.statusCode === 404;
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-2 pt-6 text-sm">
          <p role="alert" className="text-destructive">
            {notFound ? "Cette demande n'existe pas." : `Erreur : ${req.error.message}`}
          </p>
          <Link href="/requests" className="text-primary underline-offset-4 hover:underline">
            Retour à la liste des demandes
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/requests"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Demandes
        </Link>
        <h1 className="font-mono text-2xl font-semibold tracking-tight">
          {req.data.reference}
        </h1>
        <p className="text-muted-foreground">{req.data.subject}</p>
      </div>

      <RequestInfoCard request={req.data} canManage={canManage} />
      <RequestAnalysisCard requestId={requestId} canManage={canManage} />
      {canManage && <RequestQualificationCard request={req.data} />}
    </div>
  );
}
