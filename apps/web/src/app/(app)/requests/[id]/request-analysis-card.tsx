"use client";

import { AI_LOW_CONFIDENCE_THRESHOLD, REQUEST_INTENT_LABELS } from "@kps/shared";
import type { AiAnalysisResponse } from "@kps/types";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@kps/ui";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { useAnalyzeRequest, useRequestAnalyses } from "@/lib/queries/requests";

const dateTimeFormatter = new Intl.DateTimeFormat("fr-CH", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)} %`;
}

function AnalysisDetails({ analysis }: { analysis: AiAnalysisResponse }) {
  if (analysis.status === "FAILED") {
    return (
      <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        {analysis.error ?? "L'analyse IA a échoué."}
      </p>
    );
  }

  const result = analysis.result;
  if (!result) return null;

  const lowConfidence =
    analysis.confidence !== null && analysis.confidence < AI_LOW_CONFIDENCE_THRESHOLD;

  return (
    <div className="flex flex-col gap-3 text-sm">
      {lowConfidence && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-md bg-warning/10 p-3 text-warning"
        >
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          Confiance faible — cette analyse nécessite une validation humaine.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{REQUEST_INTENT_LABELS[result.intent]}</Badge>
        {analysis.confidence !== null && (
          <Badge variant={lowConfidence ? "warning" : "outline"}>
            Confiance : {formatConfidence(analysis.confidence)}
          </Badge>
        )}
      </div>

      <p>{result.summary}</p>

      {result.missingInformation.length > 0 && (
        <div>
          <p className="text-muted-foreground">Informations manquantes</p>
          <ul className="list-inside list-disc">
            {result.missingInformation.map((info) => (
              <li key={info}>{info}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-muted-foreground">
        Action recommandée : <span className="font-medium text-foreground">{result.recommendedAction}</span>
      </p>
    </div>
  );
}

export function RequestAnalysisCard({
  requestId,
  canManage,
}: {
  requestId: string;
  canManage: boolean;
}) {
  const analyses = useRequestAnalyses(requestId);
  const analyze = useAnalyzeRequest(requestId);
  const serverError = analyze.error instanceof ApiError ? analyze.error : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <CardTitle as="h2">Analyse IA</CardTitle>
        {canManage && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => analyze.mutate()}
            disabled={analyze.isPending}
          >
            <RefreshCw aria-hidden="true" className={analyze.isPending ? "animate-spin" : undefined} />
            {analyze.isPending ? "Analyse en cours..." : "Relancer l'analyse"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {serverError && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {serverError.message}
          </p>
        )}

        {analyses.isPending && (
          <div role="status" aria-label="Chargement des analyses" className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}

        {analyses.isError && (
          <p role="alert" className="text-sm text-destructive">
            Impossible de charger les analyses.
          </p>
        )}

        {analyses.data && analyses.data.length === 0 && (
          <p className="text-sm text-muted-foreground">{"Aucune analyse pour l'instant."}</p>
        )}

        {analyses.data && analyses.data[0] && (
          <>
            <AnalysisDetails analysis={analyses.data[0]} />

            {analyses.data.length > 1 && (
              <div className="border-t pt-3 text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">Historique</p>
                <ul className="flex flex-col gap-1">
                  {analyses.data.slice(1).map((analysis) => (
                    <li key={analysis.id} className="flex items-center gap-2">
                      <span>{dateTimeFormatter.format(new Date(analysis.createdAt))}</span>
                      <Badge variant={analysis.status === "FAILED" ? "destructive" : "outline"}>
                        {analysis.status === "FAILED" ? "Échec" : "Terminée"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
