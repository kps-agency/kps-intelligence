"use client";

import { AI_LOW_CONFIDENCE_THRESHOLD } from "@kps/shared";
import type { QualificationAnalysisResult } from "@kps/types";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, type BadgeProps } from "@kps/ui";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { useAnalyzeQualification } from "@/lib/queries/matching";
import { useRequestAnalyses } from "@/lib/queries/requests";

const VERDICT: Record<QualificationAnalysisResult["qualificationStatus"], { label: string; variant: BadgeProps["variant"] }> = {
  QUALIFIED: { label: "Qualifiée", variant: "success" },
  UNQUALIFIED: { label: "Non qualifiée", variant: "destructive" },
  NEEDS_REVIEW: { label: "À valider", variant: "warning" },
};

const COMPLEXITY: Record<string, string> = { LOW: "faible", MEDIUM: "moyenne", HIGH: "élevée" };

// Analyse des réponses du formulaire par Claude (section 40). N'apparaît
// qu'une fois qu'un formulaire a été complété et analysé.
export function RequestQualificationAnalysisCard({
  requestId,
  canManage,
}: {
  requestId: string;
  canManage: boolean;
}) {
  const analyses = useRequestAnalyses(requestId);
  const reanalyze = useAnalyzeQualification(requestId);
  const latest = analyses.data?.find((a) => a.kind === "QUALIFICATION_ANALYSIS");
  if (!latest) return null;

  const result = latest.result as QualificationAnalysisResult | null;
  const lowConfidence = latest.confidence !== null && latest.confidence < AI_LOW_CONFIDENCE_THRESHOLD;
  const verdict = result ? VERDICT[result.qualificationStatus] : null;
  const serverError = reanalyze.error instanceof ApiError ? reanalyze.error : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <CardTitle as="h2">Analyse des réponses</CardTitle>
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => reanalyze.mutate()} disabled={reanalyze.isPending}>
            <RefreshCw aria-hidden="true" className={reanalyze.isPending ? "animate-spin" : undefined} />
            {reanalyze.isPending ? "Analyse en cours..." : "Relancer l'analyse"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {serverError && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">
            {serverError.message}
          </p>
        )}
        {latest.status === "FAILED" && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">
            {latest.error ?? "L'analyse des réponses a échoué."}
          </p>
        )}
        {result && verdict && (
          <>
            {(lowConfidence || result.qualificationStatus === "NEEDS_REVIEW") && (
              <p role="alert" className="flex items-center gap-2 rounded-md bg-warning/10 p-3 text-warning">
                <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
                Validation humaine requise : qualifiez ou non la demande depuis « Modifier ».
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={verdict.variant}>{verdict.label}</Badge>
              {latest.confidence !== null && (
                <Badge variant={lowConfidence ? "warning" : "outline"}>
                  Confiance : {Math.round(latest.confidence * 100)} %
                </Badge>
              )}
              {result.complexity && <Badge variant="outline">Complexité {COMPLEXITY[result.complexity]}</Badge>}
            </div>
            <p>{result.summary}</p>
            {result.requiredSkills.length > 0 && (
              <div>
                <p className="mb-1 text-muted-foreground">Compétences nécessaires</p>
                <ul className="flex flex-wrap gap-1.5">
                  {result.requiredSkills.map((skill) => (
                    <li key={skill}>
                      <Badge variant="secondary">{skill}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
              Étape suivante recommandée : <span className="font-medium text-foreground">{result.recommendedNextStep}</span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
