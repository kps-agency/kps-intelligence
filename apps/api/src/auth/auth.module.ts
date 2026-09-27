import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { UsersModule } from "../users/users.module";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { JwtVerifierService } from "./jwt-verifier.service";
import { PermissionsGuard } from "./permissions.guard";

// Enregistre JwtAuthGuard puis PermissionsGuard comme guards globaux
// (APP_GUARD) : toute route est authentifiée par défaut sauf @Public(),
// et toute route déclarant @RequirePermissions(...) est en plus vérifiée
// contre la matrice RBAC en base.
@Module({
  imports: [UsersModule],
  providers: [
    JwtVerifierService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AuthModule {}
