import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EventEntityType, EventType, MissionStatus } from "@kps/types";
import type {
  AssignableUserResponse,
  Database,
  Json,
  MissionListItemResponse,
  MissionResponse,
  PaginatedResponse,
  PriorityLevel,
} from "@kps/types";
import { toDbException } from "../common/db-error";
import { toRange } from "../common/pagination-query.dto";
import { toContainsPattern } from "../common/search";
import { AUTOMATION_ACTOR, EventBus, type EventActor } from "../events/event-bus.service";
import { SupabaseService } from "../supabase/supabase.service";
import type {
  AddMissionMemberDto,
  ChangeMissionStatusDto,
  CreateMissionDto,
  ListMissionsQueryDto,
  UpdateMissionDto,
} from "./dto/mission.dto";

type MissionRow = Database["public"]["Tables"]["missions"]["Row"];
type MissionUpdate = Database["public"]["Tables"]["missions"]["Update"];
type Person = { first_name: string; last_name: string };
type MissionWithLinks = MissionRow & {
  clients: { company_name: string } | null;
  services: { name: string } | null;
  manager: Person | null;
  opportunities: { request_id: string | null; requests: { reference: string } | null } | null;
  mission_members: { user_id: string; role_on_mission: string | null; users: Person | null }[];
  tasks: { status: string }[];
};

// Un seul littéral : le typage des sélections Supabase ne suit pas une
// chaîne concaténée.
const MISSION_SELECT =
  "*, clients(company_name), services(name), manager:users!missions_project_manager_id_fkey(first_name, last_name), opportunities(request_id, requests(reference)), mission_members(user_id, role_on_mission, users(first_name, last_name)), tasks(status)";

const fullName = (person: Person | null): string | null =>
  person ? `${person.first_name} ${person.last_name}` : null;

