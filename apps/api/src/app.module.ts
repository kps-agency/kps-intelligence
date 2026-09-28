import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { AuthModule } from "./auth/auth.module";
import { ClientsModule } from "./clients/clients.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { ContactsModule } from "./contacts/contacts.module";
import { EmailModule } from "./email/email.module";
import { EventsModule } from "./events/events.module";
import { FormsModule } from "./forms/forms.module";
import { HealthModule } from "./health/health.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { QualificationDispatchModule } from "./qualification-dispatch/qualification-dispatch.module";
import { QualificationSessionsModule } from "./qualification-sessions/qualification-sessions.module";
import { RequestsModule } from "./requests/requests.module";
import { RolesModule } from "./roles/roles.module";
import { ServicesModule } from "./services/services.module";
import { SupabaseModule } from "./supabase/supabase.module";
import { UsersModule } from "./users/users.module";
import { WhatsappModule } from "./whatsapp/whatsapp.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // apps/api/{src,dist} sont tous deux à un niveau sous apps/api, donc
      // trois niveaux séparent le fichier compilé/exécuté de la racine du
      // monorepo, où vit le .env partagé.
      envFilePath: join(__dirname, "..", "..", "..", ".env"),
    }),
    // Logs JSON structurés. Chaque requête reçoit un requestId (repris de
    // l'en-tête x-request-id s'il existe, sinon généré) renvoyé au client
    // dans le même en-tête et présent dans toutes les lignes de log de la
    // requête. Les en-têtes sensibles ne sont jamais logués.
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>("LOG_LEVEL") ?? "info",
          genReqId: (req, res) => {
            const incoming = req.headers["x-request-id"];
            const requestId =
              typeof incoming === "string" && incoming.length > 0
                ? incoming
                : randomUUID();
            res.setHeader("x-request-id", requestId);
            return requestId;
          },
          redact: ["req.headers.authorization", "req.headers.cookie"],
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get<string>("RATE_LIMIT_TTL") ?? 60) * 1000,
          limit: Number(config.get<string>("RATE_LIMIT_MAX") ?? 100),
        },
      ],
    }),
    SupabaseModule,
    EventsModule,
    HealthModule,
    UsersModule,
    RolesModule,
    ClientsModule,
    ContactsModule,
    RequestsModule,
    ServicesModule,
    FormsModule,
    QualificationSessionsModule,
    EmailModule,
    WhatsappModule,
    QualificationDispatchModule,
    NotificationsModule,
    AuthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
