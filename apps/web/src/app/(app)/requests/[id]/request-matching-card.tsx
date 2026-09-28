"use client";

import type { MatchingCandidateResponse } from "@kps/types";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@kps/ui";
import { Minus, Plus, RefreshCw, UserCheck, UserMinus } from "lucide-react";
import Link from "next/link";
import { useCurrentUser } from "@/components/current-user-context";
import { ApiError } from "@/lib/api-client";
import {
  useAssignTeamMember,
  useRequestMatching,
  useRunMatching,
  useUnassignTeamMember,
} from "@/lib/queries/matching";

const dateTimeFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium", timeStyle: "short" });

function Candidate({
  candidate,
  canAssign,
  onAssign,
  pending,
}: {
  candidate: MatchingCandidateResponse;
  canAssign: boolean;
  onAssign: () => void;
  pending: boolean;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">#{candidate.rank}</span>
          <Link
            href={`/team/${candidate.userId}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {candidate.fullName}
          </Link>
          <Badge variant={candidate.score >= 75 ? "success" : candidate.score >= 50 ? "secondary" : "outline"}>
            {candidate.score} %
          </Badge>
          {candidate.assigned && <Badge variant="success">Affecté</Badge>}
        </div>
        <div
          className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`Score ${candidate.score} sur 100`}
        >
          <div className="h-full bg-primary" style={{ width: `${candidate.score}%` }} />
        </div>
        <ul className="flex flex-col gap-0.5 text-xs">
          {candidate.explanation.positives.map((p) => (
            <li key={`+${p}`} className="flex items-center gap-1 text-success">
              <Plus aria-hidden="true" className="size-3 shrink-0" />
              <span>
                <span className="sr-only">Atout : </span>
                {p}
              </span>
            </li>
          ))}
          {candidate.explanation.negatives.map((n) => (
            <li key={`-${n}`} className="flex items-center gap-1 text-muted-foreground">
              <Minus aria-hidden="true" className="size-3 shrink-0" />
              <span>
                <span className="sr-only">Point faible : </span>
                {n}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {canAssign && !candidate.assigned && (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onAssign} className="shrink-0">
          <UserCheck aria-hidden="true" />
          Affecter
        </Button>
      )}
    </li>
  );
}

// Matching équipe (sections 47-48) : une recommandation. L'affectation
// reste une décision de l'équipe (section 6).
export function RequestMatchingCard({ requestId }: { requestId: string }) {
  const { permissions } = useCurrentUser();
  const canMatch = permissions.includes("matching.manage");
  const matching = useRequestMatching(requestId);
  const run = useRunMatching(requestId);
  const assign = useAssignTeamMember(requestId);
  const unassign = useUnassignTeamMember(requestId);
  const error = [run.error, assign.error, unassign.error].find((e) => e instanceof ApiError) as ApiError | undefined;

  if (matching.isPending) return <Skeleton className="h-24 w-full" />;
  if (matching.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Impossible de charger le matching.
      </p>
    );
  }
  const data = matching.data;
  if (!data.ranAt && data.teamMembers.length === 0 && !canMatch) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle as="h2">Matching équipe</CardTitle>
          <p className="text-sm text-muted-foreground">
            Recommandation — l&apos;affectation reste une décision de l&apos;équipe.
          </p>
        </div>
        {canMatch && (
          <Button variant="outline" size="sm" onClick={() => run.mutate()} disabled={run.isPending} className="shrink-0">
            <RefreshCw aria-hidden="true" className={run.isPending ? "animate-spin" : undefined} />
            {run.isPending ? "Calcul..." : data.ranAt ? "Relancer le matching" : "Lancer le matching"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">
            {error.message}
          </p>
        )}

        {data.teamMembers.length > 0 && (
          <section aria-labelledby="team-assigned">
            <h3 id="team-assigned" className="mb-1 font-semibold">
              Équipe affectée
            </h3>
            <ul className="flex flex-col gap-1">
              {data.teamMembers.map((member) => (
                <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <Link href={`/team/${member.userId}`} className="font-medium text-primary underline-offset-4 hover:underline">
                      {member.fullName}
                    </Link>
                    <span className="text-muted-foreground">
                      {" "}
                      — {dateTimeFormatter.format(new Date(member.assignedAt))}
                      {member.assignedByName ? ` par ${member.assignedByName}` : ""}
                    </span>
                  </span>
                  {canMatch && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={unassign.isPending}
                      onClick={() => unassign.mutate(member.userId)}
                    >
                      <UserMinus aria-hidden="true" />
                      Retirer <span className="sr-only">{member.fullName}</span>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!data.ranAt ? (
          <p className="text-muted-foreground">
            Aucun matching pour l&apos;instant : il se lance automatiquement quand la demande est qualifiée.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground">
              Calculé le {dateTimeFormatter.format(new Date(data.ranAt))}
              {data.requiredSkills.length > 0 && ` — compétences recherchées : ${data.requiredSkills.join(", ")}`}
            </p>
            {data.candidates.length === 0 ? (
              <p className="text-muted-foreground">
                Aucun collaborateur n&apos;a encore renseigné de compétences (page Équipe).
              </p>
            ) : (
              <ol className="flex flex-col gap-2">
                {data.candidates.map((candidate) => (
                  <Candidate
                    key={candidate.userId}
                    candidate={candidate}
                    canAssign={canMatch}
                    pending={assign.isPending}
                    onAssign={() => assign.mutate(candidate.userId)}
                  />
                ))}
              </ol>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