function toListItem(row: MissionWithLinks): MissionListItemResponse {
  const counted = row.tasks.filter((task) => task.status !== "CANCELLED");
  return {
    id: row.id,
    title: row.title,
    status: row.status as MissionStatus,
    priority: row.priority as PriorityLevel | null,
    clientId: row.client_id,
    clientCompanyName: row.clients?.company_name ?? null,
    opportunityId: row.opportunity_id,
    serviceId: row.service_id,
    serviceName: row.services?.name ?? null,
    projectManagerId: row.project_manager_id,
    projectManagerName: fullName(row.manager),
    startDate: row.start_date,
    endDate: row.end_date,
    budget: row.budget === null ? null : Number(row.budget),
    currency: row.currency,
    tasksDone: counted.filter((task) => task.status === "DONE").length,
    tasksTotal: counted.length,
    memberCount: row.mission_members.length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toResponse(row: MissionWithLinks): MissionResponse {
  return {
    ...toListItem(row),
    description: row.description,
    blockedReason: row.blocked_reason,
    completedAt: row.completed_at,
    requestId: row.opportunities?.request_id ?? null,
    requestReference: row.opportunities?.requests?.reference ?? null,
    members: row.mission_members
      .map((member) => ({
        userId: member.user_id,
        fullName: fullName(member.users) ?? "",
        roleOnMission: member.role_on_mission,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
  };
}

// Missions (section 52). Une mission naît d'une opportunité gagnée
// (workflow `mission-on-opportunity-won`) ou d'une saisie manuelle. Le
// chef de projet et l'équipe définitive restent des décisions humaines
// (section 6) : la création automatique ne fait que reprendre l'équipe
// déjà affectée à la demande.
@Injectable()
export class MissionsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBus,
  ) {}

  async list(query: ListMissionsQueryDto): Promise<PaginatedResponse<MissionListItemResponse>> {
    const client = this.supabase.getClient();
    let request = client.from("missions").select(MISSION_SELECT, { count: "exact" });

    if (query.status) request = request.eq("status", query.status);
    if (query.clientId) request = request.eq("client_id", query.clientId);
    if (query.opportunityId) request = request.eq("opportunity_id", query.opportunityId);
    if (query.memberId) {
      const { data: memberships, error } = await client
        .from("mission_members")
        .select("mission_id")
        .eq("user_id", query.memberId);
      if (error) throw toDbException(error);
      const ids = memberships.map((m) => m.mission_id);
      request =
        ids.length > 0
          ? request.or(`project_manager_id.eq.${query.memberId},id.in.(${ids.join(",")})`)
          : request.eq("project_manager_id", query.memberId);
    }
    const pattern = query.search ? toContainsPattern(query.search) : null;
    if (pattern) request = request.ilike("title", pattern);

    const [from, to] = toRange(query.page, query.limit);
    const { data, count, error } = await request.order("created_at", { ascending: false }).range(from, to);
    if (error) throw toDbException(error);
    return {
      data: (data as unknown as MissionWithLinks[]).map(toListItem),
      meta: { total: count ?? 0, page: query.page, limit: query.limit },
    };
  }

  async findById(id: string): Promise<MissionResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from("missions")
      .select(MISSION_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Mission introuvable.");
    return toResponse(data as unknown as MissionWithLinks);
  }

  async create(dto: CreateMissionDto, actor: EventActor): Promise<MissionResponse> {
    if (dto.opportunityId) return (await this.createFromOpportunity(dto.opportunityId, actor)).mission;

    if (dto.clientId) await this.assertExists("clients", dto.clientId, "Ce client n'existe pas.");
    if (dto.serviceId) await this.assertExists("services", dto.serviceId, "Ce service n'existe pas.");
    if (dto.projectManagerId) await this.assertManager(dto.projectManagerId);

    const { data, error } = await this.supabase
      .getClient()
      .from("missions")
      .insert({
        title: dto.title as string,
        description: dto.description ?? null,
        client_id: dto.clientId ?? null,
        service_id: dto.serviceId ?? null,
        project_manager_id: dto.projectManagerId ?? null,
      })
      .select("id")
      .single();
    if (error) throw toDbException(error);

    const mission = await this.findById(data.id);
    await this.emit(EventType.MISSION_CREATED, mission, actor, { members: 0 });
    return mission;
  }

  // Idempotent (section 63) : une seule mission par opportunité, y compris
  // si l'opportunité est rouverte puis gagnée à nouveau.
  async createFromOpportunity(
    opportunityId: string,
    actor: EventActor,
  ): Promise<{ mission: MissionResponse; created: boolean }> {
    const client = this.supabase.getClient();
    const { data: opportunity, error } = await client
      .from("opportunities")
      .select("id, title, description, client_id, service_id, currency, estimated_value, request_id")
      .eq("id", opportunityId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!opportunity) throw new BadRequestException("Cette opportunité n'existe pas.");

    const existing = await this.findByOpportunity(opportunityId);
    if (existing) return { mission: existing, created: false };

    const { data, error: insertError } = await client
      .from("missions")
      .insert({
        opportunity_id: opportunity.id,
        title: opportunity.title,
        description: opportunity.description,
        client_id: opportunity.client_id,
        service_id: opportunity.service_id,
        currency: opportunity.currency,
        budget: await this.budgetFor(opportunity.id, opportunity.estimated_value),
      })
      .select("id")
      .single();
    if (insertError) {
      // Deux créations simultanées : l'index unique sur opportunity_id tranche.
      if (insertError.code === "23505") {
        const raced = await this.findByOpportunity(opportunityId);
        if (raced) return { mission: raced, created: false };
      }
      throw toDbException(insertError);
    }

    // L'équipe affectée à la demande (décision humaine de la Phase 16)
    // devient l'équipe de départ de la mission.
    let team: { user_id: string; users: Person | null }[] = [];
    if (opportunity.request_id) {
      const { data: assigned, error: teamError } = await client
        .from("request_team_members")
        .select("user_id, users!request_team_members_user_id_fkey(first_name, last_name)")
        .eq("request_id", opportunity.request_id);
      if (teamError) throw toDbException(teamError);
      team = assigned as unknown as typeof team;
      if (team.length > 0) {
        const { error: membersError } = await client
          .from("mission_members")
          .insert(team.map((member) => ({ mission_id: data.id, user_id: member.user_id })));
        if (membersError) throw toDbException(membersError);
      }
    }

    const mission = await this.findById(data.id);
    await this.emit(EventType.MISSION_CREATED, mission, actor, { opportunityId, members: team.length });
    for (const member of team) {
      await this.emit(EventType.MISSION_ASSIGNED, mission, actor, {
        userId: member.user_id,
        userName: fullName(member.users) ?? "",
      });
    }
    return { mission, created: true };
  }

  async update(id: string, dto: UpdateMissionDto, actor: EventActor): Promise<MissionResponse> {
    const current = await this.findById(id);
    const fields: MissionUpdate = {};
    if (dto.title !== undefined) fields.title = dto.title;
    if (dto.description !== undefined) fields.description = dto.description;
    if (dto.clientId !== undefined) {
      if (dto.clientId !== null) await this.assertExists("clients", dto.clientId, "Ce client n'existe pas.");
      fields.client_id = dto.clientId;
    }
    if (dto.serviceId !== undefined) {
      if (dto.serviceId !== null) await this.assertExists("services", dto.serviceId, "Ce service n'existe pas.");
      fields.service_id = dto.serviceId;
    }
    if (dto.projectManagerId !== undefined) {
      if (dto.projectManagerId !== null) await this.assertManager(dto.projectManagerId);
      fields.project_manager_id = dto.projectManagerId;
    }
    if (dto.startDate !== undefined) fields.start_date = dto.startDate;
    if (dto.endDate !== undefined) fields.end_date = dto.endDate;
    if (dto.priority !== undefined) fields.priority = dto.priority;
    if (dto.budget !== undefined) fields.budget = dto.budget;
    if (dto.currency !== undefined) fields.currency = dto.currency;
    if (Object.keys(fields).length === 0) throw new BadRequestException("Aucun champ à modifier.");

    const start = fields.start_date === undefined ? current.startDate : fields.start_date;
    const end = fields.end_date === undefined ? current.endDate : fields.end_date;
    if (start && end && end < start) {
      throw new BadRequestException("La date de fin ne peut pas précéder la date de début.");
    }

    const { error } = await this.supabase.getClient().from("missions").update(fields).eq("id", id);
    if (error) throw toDbException(error);

    const mission = await this.findById(id);
    if (mission.projectManagerId && mission.projectManagerId !== current.projectManagerId) {
      await this.emit(EventType.MISSION_ASSIGNED, mission, actor, {
        userId: mission.projectManagerId,
        userName: mission.projectManagerName ?? "",
        projectManager: true,
      });
    }
    return mission;
  }

  async changeStatus(id: string, dto: ChangeMissionStatusDto, actor: EventActor): Promise<MissionResponse> {
    const current = await this.findById(id);
    if (current.status === dto.status) return current;

    const reason = dto.status === MissionStatus.BLOCKED ? (dto.reason ?? null) : null;
    // Filtré sur le statut lu : deux changements simultanés n'en laissent
    // passer qu'un, donc un seul événement.
    const { data: updated, error } = await this.supabase
      .getClient()
      .from("missions")
      .update({
        status: dto.status,
        blocked_reason: reason,
        completed_at: dto.status === MissionStatus.COMPLETED ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .eq("status", current.status)
      .select("id");
    if (error) throw toDbException(error);
    const mission = await this.findById(id);
    if (updated.length === 0) return mission;

    await this.emit(EventType.MISSION_STATUS_CHANGED, mission, actor, { from: current.status, to: dto.status });
    if (dto.status === MissionStatus.BLOCKED) {
      await this.emit(EventType.MISSION_BLOCKED, mission, actor, { reason });
    }
    return mission;
  }

  async addMember(id: string, dto: AddMissionMemberDto, actor: EventActor): Promise<MissionResponse> {
    await this.findById(id);
    const client = this.supabase.getClient();
    const { data: user, error: userError } = await client
      .from("users")
      .select("id, first_name, last_name, status")
      .eq("id", dto.userId)
      .maybeSingle();
    if (userError) throw toDbException(userError);
    if (!user || user.status !== "ACTIVE") {
      throw new BadRequestException("Ce collaborateur n'existe pas ou n'est pas actif.");
    }

    const { data: inserted, error } = await client
      .from("mission_members")
      .upsert(
        { mission_id: id, user_id: dto.userId, role_on_mission: dto.roleOnMission ?? null },
        { onConflict: "mission_id,user_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw toDbException(error);

    const mission = await this.findById(id);
    if (inserted.length > 0) {
      await this.emit(EventType.MISSION_ASSIGNED, mission, actor, {
        userId: user.id,
        userName: `${user.first_name} ${user.last_name}`,
      });
    }
    return mission;
  }

  async removeMember(id: string, userId: string, actor: EventActor): Promise<MissionResponse> {
    const before = await this.findById(id);
    const client = this.supabase.getClient();
    const { data: removed, error } = await client
      .from("mission_members")
      .delete()
      .eq("mission_id", id)
      .eq("user_id", userId)
      .select("id");
    if (error) throw toDbException(error);
    if (removed.length === 0) throw new NotFoundException("Ce collaborateur ne fait pas partie de la mission.");

    // Ses tâches ne restent pas attribuées à quelqu'un qui n'est plus là.
    const { error: tasksError } = await client
      .from("tasks")
      .update({ assignee_id: null })
      .eq("mission_id", id)
      .eq("assignee_id", userId)
      .neq("status", "DONE");
    if (tasksError) throw toDbException(tasksError);

    const mission = await this.findById(id);
    await this.emit(EventType.MISSION_MEMBER_REMOVED, mission, actor, {
      userId,
      userName: before.members.find((member) => member.userId === userId)?.fullName ?? "",
    });
    return mission;
  }

  // Action de workflow MARK_REQUEST_CONVERTED.
  async markRequestConverted(requestId: string): Promise<{ status: "DONE" | "SKIPPED"; detail: string }> {
    const client = this.supabase.getClient();
    const { data: request, error } = await client.from("requests").select("status").eq("id", requestId).single();
    if (error) throw toDbException(error);
    if (request.status === "CONVERTED_TO_MISSION" || request.status === "CLOSED") {
      return { status: "SKIPPED", detail: "La demande est déjà convertie ou clôturée." };
    }
    const { error: updateError } = await client
      .from("requests")
      .update({ status: "CONVERTED_TO_MISSION" })
      .eq("id", requestId);
    if (updateError) throw toDbException(updateError);
    await this.eventBus.emit({
      type: EventType.REQUEST_STATUS_CHANGED,
      entityType: EventEntityType.REQUEST,
      entityId: requestId,
      requestId,
      actor: AUTOMATION_ACTOR,
      payload: { from: request.status, to: "CONVERTED_TO_MISSION" },
    });
    return { status: "DONE", detail: "Demande convertie en mission." };
  }

  // Utilisateurs actifs pouvant piloter une mission : les seuls chefs de
  // projet possibles.
  async listManagers(): Promise<AssignableUserResponse[]> {
    const client = this.supabase.getClient();
    const { data: roles, error: rolesError } = await client
      .from("role_permissions")
      .select("role_id, permissions!inner(key)")
      .eq("permissions.key", "missions.manage");
    if (rolesError) throw toDbException(rolesError);
    if (roles.length === 0) return [];
    const { data, error } = await client
      .from("users")
      .select("id, first_name, last_name, roles(key)")
      .in("role_id", roles.map((r) => r.role_id))
      .eq("status", "ACTIVE")
      .order("first_name", { ascending: true });
    if (error) throw toDbException(error);
    return (data as { id: string; first_name: string; last_name: string; roles: { key: string } | null }[]).map(
      (u) => ({ id: u.id, fullName: `${u.first_name} ${u.last_name}`, roleKey: u.roles?.key ?? "" }),
    );
  }

  // Événement porté par la mission, rattaché à la demande d'origine quand
  // elle existe (timeline de la demande).
  async emit(
    type: EventType,
    mission: Pick<MissionResponse, "id" | "title" | "requestId">,
    actor: EventActor,
    payload: Record<string, Json>,
  ): Promise<void> {
    await this.eventBus.emit({
      type,
      entityType: EventEntityType.MISSION,
      entityId: mission.id,
      requestId: mission.requestId,
      actor,
      payload: { missionId: mission.id, title: mission.title, ...payload },
    });
  }

  private async findByOpportunity(opportunityId: string): Promise<MissionResponse | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("missions")
      .select(MISSION_SELECT)
      .eq("opportunity_id", opportunityId)
      .maybeSingle();
    if (error) throw toDbException(error);
    return data ? toResponse(data as unknown as MissionWithLinks) : null;
  }

  // Budget de départ : le montant HT du devis accepté, sinon la valeur
  // estimée de l'opportunité.
  private async budgetFor(opportunityId: string, estimatedValue: number | null): Promise<number | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("quotes")
      .select("subtotal, discount")
      .eq("opportunity_id", opportunityId)
      .eq("status", "ACCEPTED")
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (data) return Math.round((Number(data.subtotal) - Number(data.discount)) * 100) / 100;
    return estimatedValue === null ? null : Number(estimatedValue);
  }

  private async assertExists(table: "clients" | "services", id: string, message: string): Promise<void> {
    const { data, error } = await this.supabase.getClient().from(table).select("id").eq("id", id).maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new BadRequestException(message);
  }

  private async assertManager(userId: string): Promise<void> {
    if (!(await this.listManagers()).some((u) => u.id === userId)) {
      throw new BadRequestException(
        "Cet utilisateur ne peut pas être chef de projet (inactif ou sans droit de pilotage des missions).",
      );
    }
  }
}
