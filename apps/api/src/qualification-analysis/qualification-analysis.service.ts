import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AI_LOW_CONFIDENCE_THRESHOLD } from "@kps/shared";
import { EventEntityType, EventType, QualificationVerdict } from "@kps/types";
import type { AiAnalysisResponse, Database, QualificationAnalysisResult } from "@kps/types";
import { AI_SERVICE, type AIService } from "../ai/ai.service.interface";
import { QUALIFICATION_ANALYSIS_PROMPT_VERSION } from "../ai/prompts/qualification-analysis";
import { toDbException } from "../common/db-error";
import { AI_ACTOR, EventBus, type EventActor } from "../events/event-bus.service";
import { QualificationSessionsService } from "../qualification-sessions/qualification-sessions.service";
import { toAnalysisResponse } from "../requests/requests.service";
import { SupabaseService } from "../supabase/supabase.service";

type AiAnalysisRow = Database["public"]["Tables"]["ai_analyses"]["Row"];
type AiAnalysisInsert = Database["public"]["Tables"]["ai_analyses"]["Insert"];

const logger = new Logger("QualificationAnalysisService");

// Statuts où la qualification n'est pas encore tranchée : l'IA ne décide
// que depuis l'un d'eux, jamais par-dessus une décision déjà prise (par
// exemple une qualification manuelle entre-temps).
const UNDECIDED_STATUSES = [
  "NEW",
  "RECEIVED",
  "AI_ANALYZING",
  "ANALYZED",
  "FORM_PENDING",
  "FORM_SENT",
  "WAITING_CLIENT",
  "RESPONSE_RECEIVED",
  "QUALIFYING",
];

// Analyse des réponses de qualification (section 40) : Claude qualifie la
// demande d'après les réponses du prospect. Avec assez de confiance, la
// décision est appliquée (la qualification est une tâche automatisable,
// section 6) ; sinon la demande passe « en qualification » et un
// responsable est notifié pour trancher.
@Injectable()
export class QualificationAnalysisService {
  constructor(
    private readonly supabase: SupabaseService,
    @Inject(AI_SERVICE) private readonly ai: AIService,
    private readonly sessionsService: QualificationSessionsService,
    private readonly eventBus: EventBus,
  ) {}

  async analyze(requestId: string, initiator: EventActor): Promise<AiAnalysisResponse> {
    const client = this.supabase.getClient();
    const { data: request, error } = await client
      .from("requests")
      .select("id, subject, original_message, status, services(slug, name)")
      .eq("id", requestId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!request) throw new NotFoundException("Demande introuvable.");

    const completed = await this.sessionsService.completedResponses(requestId);
    if (!completed) {
      throw new BadRequestException("Aucun formulaire de qualification complété pour cette demande.");
    }

    const { data: skills, error: skillsError } = await client.from("skills").select("name").order("name");
    if (skillsError) throw toDbException(skillsError);

    const event = { entityType: EventEntityType.REQUEST, entityId: requestId, requestId };
    const model = this.ai.getModel();
    await this.eventBus.emit({
      ...event,
      type: EventType.QUALIFICATION_ANALYSIS_STARTED,
      actor: initiator,
      payload: { sessionId: completed.sessionId, model },
    });

    let result: QualificationAnalysisResult;
    try {
      result = await this.ai.analyzeQualification({
        subject: request.subject,
        originalMessage: request.original_message,
        detectedService: (request.services as { name: string } | null)?.name ?? null,
        responses: completed.responses,
        skillCatalogue: skills.map((s) => s.name),
      });
    } catch (err) {
      logger.error(
        { requestId, err: err instanceof Error ? err.message : String(err) },
        "Échec de l'analyse des réponses de qualification",
      );
      const failed = await this.insertAnalysis({
        request_id: requestId,
        kind: "QUALIFICATION_ANALYSIS",
        status: "FAILED",
        prompt_version: QUALIFICATION_ANALYSIS_PROMPT_VERSION,
        model,
        error: "L'analyse des réponses a échoué. Une qualification manuelle est requise.",
      });
      await this.eventBus.emit({
        ...event,
        type: EventType.AI_ANALYSIS_FAILED,
        actor: AI_ACTOR,
        payload: { analysisId: failed.id, kind: "QUALIFICATION_ANALYSIS" },
      });
      return toAnalysisResponse(failed);
    }

    const analysis = await this.insertAnalysis({
      request_id: requestId,
      kind: "QUALIFICATION_ANALYSIS",
      status: "COMPLETED",
      prompt_version: QUALIFICATION_ANALYSIS_PROMPT_VERSION,
      model,
      confidence: result.confidence,
      result: result as unknown as AiAnalysisInsert["result"],
    });

    const needsReview =
      result.qualificationStatus === QualificationVerdict.NEEDS_REVIEW ||
      result.confidence < AI_LOW_CONFIDENCE_THRESHOLD;
    await this.eventBus.emit({
      ...event,
      type: EventType.QUALIFICATION_ANALYSIS_COMPLETED,
      actor: AI_ACTOR,
      payload: {
        analysisId: analysis.id,
        verdict: result.qualificationStatus,
        confidence: result.confidence,
        needsReview,
        requiredSkills: result.requiredSkills,
      },
    });

    // Relecture du statut : il a pu changer pendant l'appel à Claude.
    const { data: current, error: currentError } = await client
      .from("requests")
      .select("status")
      .eq("id", requestId)
      .single();
    if (currentError) throw toDbException(currentError);
    if (UNDECIDED_STATUSES.includes(current.status)) {
      const next = needsReview
        ? "QUALIFYING"
        : result.qualificationStatus === QualificationVerdict.QUALIFIED
          ? "QUALIFIED"
          : "UNQUALIFIED";
      if (next !== current.status) {
        const { error: updateError } = await client
          .from("requests")
          .update({ status: next })
          .eq("id", requestId);
        if (updateError) throw toDbException(updateError);
        await this.eventBus.emit({
          ...event,
          type:
            next === "QUALIFIED"
              ? EventType.REQUEST_QUALIFIED
              : next === "UNQUALIFIED"
                ? EventType.REQUEST_UNQUALIFIED
                : EventType.REQUEST_STATUS_CHANGED,
          actor: AI_ACTOR,
          payload: { from: current.status, to: next, analysisId: analysis.id },
        });
      }
    }

    return toAnalysisResponse(analysis);
  }

  private async insertAnalysis(row: AiAnalysisInsert): Promise<AiAnalysisRow> {
    const { data, error } = await this.supabase
      .getClient()
      .from("ai_analyses")
      .insert(row)
      .select("*")
      .single();
    if (error) throw toDbException(error);
    return data;
  }
}
