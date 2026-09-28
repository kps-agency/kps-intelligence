"use client";

import type {
  WorkflowCondition,
  WorkflowResponse,
  WorkflowStep,
  WorkflowVocabularyResponse,
} from "@kps/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kps/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api-client";
import {
  useUpdateWorkflow,
  useWorkflow,
  useWorkflowRuns,
  useWorkflowVocabulary,
} from "@/lib/queries/workflows";
import {
  EVENT_LABELS,
  OPERATOR_LABELS,
  RUN_STATUS,
  formatDelay,
  formatValue,
} from "@/lib/workflow-display";

const dateTimeFormatter = new Intl.DateTimeFormat("fr-CH", {
  dateStyle: "medium",
  timeStyle: "short",
});

type Draft = Pick<WorkflowResponse, "isActive" | "conditions" | "steps">;

const UNITS = [
  { value: 1, label: "minutes" },
  { value: 60, label: "heures" },
  { value: 1440, label: "jours" },
];

function bestUnit(minutes: number): number {
  if (minutes > 0 && minutes % 1440 === 0) return 1440;
  if (minutes > 0 && minutes % 60 === 0) return 60;
  return 1;
}

function ConditionValueInput({
  id,
  condition,
  type,
  onChange,
}: {
  id: string;
  condition: WorkflowCondition;
  type: "string" | "number" | "boolean";
  onChange: (value: WorkflowCondition["value"]) => void;
}) {
  if (condition.operator === "exists" || condition.operator === "notExists") return null;
  if (type === "boolean") {
    return (
      <Select id={id} value={String(condition.value)} onChange={(e) => onChange(e.target.value === "true")}>
        <option value="true">oui</option>
        <option value="false">non</option>
      </Select>
    );
  }
  if (condition.operator === "in" || condition.operator === "notIn") {
    const list = Array.isArray(condition.value) ? condition.value.join(", ") : "";
    return (
      <Input
        id={id}
        value={list}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean)
              .map((v) => (type === "number" ? Number(v) : v)),
          )
        }
      />
    );
  }
  return (
    <Input
      id={id}
      type={type === "number" ? "number" : "text"}
      step={type === "number" ? "0.01" : undefined}
      value={condition.value === undefined ? "" : String(condition.value)}
      onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
    />
  );
}

function Conditions({
  conditions,
  vocabulary,
  editable,
  idPrefix,
  onChange,
}: {
  conditions: WorkflowCondition[];
  vocabulary: WorkflowVocabularyResponse;
  editable: boolean;
  idPrefix: string;
  onChange: (conditions: WorkflowCondition[]) => void;
}) {
  if (conditions.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune condition.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {conditions.map((condition, index) => {
        const field = vocabulary.fields.find((f) => f.key === condition.field);
        const label = `${field?.label ?? condition.field} ${OPERATOR_LABELS[condition.operator]}`;
        const inputId = `${idPrefix}-condition-${index}`;
        if (!editable || condition.operator === "exists" || condition.operator === "notExists") {
          return (
            <li key={index} className="text-sm">
              {label} <span className="font-medium">{formatValue(condition.value)}</span>
            </li>
          );
        }
        return (
          <li key={index} className="grid gap-1.5 sm:grid-cols-[1fr_12rem] sm:items-center">
            <Label htmlFor={inputId}>{label}</Label>
            <ConditionValueInput
              id={inputId}
              condition={condition}
              type={field?.type ?? "string"}
              onChange={(value) =>
                onChange(conditions.map((c, i) => (i === index ? { ...c, value } : c)))
              }
            />
          </li>
        );
      })}
    </ul>
  );
}

function StepCard({
  step,
  index,
  vocabulary,
  editable,
  onChange,
}: {
  step: WorkflowStep;
  index: number;
  vocabulary: WorkflowVocabularyResponse;
  editable: boolean;
  onChange: (step: WorkflowStep) => void;
}) {
  const action = vocabulary.actions.find((a) => a.type === step.action.type);
  const channel = step.action.params.channel;
  const [unit, setUnit] = useState(() => bestUnit(step.delayMinutes));

  return (
    <li className="flex flex-col gap-3 rounded-md border p-4">
      <p className="text-sm font-semibold">
        Étape {index + 1} — {action?.label ?? step.action.type}
        {typeof channel === "string" ? ` (${formatValue(channel)})` : ""}
      </p>
      {editable ? (
        <div className="grid gap-1.5">
          <Label htmlFor={`step-${index}-delay`}>Délai avant cette étape</Label>
          <div className="flex gap-2">
            <Input
              id={`step-${index}-delay`}
              type="number"
              min={0}
              step="any"
              className="w-32"
              value={step.delayMinutes / unit}
              onChange={(e) => onChange({ ...step, delayMinutes: Number(e.target.value) * unit })}
            />
            <Select
              aria-label={`Unité du délai de l'étape ${index + 1}`}
              className="w-32"
              value={unit}
              onChange={(e) => setUnit(Number(e.target.value))}
            >
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{formatDelay(step.delayMinutes)}</p>
      )}
      <div>
        <p className="mb-1 text-sm text-muted-foreground">Si, au moment de l&apos;étape :</p>
        <Conditions
          conditions={step.conditions}
          vocabulary={vocabulary}
          editable={editable}
          idPrefix={`step-${index}`}
          onChange={(conditions) => onChange({ ...step, conditions })}
        />
      </div>
    </li>
  );
}

