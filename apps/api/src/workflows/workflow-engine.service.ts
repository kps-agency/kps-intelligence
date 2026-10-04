import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, type Job } from "bullmq";
import { EventType } from "@kps/types";
import type {
  Database,
  Json,
  WorkflowCondition,
  WorkflowStep,
  WorkflowStepLogEntry,
} from "@kps/types";
import { toDbException } from "../common/db-error";
import { redisConnection } from "../common/redis-connection";
import { ConversationsService } from "../conversations/conversations.service";
import { EventBus, type DomainEvent } from "../events/event-bus.service";
import { QualificationSessionsService } from "../qualification-sessions/qualification-sessions.service";
import { SupabaseService } from "../supabase/supabase.service";
import { evaluateConditions, type WorkflowContext } from "./evaluate-conditions";
import { WorkflowActionsService } from "./workflow-actions.service";

const logger = new Logger("WorkflowEngine");

const QUEUE_NAME = "workflow-steps";
type RunStatus = Database["public"]["Enums"]["workflow_run_status"];
type RunUpdate = Database["public"]["Tables"]["workflow_runs"]["Update"];

const ACTIVE_RUN_STATUSES: RunStatus[] = ["PENDING", "RUNNING", "WAITING"];
const TERMINAL_RUN_STATUSES: string[] = ["COMPLETED", "FAILED", "CANCELLED"];

interface WorkflowRow {
  id: string;
  name: string;
  trigger_event: string;
  conditions: WorkflowCondition[];
  actions: WorkflowStep[];
  cancel_on: string[];
  is_active: boolean;
}

interface RunRow {
  id: string;
  workflow_id: string;
  triggering_event_id: string | null;
  request_id: string | null;
  subject_type: string | null;
  subject_id: string | null;
  status: string;
  current_step: number;
  next_step_at: string | null;
  steps_log: WorkflowStepLogEntry[];
}

interface StepJobData {
  runId: string;
}

