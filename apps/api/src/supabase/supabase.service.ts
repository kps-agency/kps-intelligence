import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@kps/types";

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient<Database>;

  constructor(configService: ConfigService) {
    this.client = createClient<Database>(
      configService.getOrThrow<string>("SUPABASE_URL"),
      configService.getOrThrow<string>("SUPABASE_SECRET_KEY"),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  getClient(): SupabaseClient<Database> {
    return this.client;
  }
}
