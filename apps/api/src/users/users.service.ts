import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import type { CreateUserDto } from "./dto/create-user.dto";
import { assertCanAssignRole } from "./role-assignment.policy";
import type { AuthenticatedUser, UserProfile } from "./users.types";

interface UserRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  whatsapp: string | null;
  avatar_url: string | null;
  status: string;
  role_id: string;
  timezone: string;
  language: string;
  created_at: string;
  updated_at: string;
  roles: { key: string } | null;
}

function toProfile(row: UserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    whatsapp: row.whatsapp,
    avatarUrl: row.avatar_url,
    roleKey: row.roles?.key ?? "VIEWER",
    status: row.status,
    timezone: row.timezone,
    language: row.language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const USER_SELECT =
  "id, email, first_name, last_name, phone, whatsapp, avatar_url, status, role_id, timezone, language, created_at, updated_at, roles(key)";

@Injectable()
export class UsersService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Résout le contexte RBAC (rôle + permissions) d'un utilisateur Supabase
   * Auth déjà vérifié — utilisé uniquement par le JwtAuthGuard.
   */
  async findAuthContext(authUserId: string): Promise<AuthenticatedUser | null> {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from("users")
      .select(USER_SELECT)
      .eq("id", authUserId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    const row = data as UserRow | null;
    if (!row || row.status !== "ACTIVE") {
      return null;
    }

    const { data: permissions, error: permError } = await client.rpc(
      "get_role_permissions",
      { p_role_id: row.role_id },
    );
    if (permError) {
      throw new InternalServerErrorException(permError.message);
    }

    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      roleKey: row.roles?.key ?? "VIEWER",
      permissions: (permissions as string[] | null) ?? [],
    };
  }

  async findById(id: string): Promise<UserProfile> {
    const { data, error } = await this.supabase
      .getClient()
      .from("users")
      .select(USER_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException("Utilisateur introuvable.");
    return toProfile(data as UserRow);
  }

  async list(): Promise<UserProfile[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from("users")
      .select(USER_SELECT)
      .order("created_at", { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return (data as UserRow[]).map(toProfile);
  }

  async create(
    actor: AuthenticatedUser,
    dto: CreateUserDto,
  ): Promise<UserProfile> {
    assertCanAssignRole({ actor, newRole: dto.roleKey });

    const client = this.supabase.getClient();

    const { data: role, error: roleError } = await client
      .from("roles")
      .select("id")
      .eq("key", dto.roleKey)
      .single();
    if (roleError || !role) {
      throw new NotFoundException(`Rôle ${dto.roleKey} introuvable.`);
    }

    const temporaryPassword = crypto.randomUUID();
    const { data: created, error: createError } =
      await client.auth.admin.createUser({
        email: dto.email,
        password: temporaryPassword,
        email_confirm: true,
      });

    if (createError) {
      if (createError.message.toLowerCase().includes("already")) {
        throw new ConflictException("Un utilisateur avec cet email existe déjà.");
      }
      throw new InternalServerErrorException(createError.message);
    }

    const { data: profileRow, error: insertError } = await client
      .from("users")
      .insert({
        id: created.user.id,
        first_name: dto.firstName,
        last_name: dto.lastName,
        email: dto.email,
        phone: dto.phone ?? null,
        role_id: (role as { id: string }).id,
      })
      .select(USER_SELECT)
      .single();

    if (insertError) {
      throw new InternalServerErrorException(insertError.message);
    }

    await client.auth.resetPasswordForEmail(dto.email);

    return toProfile(profileRow as UserRow);
  }

  async updateRole(
    actor: AuthenticatedUser,
    id: string,
    roleKey: string,
  ): Promise<UserProfile> {
    // findById lève NotFoundException si la cible n'existe pas.
    const target = await this.findById(id);
    assertCanAssignRole({
      actor,
      targetUserId: id,
      targetCurrentRole: target.roleKey,
      newRole: roleKey,
    });

    const client = this.supabase.getClient();

    const { data: role, error: roleError } = await client
      .from("roles")
      .select("id")
      .eq("key", roleKey)
      .single();
    if (roleError || !role) {
      throw new NotFoundException(`Rôle ${roleKey} introuvable.`);
    }

    const { data, error } = await client
      .from("users")
      .update({ role_id: (role as { id: string }).id })
      .eq("id", id)
      .select(USER_SELECT)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException("Utilisateur introuvable.");
    return toProfile(data as UserRow);
  }
}
