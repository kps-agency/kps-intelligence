import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { EventEntityType, EventType } from "@kps/types";
import type {
  Json,
  MatchingExplanation,
  QualificationAnalysisResult,
  RequestMatchingResponse,
} from "@kps/types";
import { AI_SERVICE, type AIService } from "../ai/ai.service.interface";
import { toDbException } from "../common/db-error";
import { AUTOMATION_ACTOR, EventBus, type EventActor } from "../events/event-bus.service";
import { SupabaseService } from "../supabase/supabase.service";
import { scoreCandidate, type CandidateProfile } from "./matching-score";

const logger = new Logger("MatchingService");

const RESULTS_KEPT = 10;
const TOP_IN_EVENT = 3;
// Le matching fait avancer la demande depuis ces statuts uniquement.
const BEFORE_MATCHING = ["QUALIFIED"];
const BEFORE_ASSIGNED = ["QUALIFIED", "MATCHING"];

interface RequestRow {
  id: string;
  subject: string;
  original_message: string | null;
  language: string | null;
  status: string;
  detected_service_id: string | null;
  services: { name: string } | null;
}

// Matching équipe (sections 47-48) : une RECOMMANDATION classée et
// expliquée. L'affectation d'un collaborateur est une décision humaine
// distincte (section 6), tracée dans `request_team_members`.
@Injectable()
export class MatchingService {
  constructor(
    private readonly supabase: SupabaseService,
    @Inject(AI_SERVICE) private readonly ai: AIService,
    private readonly eventBus: EventBus,
  ) {}

  async run(requestId: string, initiator: EventActor): Promise<RequestMatchingResponse> {
    const client = this.supabase.getClient();
    const request = await this.loadRequest(requestId);
    const event = { entityType: EventEntityType.REQUEST, entityId: requestId, requestId };

    const requiredSkills = await this.requiredSkills(request);
    await this.eventBus.emit({
      ...event,
      type: EventType.MATCHING_STARTED,
      actor: initiator,
      payload: { requiredSkills },
    });
    await this.advanceStatus(request, BEFORE_MATCHING, "MATCHING", initiator);

    const candidates = await this.candidates(request.detected_service_id);
    const scored = candidates
      .map((candidate) => ({
        ...candidate,
        ...scoreCandidate(candidate.profile, {
          requiredSkills,
          requestLanguage: request.language,
          serviceName: request.services?.name ?? null,
        }),
      }))
      .sort((a, b) => b.score - a.score || a.fullName.localeCompare(b.fullName))
      .slice(0, RESULTS_KEPT);

    // Un nouveau calcul remplace la recommandation précédente ; les
    // affectations déjà décidées ne sont pas touchées.
    const { error: deleteError } = await client
      .from("matching_results")
      .delete()
      .eq("request_id", requestId);
    if (deleteError) throw toDbException(deleteError);
    if (scored.length > 0) {
      const { error: insertError } = await client.from("matching_results").insert(
        scored.map((candidate, index) => ({
          request_id: requestId,
          user_id: candidate.userId,
          score: candidate.score,
          rank: index + 1,
          explanation: candidate.explanation as unknown as Json,
        })),
      );
      if (insertError) throw toDbException(insertError);
    }

    await this.eventBus.emit({
      ...event,
      type: EventType.MATCHING_COMPLETED,
      actor: AUTOMATION_ACTOR,
      payload: {
        requiredSkills,
        candidates: candidates.length,
        top: scored.slice(0, TOP_IN_EVENT).map((c) => ({
          userId: c.userId,
          name: c.fullName,
          score: c.score,
        })),
      },
    });
    return this.get(requestId);
  }

