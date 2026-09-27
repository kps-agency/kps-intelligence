import { Injectable } from "@nestjs/common";
import { toDbException } from "../common/db-error";
import { SupabaseService } from "../supabase/supabase.service";

export interface RoleSummary {
  id: string;
  key: string;
  label: string;
  description: string | null;
}

@Injectable()
export class RolesService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(): Promise<RoleSummary[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from("roles")
      .select("id, key, label, description")
      .order("key");

    if (error) throw toDbException(error);
    return data as RoleSummary[];
  }
}