// Moteur de workflows (sections 45-46) : TRIGGER → CONDITIONS → étapes
// (délai → conditions → action). Les définitions vivent en base
// (`workflows`), chaque exécution est tracée (`workflow_runs`).
//
// Les étapes immédiates s'exécutent dans le handler de l'événement ; une
// étape différée devient un job BullMQ retardé (survit aux redémarrages,
// réarmé au démarrage). Les conditions d'une étape sont réévaluées au
// moment où elle s'exécute, sur l'état réel du moment — en plus de
// l'annulation explicite par les événements `cancel_on`.
@Injectable()
export class WorkflowEngine implements OnModuleInit, OnModuleDestroy {
  private queue!: Queue<StepJobData>;
  private worker!: Worker<StepJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly eventBus: EventBus,
    private readonly supabase: SupabaseService,
    private readonly actions: WorkflowActionsService,
    private readonly sessionsService: QualificationSessionsService,
    private readonly conversationsService: ConversationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const type of Object.values(EventType)) {
      this.eventBus.subscribe(type, (event) => this.onEvent(event));
    }

    const connection = redisConnection(this.config.getOrThrow<string>("REDIS_URL"));
    this.queue = new Queue<StepJobData>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
    this.worker = new Worker<StepJobData>(
      QUEUE_NAME,
      (job) => this.advance(job.data.runId, { final: isFinalAttempt(job) }),
      { connection, concurrency: 5 },
    );
    const logConnectionError = (err: Error) =>
      logger.error({ err: err.message }, "Erreur de connexion Redis (file des workflows)");
    this.queue.on("error", logConnectionError);
    this.worker.on("error", logConnectionError);

    await this.rearmWaitingRuns().catch((err: unknown) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "Réarmement des étapes de workflow en attente impossible",
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async onEvent(event: DomainEvent): Promise<void> {
    await this.cancelRunsFor(event);

    const { data: workflows, error } = await this.supabase
      .getClient()
      .from("workflows")
      .select("id, name, trigger_event, conditions, actions, cancel_on, is_active")
      .eq("trigger_event", event.type)
      .eq("is_active", true);
    if (error) throw toDbException(error);
    if (workflows.length === 0) return;

    const subject = this.subjectOf(event);
    const context = await this.buildContext(event.payload, event.requestId, subject.sessionId);

    for (const workflow of workflows as unknown as WorkflowRow[]) {
      if (!evaluateConditions(workflow.conditions, context)) continue;

      // Idempotence (section 63) : une exécution par workflow et par
      // événement — un événement rejoué ne relance rien.
      const { data: inserted, error: insertError } = await this.supabase
        .getClient()
        .from("workflow_runs")
        .upsert(
          {
            workflow_id: workflow.id,
            triggering_event_id: event.id,
            request_id: event.requestId,
            subject_type: event.entityType,
            subject_id: event.entityId,
            status: "PENDING",
            started_at: new Date().toISOString(),
          },
          { onConflict: "workflow_id,triggering_event_id", ignoreDuplicates: true },
        )
        .select("id");
      if (insertError) throw toDbException(insertError);
      const runId = inserted[0]?.id;
      if (!runId) continue;

      // Une seule exécution en cours par workflow et par objet : un lien
      // renvoyé remplace la chaîne de relances du précédent envoi.
      const { data: superseded, error: supersededError } = await this.supabase
        .getClient()
        .from("workflow_runs")
        .select("id, current_step")
        .eq("workflow_id", workflow.id)
        .eq("subject_id", event.entityId)
        .in("status", ACTIVE_RUN_STATUSES)
        .neq("id", runId);
      if (supersededError) throw toDbException(supersededError);
      await this.cancelRuns(superseded, "Remplacée par une exécution plus récente.");

      await this.advance(runId, { final: true });
    }
  }

  // Exécute les étapes de l'exécution jusqu'à la fin ou jusqu'à la
  // prochaine étape différée. `final` : dernière tentative (sinon une
  // erreur d'action est levée pour être retentée par BullMQ).
  async advance(runId: string, options: { final: boolean }): Promise<void> {
    for (;;) {
      const run = await this.loadRun(runId);
      if (!run || TERMINAL_RUN_STATUSES.includes(run.status)) return;
      const workflow = await this.loadWorkflow(run.workflow_id);
      const steps = workflow.actions;

      if (run.current_step >= steps.length) {
        await this.updateRun(runId, {
          status: "COMPLETED",
          completed_at: new Date().toISOString(),
          next_step_at: null,
        });
        return;
      }

      const step = steps[run.current_step]!;
      const now = Date.now();
      if (!run.next_step_at && step.delayMinutes > 0) {
        const dueAt = new Date(now + step.delayMinutes * 60_000).toISOString();
        await this.updateRun(runId, { status: "WAITING", next_step_at: dueAt });
        await this.schedule(runId, run.current_step, step.delayMinutes * 60_000);
        return;
      }
      if (run.next_step_at && new Date(run.next_step_at).getTime() > now) {
        await this.schedule(runId, run.current_step, new Date(run.next_step_at).getTime() - now);
        return;
      }

      await this.updateRun(runId, { status: "RUNNING" });
      const entry = await this.executeStep(run, step, options);
      if (!entry) return; // erreur levée pour retentative
      const log = [...run.steps_log, entry];

      if (entry.status === "FAILED") {
        await this.updateRun(runId, {
          status: "FAILED",
          steps_log: log as unknown as Json,
          error: entry.detail,
          completed_at: new Date().toISOString(),
        });
        return;
      }
      await this.updateRun(runId, {
        current_step: run.current_step + 1,
        next_step_at: null,
        steps_log: log as unknown as Json,
      });
    }
  }

  private async executeStep(
    run: RunRow,
    step: WorkflowStep,
    options: { final: boolean },
  ): Promise<WorkflowStepLogEntry | null> {
    const at = new Date().toISOString();
    const index = run.current_step;
    try {
      const payload = await this.triggeringPayload(run.triggering_event_id);
      const sessionId =
        run.subject_type === "qualification_session"
          ? run.subject_id
          : typeof payload.sessionId === "string"
            ? payload.sessionId
            : null;
      const context = await this.buildContext(payload, run.request_id, sessionId);
      if (!evaluateConditions(step.conditions, context)) {
        return { index, status: "SKIPPED", at, detail: "Conditions non remplies." };
      }
      const result = await this.actions.execute(step.action.type, step.action.params, {
        requestId: run.request_id,
        subjectType: run.subject_type,
        subjectId: run.subject_id,
        sessionId,
        payload,
      });
      return { index, status: result.status, at, detail: result.detail };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ runId: run.id, step: index, err: message }, "Échec d'une étape de workflow");
      if (!options.final) throw err;
      return { index, status: "FAILED", at, detail: message.slice(0, 500) };
    }
  }

  private async cancelRunsFor(event: DomainEvent): Promise<void> {
    const { data, error } = await this.supabase
      .getClient()
      .from("workflow_runs")
      .select("id, current_step, workflows!inner(cancel_on)")
      .eq("subject_id", event.entityId)
      .in("status", ACTIVE_RUN_STATUSES)
      .contains("workflows.cancel_on", [event.type]);
    if (error) throw toDbException(error);
    await this.cancelRuns(data, `Annulée : ${event.type}.`);
  }

  private async cancelRuns(
    runs: { id: string; current_step: number }[],
    reason: string,
  ): Promise<void> {
    for (const run of runs) {
      await this.updateRun(run.id, {
        status: "CANCELLED",
        error: reason,
        next_step_at: null,
        completed_at: new Date().toISOString(),
      });
      await this.queue?.remove(jobId(run.id, run.current_step)).catch(() => undefined);
    }
  }

  private async schedule(runId: string, step: number, delayMs: number): Promise<void> {
    await this.queue.add("step", { runId }, { jobId: jobId(runId, step), delay: Math.max(0, delayMs) });
  }

  // Étapes différées en attente : leur job est reprogrammé (sans doublon,
  // jobId déterministe) au démarrage.
  private async rearmWaitingRuns(): Promise<void> {
    const { data, error } = await this.supabase
      .getClient()
      .from("workflow_runs")
      .select("id, current_step, next_step_at")
      .eq("status", "WAITING");
    if (error) throw toDbException(error);
    for (const run of data) {
      const due = run.next_step_at ? new Date(run.next_step_at).getTime() - Date.now() : 0;
      await this.schedule(run.id, run.current_step, due);
    }
  }

  private subjectOf(event: DomainEvent): { sessionId: string | null } {
    if (event.entityType === "qualification_session") return { sessionId: event.entityId };
    const sessionId = event.payload.sessionId;
    return { sessionId: typeof sessionId === "string" ? sessionId : null };
  }

  // Les seuls champs utilisables dans une condition (CONDITION_FIELDS).
  private async buildContext(
    payload: Record<string, unknown>,
    requestId: string | null,
    sessionId: string | null,
  ): Promise<WorkflowContext> {
    const context: WorkflowContext = {
      "event.payload.confidence": asScalar(payload.confidence),
      "event.payload.serviceSlug": asScalar(payload.serviceSlug),
      "event.payload.channel": asScalar(payload.channel),
    };

    if (requestId) {
      const { data: request, error } = await this.supabase
        .getClient()
        .from("requests")
        .select("source, status, ai_confidence, assigned_user_id, services(slug)")
        .eq("id", requestId)
        .maybeSingle();
      if (error) throw toDbException(error);
      if (request) {
        context["request.source"] = request.source;
        context["request.status"] = request.status;
        context["request.aiConfidence"] = request.ai_confidence;
        context["request.detectedServiceSlug"] =
          (request.services as { slug: string } | null)?.slug ?? null;
        context["request.isAssigned"] = request.assigned_user_id !== null;
        context["request.hasReplyChannel"] =
          (await this.conversationsService.findReplyTarget(requestId)) !== null;
      }
    }

    if (sessionId) {
      context["session.status"] = await this.sessionsService
        .effectiveStatus(sessionId)
        .catch(() => null);
    }
    return context;
  }

  private async triggeringPayload(eventId: string | null): Promise<Record<string, unknown>> {
    if (!eventId) return {};
    const { data, error } = await this.supabase
      .getClient()
      .from("events")
      .select("payload")
      .eq("id", eventId)
      .maybeSingle();
    if (error) throw toDbException(error);
    return (data?.payload ?? {}) as Record<string, unknown>;
  }

  private async loadRun(runId: string): Promise<RunRow | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("workflow_runs")
      .select(
        "id, workflow_id, triggering_event_id, request_id, subject_type, subject_id, status, current_step, next_step_at, steps_log",
      )
      .eq("id", runId)
      .maybeSingle();
    if (error) throw toDbException(error);
    return data as unknown as RunRow | null;
  }

  private async loadWorkflow(id: string): Promise<WorkflowRow> {
    const { data, error } = await this.supabase
      .getClient()
      .from("workflows")
      .select("id, name, trigger_event, conditions, actions, cancel_on, is_active")
      .eq("id", id)
      .single();
    if (error) throw toDbException(error);
    return data as unknown as WorkflowRow;
  }

  private async updateRun(runId: string, fields: RunUpdate): Promise<void> {
    const { error } = await this.supabase.getClient().from("workflow_runs").update(fields).eq("id", runId);
    if (error) throw toDbException(error);
  }
}

function jobId(runId: string, step: number): string {
  return `wf-${runId}-${step}`;
}

function isFinalAttempt(job: Job<StepJobData>): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

function asScalar(value: unknown): string | number | boolean | null {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : null;
}
