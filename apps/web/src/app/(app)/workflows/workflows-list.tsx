"use client";

import { Badge, Card, CardContent, Skeleton } from "@kps/ui";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useWorkflows, useWorkflowVocabulary } from "@/lib/queries/workflows";
import { EVENT_LABELS, formatDelay } from "@/lib/workflow-display";

export function WorkflowsList() {
  const workflows = useWorkflows();
  const vocabulary = useWorkflowVocabulary();
  const actionLabel = (type: string) =>
    vocabulary.data?.actions.find((a) => a.type === type)?.label ?? type;

  if (workflows.isPending) {
    return (
      <div role="status" aria-label="Chargement des workflows" className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (workflows.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Impossible de charger les workflows.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {workflows.data.map((workflow) => (
        <li key={workflow.id}>
          <Card>
            <CardContent className="pt-6">
              <Link
                href={`/workflows/${workflow.id}`}
                className="group flex items-start justify-between gap-4 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold group-hover:underline">{workflow.name}</h2>
                    <Badge variant={workflow.isActive ? "success" : "outline"}>
                      {workflow.isActive ? "Actif" : "Désactivé"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Quand : {EVENT_LABELS[workflow.triggerEvent] ?? workflow.triggerEvent}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {workflow.steps
                      .map((s) => `${formatDelay(s.delayMinutes)} → ${actionLabel(s.action.type)}`)
                      .join(" · ")}
                  </p>
                </div>
                <ChevronRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
