import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "node:path";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { RolesModule } from "./roles/roles.module";
import { SupabaseModule } from "./supabase/supabase.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // apps/api/{src,dist} sont tous deux à un niveau sous apps/api, donc
      // trois niveaux séparent le fichier compilé/exécuté de la racine du
      // monorepo, où vit le .env partagé.
      envFilePath: join(__dirname, "..", "..", "..", ".env"),
    }),
    SupabaseModule,
    HealthModule,
    UsersModule,
    RolesModule,
    AuthModule,
  ],
})
export class AppModule {}
