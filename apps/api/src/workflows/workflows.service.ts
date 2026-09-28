import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  EventType,
  Json,
  WorkflowCondition,
  WorkflowResponse,
  WorkflowRunResponse,
  WorkflowRunStatus,
  WorkflowStep,
  WorkflowStepLogEntry,
} from "@kps/types";
import { toDbException } from "../common/db-error";
import { SupabaseService } from "../supabase/supabase.service";
import type { UpdateWorkflowDto } from "./dto/update-workflow.dto";
import { validateWorkflowDefinition } from "./workflow-definition";

const WORKFLOW_SELECT =
  "id, key, name, description, trigger_event, conditions, actions, cancel_on, is_active, updated_at";

interface WorkflowRow {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  trigger_event: string;
  conditions: unknown;
  actions: unknown;
  cancel_on: string[];
  is_active: boolean;
  updated_at: string;
}

function toResponse(row: WorkflowRow): WorkflowResponse {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    triggerEvent: row.trigger_event as EventType,
    conditions: row.conditions as WorkflowCondition[],
    steps: row.actions as WorkflowStep[],
    cancelOn: row.cancel_on as EventType[],
    isActive: row.is_active,
    updatedAt: row.updated_at,
  };
}

const RUNS_LIMIT = 50;

@Injectable()
export class WorkflowsService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(): Promise<WorkflowResponse[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from("workflows")
      .select(WORKFLOW_SELECT)
      .order("name", { ascending: true });
    if (error) throw toDbException(error);
    return (data as WorkflowRow[]).map(toResponse);
  }

  async findById(id: string): Promise<WorkflowResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from("workflows")
      .select(WORKFLOW_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Workflow introuvable.");
    return toResponse(data as WorkflowRow);
  }

  async runs(id: string): Promise<WorkflowRunResponse[]> {
    await this.findById(id);
    const { data, error } = await this.supabase
      .getClient()
      .from("workflow_runs")
      .select(
        "id, workflow_id, request_id, status, current_step, next_step_at, steps_log, error, created_at, completed_at, requests(reference)",
      )
      .eq("workflow_id", id)
      .order("created_at", { ascending: false })
      .limit(RUNS_LIMIT);
    if (error) throw toDbException(error);

    return data.map((run) => ({
      id: run.id,
      workflowId: run.workflow_id,
      requestId: run.request_id,
      requestReference: (run.requests as { reference: string } | null)?.reference ?? null,
      status: run.status as WorkflowRunStatus,
      currentStep: run.current_step,
      nextStepAt: run.next_step_at,
      stepsLog: run.steps_log as unknown as WorkflowStepLogEntry[],
      error: run.error,
      createdAt: run.created_at,
      completedAt: run.completed_at,
    }));
  }

  // Le déclencheur n'est pas modifiable : il fait l'identité du workflow.
  // Tout le reste est revalidé contre le vocabulaire autorisé.
  async update(id: string, dto: UpdateWorkflowDto, userId: string): Promise<WorkflowResponse> {
    await this.findById(id);
    const errors = validateWorkflowDefinition({
      conditions: dto.conditions,
      steps: dto.steps,
      cancelOn: dto.cancelOn,
    });
    if (errors.length > 0) throw new BadRequestException(errors);

    const { data, error } = await this.supabase
      .getClient()
      .from("workflows")
      .update({
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        is_active: dto.isActive,
        conditions: dto.conditions as unknown as Json,
        actions: dto.steps as unknown as Json,
        cancel_on: dto.cancelOn as EventType[],
        updated_by: userId,
      })
      .eq("id", id)
      .select(WORKFLOW_SELECT)
      .single();
    if (error) throw toDbException(error);
    return toResponse(data as WorkflowRow);
  }
}
