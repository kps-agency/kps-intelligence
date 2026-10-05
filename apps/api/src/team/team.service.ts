import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AvailabilityStatus,
  MissionStatus,
  RequestStatus,
  SkillResponse,
  TeamMemberDetailResponse,
  TeamMemberMissionItem,
  TeamMemberResponse,
} from "@kps/types";
import { toDbException } from "../common/db-error";
import { SupabaseService } from "../supabase/supabase.service";
import type { AuthenticatedUser } from "../users/users.types";
import type {
  CreateSkillDto,
  UpdateAvailabilityDto,
  UpdateTeamProfileDto,
  UpdateTeamSkillsDto,
} from "./dto/team.dto";

const MEMBER_SELECT =
  "id, first_name, last_name, email, status, languages, country, timezone, expertise, roles(key), user_skills(proficiency_level, years_experience, skills(id, name, category)), availability(status, capacity_hours_per_week, available_from, notes), request_team_members!request_team_members_user_id_fkey(requests(status))";

// Une demande encore « en cours » pour la charge d'un collaborateur.
const CLOSED_STATUSES = ["WON", "LOST", "CONVERTED_TO_MISSION", "CLOSED", "UNQUALIFIED"];

interface MemberRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  languages: string[];
  country: string | null;
  timezone: string;
  expertise: string | null;
  roles: { key: string } | null;
  user_skills: {
    proficiency_level: number;
    years_experience: number | null;
    skills: { id: string; name: string; category: string | null } | null;
  }[];
  // Un-à-un (contrainte unique sur availability.user_id) : PostgREST
  // renvoie un objet ou null, pas un tableau.
  availability: {
    status: string;
    capacity_hours_per_week: number | null;
    available_from: string | null;
    notes: string | null;
  } | null;
  request_team_members: { requests: { status: string } | null }[];
}

function toMember(row: MemberRow): TeamMemberResponse {
  const availability = row.availability;
  return {
    id: row.id,
    fullName: `${row.first_name} ${row.last_name}`,
    email: row.email,
    roleKey: row.roles?.key ?? "",
    languages: row.languages ?? [],
    country: row.country,
    timezone: row.timezone,
    expertise: row.expertise,
    skills: row.user_skills
      .filter((s) => s.skills)
      .map((s) => ({
        skillId: s.skills!.id,
        name: s.skills!.name,
        category: s.skills!.category,
        proficiencyLevel: s.proficiency_level,
        yearsExperience: s.years_experience === null ? null : Number(s.years_experience),
      }))
      .sort((a, b) => b.proficiencyLevel - a.proficiencyLevel || a.name.localeCompare(b.name)),
    availability: availability
      ? {
          status: availability.status as AvailabilityStatus,
          capacityHoursPerWeek: availability.capacity_hours_per_week,
          availableFrom: availability.available_from,
          notes: availability.notes,
        }
      : null,
    activeAssignments: row.request_team_members.filter(
      (a) => a.requests && !CLOSED_STATUSES.includes(a.requests.status),
    ).length,
  };
}