  async get(requestId: string): Promise<RequestMatchingResponse> {
    await this.loadRequest(requestId);
    const client = this.supabase.getClient();

    const [{ data: results, error }, { data: members, error: membersError }] = await Promise.all([
      client
        .from("matching_results")
        .select("user_id, score, rank, explanation, created_at, users!matching_results_user_id_fkey(first_name, last_name, roles(key))")
        .eq("request_id", requestId)
        .order("rank", { ascending: true }),
      client
        .from("request_team_members")
        .select(
          "user_id, score, created_at, member:users!request_team_members_user_id_fkey(first_name, last_name), assigner:users!request_team_members_assigned_by_fkey(first_name, last_name)",
        )
        .eq("request_id", requestId)
        .order("created_at", { ascending: true }),
    ]);
    if (error) throw toDbException(error);
    if (membersError) throw toDbException(membersError);

    const assigned = new Set(members.map((m) => m.user_id));
    const name = (u: { first_name: string; last_name: string } | null) =>
      u ? `${u.first_name} ${u.last_name}` : "";
    const explanation = (results[0]?.explanation ?? null) as unknown as MatchingExplanation | null;

    return {
      ranAt: results[0]?.created_at ?? null,
      requiredSkills: explanation?.requiredSkills ?? [],
      candidates: results.map((r) => {
        const user = r.users as { first_name: string; last_name: string; roles: { key: string } | null } | null;
        return {
          userId: r.user_id,
          fullName: name(user),
          roleKey: user?.roles?.key ?? "",
          rank: r.rank,
          score: Number(r.score),
          explanation: r.explanation as unknown as MatchingExplanation,
          assigned: assigned.has(r.user_id),
        };
      }),
      teamMembers: members.map((m) => ({
        userId: m.user_id,
        fullName: name(m.member as { first_name: string; last_name: string } | null),
        score: m.score === null ? null : Number(m.score),
        assignedAt: m.created_at,
        assignedByName: m.assigner ? name(m.assigner as { first_name: string; last_name: string }) : null,
      })),
    };
  }

