// Tests d'intégration du module email (Phase 11, section 17) : l'API
// complète contre la VRAIE base Supabase de dev, un vrai appel à
// l'API Anthropic (analyse IA synchrone déclenchée par
// `createFromInbound`), et un vrai envoi SMTP suivi d'une vraie
// vérification de réception par IMAP. Aucun mock.
//
// `createFromInbound` n'a pas de route HTTP (usage interne uniquement,
// réservé à `EmailIngestionService`) : on récupère l'instance du service
// directement depuis le module Nest de test plutôt que de passer par
// supertest — toujours une vraie base et un vrai appel IA, seule la
// couche HTTP est court-circuitée puisqu'elle n'existe pas pour cette
// méthode.
//
// Prérequis : .env avec SMTP_*/IMAP_* (compte Gmail réel) et
// ANTHROPIC_API_KEY. Lancer : pnpm --filter @kps/api test:e2e

process.env.LOG_LEVEL = "silent";
process.env.RATE_LIMIT_MAX = "5000";

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { RequestSource } from "@kps/types";
import type { Database } from "@kps/types";
import { AppModule } from "../src/app.module";
import { EmailService } from "../src/email/email.service";
import { AUTOMATION_ACTOR } from "../src/events/event-bus.service";
import { RequestsService } from "../src/requests/requests.service";
import { SupabaseService } from "../src/supabase/supabase.service";

describe("Email (intégration réelle — SMTP réel, IMAP réel, IA réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let requestsService: RequestsService;
  let emailService: EmailService;
  const run = `e2e-email-${Date.now()}`;
  const createdRequestIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    config = app.get(ConfigService);
    db = app.get(SupabaseService).getClient();
    requestsService = app.get(RequestsService);
    emailService = app.get(EmailService);
  });

  afterAll(async () => {
    if (createdRequestIds.length > 0) {
      await db.from("requests").delete().in("id", createdRequestIds);
    }
    await app.close();
  });

  describe("createFromInbound (cœur du pipeline d'ingestion)", () => {
    it("crée une vraie demande source=EMAIL, puis l'analyse par Claude", async () => {
      const messageId = `<${run}-1@example.test>`;
      const { request, alreadyExisted } = await requestsService.createFromInbound({
        source: RequestSource.EMAIL,
        channel: "gmail",
        subject: `${run} — demande de site vitrine`,
        originalMessage:
          "Bonjour, nous cherchons une agence pour créer un site vitrine pour notre restaurant.",
        language: null,
        country: null,
        clientId: null,
        contactId: null,
        emailMessageId: messageId,
        emailThreadId: null,
      });
      createdRequestIds.push(request.id);

      expect(alreadyExisted).toBe(false);
      expect(request.source).toBe("EMAIL");

      // L'ingestion enregistre la conversation puis lance l'analyse
      // (createFromInbound ne l'enchaîne plus lui-même, Phase 13).
      await requestsService.analyze(request.id, AUTOMATION_ACTOR);
      const analyzed = await requestsService.findById(request.id);
      expect(analyzed.status).toBe("ANALYZED");
      expect(typeof analyzed.aiConfidence).toBe("number");

      const { data: row } = await db
        .from("requests")
        .select("email_message_id")
        .eq("id", request.id)
        .single();
      expect(row?.email_message_id).toBe(messageId);
    });

    it("un même Message-ID ne crée jamais de doublon (idempotence, section 17)", async () => {
      const messageId = `<${run}-2@example.test>`;
      const first = await requestsService.createFromInbound({
        source: RequestSource.EMAIL,
        channel: "gmail",
        subject: `${run} — idempotence`,
        originalMessage: "Contenu de test.",
        language: null,
        country: null,
        clientId: null,
        contactId: null,
        emailMessageId: messageId,
        emailThreadId: null,
      });
      createdRequestIds.push(first.request.id);
      expect(first.alreadyExisted).toBe(false);

      const second = await requestsService.createFromInbound({
        source: RequestSource.EMAIL,
        channel: "gmail",
        subject: `${run} — idempotence (renvoyé)`,
        originalMessage: "Contenu de test.",
        language: null,
        country: null,
        clientId: null,
        contactId: null,
        emailMessageId: messageId,
        emailThreadId: null,
      });
      expect(second.alreadyExisted).toBe(true);
      expect(second.request.id).toBe(first.request.id);

      const { data: rows, error } = await db
        .from("requests")
        .select("id")
        .eq("email_message_id", messageId);
      expect(error).toBeNull();
      expect(rows).toHaveLength(1);
    });

    it("relie automatiquement une demande à un contact existant par email", async () => {
      const client = await db
        .from("clients")
        .insert({ company_name: `${run}-client` })
        .select("id")
        .single();
      const contactEmail = `${run}-contact@example.test`;
      const contact = await db
        .from("contacts")
        .insert({
          client_id: client.data!.id,
          first_name: "Jean",
          last_name: "Dupont",
          email: contactEmail,
        })
        .select("id")
        .single();

      // Reproduit ce que fait EmailIngestionService avant d'appeler
      // createFromInbound : chercher un contact par l'adresse expéditrice.
      const { data: matched } = await db
        .from("contacts")
        .select("id, client_id")
        .ilike("email", contactEmail)
        .maybeSingle();

      const { request } = await requestsService.createFromInbound({
        source: RequestSource.EMAIL,
        channel: "gmail",
        subject: `${run} — contact connu`,
        originalMessage: "Bonjour, ceci est un client déjà connu.",
        language: null,
        country: null,
        clientId: matched!.client_id,
        contactId: matched!.id,
        emailMessageId: `<${run}-3@example.test>`,
        emailThreadId: null,
      });
      createdRequestIds.push(request.id);

      expect(request.clientId).toBe(client.data!.id);
      expect(request.contactId).toBe(contact.data!.id);

      await db.from("clients").delete().eq("id", client.data!.id);
    });
  });

  describe("EmailService (envoi SMTP réel, vérifié par réception IMAP réelle)", () => {
    it("envoie un vrai email de qualification et le retrouve réellement dans la boîte", async () => {
      const marker = `${run}-smtp-check`;
      const to = config.getOrThrow<string>("SMTP_USER");

      await emailService.sendQualificationEmail(to, {
        contactFirstName: "Alice",
        serviceName: `Service ${marker}`,
        qualificationUrl: `https://example.test/qualification/${marker}`,
      });

      // Vérifie une vraie réception, pas seulement une absence d'exception
      // côté envoi — les deux protocoles (SMTP puis IMAP) sont réels.
      const client = new ImapFlow({
        host: config.getOrThrow<string>("IMAP_HOST"),
        port: Number(config.getOrThrow<string>("IMAP_PORT")),
        secure: true,
        auth: {
          user: config.getOrThrow<string>("IMAP_USER"),
          pass: config.getOrThrow<string>("IMAP_PASSWORD"),
        },
        logger: false,
      });
      await client.connect();

      let found = false;
      const deadline = Date.now() + 30000;
      try {
        while (Date.now() < deadline && !found) {
          const lock = await client.getMailboxLock("INBOX");
          try {
            const results = await client.search({ subject: marker }, { uid: true });
            found = Array.isArray(results) && results.length > 0;
          } finally {
            lock.release();
          }
          if (!found) await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } finally {
        await client.logout().catch(() => undefined);
      }

      expect(found).toBe(true);
    }, 40000);
  });
});