// Profils de l'équipe (section 47). Chacun gère son propre profil ; la
// permission team.manage permet de gérer celui des autres.
@Injectable()
export class TeamService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(): Promise<TeamMemberResponse[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from("users")
      .select(MEMBER_SELECT)
      .eq("status", "ACTIVE")
      .order("first_name", { ascending: true });
    if (error) throw toDbException(error);
    return (data as unknown as MemberRow[]).map(toMember);
  }

  async findById(id: string): Promise<TeamMemberDetailResponse> {
    const client = this.supabase.getClient();
    const { data, error } = await client.from("users").select(MEMBER_SELECT).eq("id", id).maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Collaborateur introuvable.");

    const { data: history, error: historyError } = await client
      .from("request_team_members")
      .select("created_at, requests(id, reference, subject, status, services(name))")
      .eq("user_id", id)
      .order("created_at", { ascending: false });
    if (historyError) throw toDbException(historyError);

    const [{ data: memberships, error: membershipsError }, { data: managed, error: managedError }] =
      await Promise.all([
        client
          .from("mission_members")
          .select("role_on_mission, missions(id, title, status, created_at, clients(company_name))")
          .eq("user_id", id),
        client
          .from("missions")
          .select("id, title, status, created_at, clients(company_name)")
          .eq("project_manager_id", id),
      ]);
    if (membershipsError) throw toDbException(membershipsError);
    if (managedError) throw toDbException(managedError);

    type MissionLink = {
      id: string;
      title: string;
      status: string;
      created_at: string;
      clients: { company_name: string } | null;
    };
    const missions = new Map<string, TeamMemberMissionItem & { createdAt: string }>();
    const addMission = (mission: MissionLink, role: string | null, isProjectManager: boolean) => {
      const existing = missions.get(mission.id);
      missions.set(mission.id, {
        missionId: mission.id,
        title: mission.title,
        status: mission.status as MissionStatus,
        clientCompanyName: mission.clients?.company_name ?? null,
        roleOnMission: role ?? existing?.roleOnMission ?? null,
        isProjectManager: isProjectManager || (existing?.isProjectManager ?? false),
        createdAt: mission.created_at,
      });
    };
    for (const m of memberships) {
      if (m.missions) addMission(m.missions as unknown as MissionLink, m.role_on_mission, false);
    }
    for (const m of managed) addMission(m as unknown as MissionLink, null, true);

    return {
      ...toMember(data as unknown as MemberRow),
      missions: [...missions.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ createdAt: _createdAt, ...mission }) => mission),
      history: history
        .filter((h) => h.requests)
        .map((h) => {
          const request = h.requests as {
            id: string;
            reference: string;
            subject: string;
            status: string;
            services: { name: string } | null;
          };
          return {
            requestId: request.id,
            reference: request.reference,
            subject: request.subject,
            status: request.status as RequestStatus,
            serviceName: request.services?.name ?? null,
            assignedAt: h.created_at,
          };
        }),
    };
  }

  async updateProfile(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateTeamProfileDto,
  ): Promise<TeamMemberDetailResponse> {
    this.assertCanEdit(actor, id);
    const { data, error } = await this.supabase
      .getClient()
      .from("users")
      .update({
        languages: [...new Set(dto.languages)],
        country: dto.country?.trim() || null,
        timezone: dto.timezone,
        expertise: dto.expertise?.trim() || null,
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Collaborateur introuvable.");
    return this.findById(id);
  }

  // Remplace l'ensemble des compétences du collaborateur.
  async updateSkills(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateTeamSkillsDto,
  ): Promise<TeamMemberDetailResponse> {
    this.assertCanEdit(actor, id);
    await this.findById(id);

    const unique = new Map(dto.skills.map((s) => [s.skillId, s]));
    // Remplacement atomique (fonction SQL, une transaction) : une
    // compétence inconnue ne laisse jamais le profil à moitié effacé.
    const { error } = await this.supabase.getClient().rpc("replace_user_skills", {
      p_user_id: id,
      p_skills: [...unique.values()].map((s) => ({
        skill_id: s.skillId,
        proficiency_level: s.proficiencyLevel,
        years_experience: s.yearsExperience,
      })),
    });
    if (error) throw toDbException(error);
    return this.findById(id);
  }

  async updateAvailability(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateAvailabilityDto,
  ): Promise<TeamMemberDetailResponse> {
    this.assertCanEdit(actor, id);
    await this.findById(id);
    const { error } = await this.supabase
      .getClient()
      .from("availability")
      .upsert(
        {
          user_id: id,
          status: dto.status,
          capacity_hours_per_week: dto.capacityHoursPerWeek ?? null,
          available_from: dto.availableFrom ?? null,
          notes: dto.notes?.trim() || null,
        },
        { onConflict: "user_id" },
      );
    if (error) throw toDbException(error);
    return this.findById(id);
  }

  async listSkills(): Promise<SkillResponse[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from("skills")
      .select("id, name, category")
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw toDbException(error);
    return data;
  }

  async createSkill(dto: CreateSkillDto): Promise<SkillResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from("skills")
      .insert({ name: dto.name.trim(), category: dto.category?.trim() || null })
      .select("id, name, category")
      .single();
    if (error) throw toDbException(error);
    return data;
  }

  private assertCanEdit(actor: AuthenticatedUser, targetId: string): void {
    if (actor.id !== targetId && !actor.permissions.includes("team.manage")) {
      throw new ForbiddenException("Vous ne pouvez modifier que votre propre profil.");
    }
  }
}