  // Affectation définitive (section 6 : validation humaine).
  async assign(requestId: string, userId: string, actor: EventActor): Promise<RequestMatchingResponse> {
    const request = await this.loadRequest(requestId);
    const client = this.supabase.getClient();

    const { data: user, error: userError } = await client
      .from("users")
      .select("id, first_name, last_name, status")
      .eq("id", userId)
      .maybeSingle();
    if (userError) throw toDbException(userError);
    if (!user || user.status !== "ACTIVE") {
      throw new BadRequestException("Ce collaborateur n'existe pas ou n'est pas actif.");
    }

    const { data: result, error: resultError } = await client
      .from("matching_results")
      .select("score")
      .eq("request_id", requestId)
      .eq("user_id", userId)
      .maybeSingle();
    if (resultError) throw toDbException(resultError);

    const { data: inserted, error } = await client
      .from("request_team_members")
      .upsert(
        { request_id: requestId, user_id: userId, assigned_by: actor.id, score: result?.score ?? null },
        { onConflict: "request_id,user_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw toDbException(error);

    if (inserted.length > 0) {
      await this.eventBus.emit({
        entityType: EventEntityType.REQUEST,
        entityId: requestId,
        requestId,
        type: EventType.TEAM_MEMBER_ASSIGNED,
        actor,
        payload: {
          userId,
          userName: `${user.first_name} ${user.last_name}`,
          score: result ? Number(result.score) : null,
        },
      });
      await this.advanceStatus(request, BEFORE_ASSIGNED, "ASSIGNED", actor);
    }
    return this.get(requestId);
  }

  async unassign(requestId: string, userId: string, actor: EventActor): Promise<RequestMatchingResponse> {
    await this.loadRequest(requestId);
    const { data: removed, error } = await this.supabase
      .getClient()
      .from("request_team_members")
      .delete()
      .eq("request_id", requestId)
      .eq("user_id", userId)
      .select("user_id, users!request_team_members_user_id_fkey(first_name, last_name)");
    if (error) throw toDbException(error);
    if (removed.length === 0) throw new NotFoundException("Ce collaborateur n'est pas affecté à la demande.");

    const user = removed[0]!.users as { first_name: string; last_name: string } | null;
    await this.eventBus.emit({
      entityType: EventEntityType.REQUEST,
      entityId: requestId,
      requestId,
      type: EventType.TEAM_MEMBER_UNASSIGNED,
      actor,
      payload: { userId, userName: user ? `${user.first_name} ${user.last_name}` : "" },
    });
    return this.get(requestId);
  }

  // Compétences requises : celles de l'analyse des réponses (section 40)
  // si elle en a trouvé, sinon demandées à Claude à partir de la demande.
  private async requiredSkills(request: RequestRow): Promise<string[]> {
    const client = this.supabase.getClient();
    const { data: analysis, error } = await client
      .from("ai_analyses")
      .select("result")
      .eq("request_id", request.id)
      .eq("kind", "QUALIFICATION_ANALYSIS")
      .eq("status", "COMPLETED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw toDbException(error);
    const fromQualification = (analysis?.result as unknown as QualificationAnalysisResult | null)
      ?.requiredSkills;
    if (fromQualification && fromQualification.length > 0) return fromQualification;

    const { data: skills, error: skillsError } = await client.from("skills").select("name");
    if (skillsError) throw toDbException(skillsError);
    try {
      return await this.ai.extractRequiredSkills({
        subject: request.subject,
        originalMessage: request.original_message,
        detectedService: request.services?.name ?? null,
        skillCatalogue: skills.map((s) => s.name),
      });
    } catch (err) {
      // Le matching reste utile sans IA : score de compétences neutre,
      // signalé dans l'explication de chaque candidat.
      logger.error(
        { requestId: request.id, err: err instanceof Error ? err.message : String(err) },
        "Compétences requises indéterminées (échec IA)",
      );
      return [];
    }
  }

  // Collaborateurs actifs ayant au moins une compétence renseignée.
  private async candidates(
    serviceId: string | null,
  ): Promise<{ userId: string; fullName: string; profile: CandidateProfile }[]> {
    const client = this.supabase.getClient();
    const { data: users, error } = await client
      .from("users")
      .select(
        "id, first_name, last_name, languages, user_skills!inner(proficiency_level, years_experience, skills(name)), availability(status)",
      )
      .eq("status", "ACTIVE");
    if (error) throw toDbException(error);

    const similar = new Map<string, number>();
    if (serviceId) {
      const { data: past, error: pastError } = await client
        .from("request_team_members")
        .select("user_id, requests!inner(detected_service_id)")
        .eq("requests.detected_service_id", serviceId);
      if (pastError) throw toDbException(pastError);
      for (const row of past) similar.set(row.user_id, (similar.get(row.user_id) ?? 0) + 1);
    }

    return users.map((u) => {
      // Un-à-un (contrainte unique sur availability.user_id) : objet ou null.
      const availability = u.availability as { status: CandidateProfile["availability"] } | null;
      return {
        userId: u.id,
        fullName: `${u.first_name} ${u.last_name}`,
        profile: {
          skills: new Map(
            (u.user_skills as { proficiency_level: number; years_experience: number | null; skills: { name: string } | null }[])
              .filter((s) => s.skills)
              .map((s) => [
                s.skills!.name,
                { level: s.proficiency_level, years: s.years_experience === null ? null : Number(s.years_experience) },
              ]),
          ),
          availability: availability?.status ?? null,
          languages: u.languages ?? [],
          similarProjects: similar.get(u.id) ?? 0,
        },
      };
    });
  }

  private async advanceStatus(
    request: RequestRow,
    from: string[],
    to: string,
    actor: EventActor,
  ): Promise<void> {
    const { data: current, error } = await this.supabase
      .getClient()
      .from("requests")
      .select("status")
      .eq("id", request.id)
      .single();
    if (error) throw toDbException(error);
    if (!from.includes(current.status)) return;

    const { error: updateError } = await this.supabase
      .getClient()
      .from("requests")
      .update({ status: to as never })
      .eq("id", request.id);
    if (updateError) throw toDbException(updateError);
    await this.eventBus.emit({
      entityType: EventEntityType.REQUEST,
      entityId: request.id,
      requestId: request.id,
      type: EventType.REQUEST_STATUS_CHANGED,
      actor,
      payload: { from: current.status, to },
    });
  }

  private async loadRequest(requestId: string): Promise<RequestRow> {
    const { data, error } = await this.supabase
      .getClient()
      .from("requests")
      .select("id, subject, original_message, language, status, detected_service_id, services(name)")
      .eq("id", requestId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Demande introuvable.");
    return data as unknown as RequestRow;
  }
}
