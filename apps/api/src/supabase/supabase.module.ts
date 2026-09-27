import { Global, Module } from "@nestjs/common";
import { SupabaseService } from "./supabase.service";

// Global : le client Supabase serveur (clé secret, bypass RLS) est une
// infrastructure transverse utilisée par la quasi-totalité des modules
// métier, inutile de le ré-importer partout.
@Global()
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