function RunsCard({ workflowId, stepCount }: { workflowId: string; stepCount: number }) {
  const runs = useWorkflowRuns(workflowId);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Exécutions récentes</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.isPending && <Skeleton className="h-16 w-full" />}
        {runs.isError && (
          <p role="alert" className="text-sm text-destructive">
            Impossible de charger les exécutions.
          </p>
        )}
        {runs.data && runs.data.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune exécution pour l&apos;instant.</p>
        )}
        {runs.data && runs.data.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Déclenchée le</TableHead>
                  <TableHead>Demande</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Étapes</TableHead>
                  <TableHead>Détail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.data.map((run) => {
                  const status = RUN_STATUS[run.status];
                  const last = run.stepsLog[run.stepsLog.length - 1];
                  return (
                    <TableRow key={run.id}>
                      <TableCell className="whitespace-nowrap">
                        {dateTimeFormatter.format(new Date(run.createdAt))}
                      </TableCell>
                      <TableCell>
                        {run.requestId ? (
                          <Link
                            href={`/requests/${run.requestId}`}
                            className="font-mono text-primary underline-offset-4 hover:underline"
                          >
                            {run.requestReference}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {run.stepsLog.length}/{stepCount}
                        {run.status === "WAITING" && run.nextStepAt && (
                          <span className="block text-xs text-muted-foreground">
                            prochaine : {dateTimeFormatter.format(new Date(run.nextStepAt))}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {run.error ?? last?.detail ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WorkflowDetail({ workflowId, canManage }: { workflowId: string; canManage: boolean }) {
  const workflow = useWorkflow(workflowId);
  const vocabulary = useWorkflowVocabulary();
  const update = useUpdateWorkflow(workflowId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (workflow.data) {
      setDraft({
        isActive: workflow.data.isActive,
        conditions: workflow.data.conditions,
        steps: workflow.data.steps,
      });
    }
  }, [workflow.data]);

  const dirty = useMemo(
    () =>
      !!workflow.data &&
      !!draft &&
      JSON.stringify(draft) !==
        JSON.stringify({
          isActive: workflow.data.isActive,
          conditions: workflow.data.conditions,
          steps: workflow.data.steps,
        }),
    [draft, workflow.data],
  );

  if (workflow.isPending || vocabulary.isPending || !draft) {
    return (
      <div role="status" aria-label="Chargement du workflow" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (workflow.isError || vocabulary.isError) {
    const notFound = workflow.error instanceof ApiError && workflow.error.statusCode === 404;
    return (
      <p role="alert" className="text-sm text-destructive">
        {notFound ? "Ce workflow n'existe pas." : "Impossible de charger le workflow."}
      </p>
    );
  }

  const data = workflow.data;
  const errorMessages =
    update.error instanceof ApiError
      ? update.error.details.length > 0
        ? update.error.details
        : [update.error.message]
      : [];

  function save() {
    if (!draft) return;
    setSaved(false);
    update.mutate(
      {
        name: data.name,
        description: data.description,
        isActive: draft.isActive,
        conditions: draft.conditions,
        steps: draft.steps,
        cancelOn: data.cancelOn,
      },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/workflows" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Workflows
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
          <Badge variant={data.isActive ? "success" : "outline"}>
            {data.isActive ? "Actif" : "Désactivé"}
          </Badge>
        </div>
        {data.description && <p className="text-muted-foreground">{data.description}</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Définition</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {canManage && (
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
              />
              Workflow actif
            </label>
          )}

          <section aria-labelledby="wf-trigger">
            <h3 id="wf-trigger" className="mb-1 text-sm font-semibold">
              Quand
            </h3>
            <p className="text-sm">{EVENT_LABELS[data.triggerEvent] ?? data.triggerEvent}</p>
          </section>

          <section aria-labelledby="wf-conditions">
            <h3 id="wf-conditions" className="mb-1 text-sm font-semibold">
              Si
            </h3>
            <Conditions
              conditions={draft.conditions}
              vocabulary={vocabulary.data}
              editable={canManage}
              idPrefix="trigger"
              onChange={(conditions) => setDraft({ ...draft, conditions })}
            />
          </section>

          <section aria-labelledby="wf-steps">
            <h3 id="wf-steps" className="mb-2 text-sm font-semibold">
              Alors
            </h3>
            <ol className="flex flex-col gap-3">
              {draft.steps.map((step, index) => (
                <StepCard
                  key={index}
                  step={step}
                  index={index}
                  vocabulary={vocabulary.data}
                  editable={canManage}
                  onChange={(next) =>
                    setDraft({ ...draft, steps: draft.steps.map((s, i) => (i === index ? next : s)) })
                  }
                />
              ))}
            </ol>
          </section>

          {data.cancelOn.length > 0 && (
            <section aria-labelledby="wf-cancel">
              <h3 id="wf-cancel" className="mb-1 text-sm font-semibold">
                Annulé dès que
              </h3>
              <p className="text-sm">
                {data.cancelOn.map((type) => EVENT_LABELS[type] ?? type).join(" · ")}
              </p>
            </section>
          )}

          {errorMessages.length > 0 && (
            <ul role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          {saved && !dirty && (
            <p role="status" className="text-sm text-success">
              Modifications enregistrées.
            </p>
          )}

          {canManage && (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!dirty || update.isPending}
                onClick={() =>
                  setDraft({ isActive: data.isActive, conditions: data.conditions, steps: data.steps })
                }
              >
                Annuler
              </Button>
              <Button type="button" disabled={!dirty || update.isPending} onClick={save}>
                {update.isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <RunsCard workflowId={workflowId} stepCount={data.steps.length} />
    </div>
  );
}
