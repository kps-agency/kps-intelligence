// Tests d'intégration de l'Event Bus et de la timeline (Phase 13,
// sections 4, 43, 44) : l'application complète contre la VRAIE base
// Supabase de dev, de vrais appels à Claude, et pour la chaîne
// d'événements de bout en bout un vrai envoi SMTP vérifié par une vraie
// recherche IMAP. Aucun mock.
//
// Prérequis : .env avec E2E_ADMIN_*/E2E_VIEWER_*, ANTHROPIC_API_KEY,
// SMTP_*/IMAP_*. Lancer : pnpm --filter @kps/api test:e2e

process.env.LOG_LEVEL = "silent";
process.env.RATE_LIMIT_MAX = "5000";

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import request from "supertest";
import { RequestSource } from "@kps/types";
import type { Database, TimelineEventResponse } from "@kps/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { ConversationsService } from "../src/conversations/conversations.service";
import { EmailIngestionService } from "../src/email/email-ingestion.service";
import { AUTOMATION_ACTOR, EventBus } from "../src/events/event-bus.service";
import { RequestsService } from "../src/requests/requests.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const WEBSITE_REQUEST =
  "Bonjour, nous sommes un cabinet d'architectes à Lausanne et souhaitons créer " +
  "notre site vitrine : 6 pages, portfolio de projets, formulaire de contact, " +
  "en français et en anglais. Budget d'environ 8000 CHF, mise en ligne dans 2 mois.";

describe("Event Bus et timeline (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let eventBus: EventBus;
  let adminToken: string;
  let viewerToken: string;
  const run = `e2e-events-${Date.now()}`;
  const createdRequestIds: string[] = [];
  const createdFormIds: string[] = [];
  let testFormId: string;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(emailKey: string, passwordKey: string): Promise<string> {
    const response = await fetch(
      `${config.getOrThrow<string>("SUPABASE_URL")}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: config.getOrThrow<string>("SUPABASE_PUBLISHABLE_KEY"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: config.getOrThrow<string>(emailKey),
          password: config.getOrThrow<string>(passwordKey),
        }),
      },
    );
    const body = (await response.json()) as { access_token?: string };
    if (!body.access_token) throw new Error(`Connexion impossible (${emailKey})`);
    return body.access_token;
  }

  async function timeline(requestId: string): Promise<TimelineEventResponse[]> {
    await eventBus.whenIdle();
    const response = await http()
      .get(`/api/v1/requests/${requestId}/timeline`)
      .set(as(adminToken))
      .expect(200);
    return response.body as TimelineEventResponse[];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    config = app.get(ConfigService);
    db = app.get(SupabaseService).getClient();
    eventBus = app.get(EventBus);
    adminToken = await login("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD");
    viewerToken = await login("E2E_VIEWER_EMAIL", "E2E_VIEWER_PASSWORD");

    // Formulaire de test à deux champs : chaque réponse fait franchir un
    // palier de progression de 50 %.
    const form = await http()
      .post("/api/v1/forms")
      .set(as(adminToken))
      .send({ name: `${run}-form`, slug: `${run}-form` })
      .expect(201);
    testFormId = form.body.id;
    createdFormIds.push(testFormId);
    const step = await http()
      .post(`/api/v1/forms/${testFormId}/steps`)
      .set(as(adminToken))
      .send({ title: "Étape unique" })
      .expect(201);
    for (const field of [
      { key: "companyName", label: "Société", type: "TEXT", required: true },
      { key: "budget", label: "Budget", type: "NUMBER" },
    ]) {
      await http()
        .post(`/api/v1/forms/${testFormId}/steps/${step.body.id}/fields`)
        .set(as(adminToken))
        .send(field)
        .expect(201);
    }
    await http()
      .patch(`/api/v1/forms/${testFormId}`)
      .set(as(adminToken))
      .send({ status: "PUBLISHED" })
      .expect(200);
  });

  afterAll(async () => {
    await eventBus.whenIdle();
    if (createdRequestIds.length > 0) {
      await db.from("conversations").delete().in("request_id", createdRequestIds);
      await db.from("requests").delete().in("id", createdRequestIds);
    }
    if (createdFormIds.length > 0) {
      await db.from("forms").delete().in("id", createdFormIds);
    }
    await app.close();
  });

  describe("demande saisie manuellement", () => {
    let requestId: string;

    beforeAll(async () => {
      const created = await http()
        .post("/api/v1/requests")
        .set(as(adminToken))
        .send({ subject: `${run} — site vitrine`, originalMessage: WEBSITE_REQUEST })
        .expect(201);
      requestId = created.body.id;
      createdRequestIds.push(requestId);
    });

    it("la timeline reconstitue réception → analyse → service, chaque étape attribuée", async () => {
      const events = await timeline(requestId);
      // Les traces de notification (Phase 14) réagissent aux étapes de
      // façon asynchrone et peuvent s'intercaler n'importe où : l'ordre
      // vérifié ici est celui des étapes du pipeline.
      const steps = events.filter((e) => e.type !== "TEAM_NOTIFIED");
      const types = steps.map((e) => e.type);

      expect(types.slice(0, 4)).toEqual([
        "REQUEST_RECEIVED",
        "REQUEST_ANALYSIS_STARTED",
        "REQUEST_ANALYSIS_COMPLETED",
        "SERVICE_DETECTED",
      ]);

      const [received, started, completed, detected] = steps;
      expect(received!.actorType).toBe("USER");
      expect(received!.actorName).toBeTruthy();
      expect(received!.payload.source).toBe("MANUAL");
      expect(started!.actorType).toBe("AUTOMATION");
      expect(completed!.actorType).toBe("AI");
      expect(detected!.actorType).toBe("AI");
      expect(detected!.payload.serviceSlug).toBe("WEBSITE");

      // Chronologie strictement croissante.
      const times = events.map((e) => new Date(e.createdAt).getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    });

    it("un service identifié avec assurance rend la qualification requise, sans envoi sans canal", async () => {
      const events = await timeline(requestId);
      const required = events.find((e) => e.type === "QUALIFICATION_REQUIRED");
      expect(required?.actorType).toBe("AUTOMATION");
      expect(required?.payload.serviceSlug).toBe("WEBSITE");
      // Saisie manuelle = aucun canal de réponse : personne n'est contacté
      // automatiquement, l'équipe envoie le lien elle-même.
      expect(events.some((e) => e.type === "QUALIFICATION_LINK_CREATED")).toBe(false);
    });

    it("relancer l'analyse est attribué à l'utilisateur et ne rend pas la qualification requise deux fois", async () => {
      // Sans lien encore créé (cas trouvé en test navigateur : la relance
      // redisait « qualification requise »)...
      await http().post(`/api/v1/requests/${requestId}/analyze`).set(as(adminToken)).expect(201);
      // ...puis avec un lien existant.
      await http()
        .post(`/api/v1/requests/${requestId}/qualification-sessions`)
        .set(as(adminToken))
        .send({ formId: testFormId })
        .expect(201);
      await http().post(`/api/v1/requests/${requestId}/analyze`).set(as(adminToken)).expect(201);

      const events = await timeline(requestId);
      const starts = events.filter((e) => e.type === "REQUEST_ANALYSIS_STARTED");
      expect(starts.map((e) => e.actorType)).toEqual(["AUTOMATION", "USER", "USER"]);
      expect(events.filter((e) => e.type === "QUALIFICATION_REQUIRED")).toHaveLength(1);
    });

    it("un changement de statut produit l'événement du catalogue, avec l'ancien et le nouveau statut", async () => {
      await http()
        .patch(`/api/v1/requests/${requestId}`)
        .set(as(adminToken))
        .send({ status: "QUALIFIED" })
        .expect(200);
      await http()
        .patch(`/api/v1/requests/${requestId}`)
        .set(as(adminToken))
        .send({ status: "MATCHING" })
        .expect(200);
      // Modifier un autre champ n'est pas une étape du pipeline.
      await http()
        .patch(`/api/v1/requests/${requestId}`)
        .set(as(adminToken))
        .send({ priority: "HIGH" })
        .expect(200);

      const events = await timeline(requestId);
      const statusEvents = events.filter((e) =>
        ["REQUEST_QUALIFIED", "REQUEST_STATUS_CHANGED"].includes(e.type),
      );
      expect(statusEvents.map((e) => [e.type, e.payload.from, e.payload.to])).toEqual([
        ["REQUEST_QUALIFIED", "ANALYZED", "QUALIFIED"],
        ["REQUEST_STATUS_CHANGED", "QUALIFIED", "MATCHING"],
      ]);
      expect(statusEvents.every((e) => e.actorType === "USER")).toBe(true);
    });
  });

  it("cycle de vie complet d'un lien de qualification journalisé dans l'ordre", async () => {
    const created = await http()
      .post("/api/v1/requests")
      .set(as(adminToken))
      .send({ subject: `${run} — cycle du lien`, originalMessage: "Demande de test." })
      .expect(201);
    const requestId = created.body.id as string;
    createdRequestIds.push(requestId);

    const session = await http()
      .post(`/api/v1/requests/${requestId}/qualification-sessions`)
      .set(as(adminToken))
      .send({ formId: testFormId })
      .expect(201);
    const sessionId = session.body.id as string;
    const token = (session.body.qualificationUrl as string).split("/qualification/")[1]!;

    await http()
      .post(`/api/v1/qualification-sessions/${sessionId}/mark-sent`)
      .set(as(adminToken))
      .expect(201);
    await http()
      .post(`/api/v1/qualification-sessions/${sessionId}/extend`)
      .set(as(adminToken))
      .send({ days: 10 })
      .expect(201);
    await http().get(`/api/v1/public/qualification/${token}`).expect(200);
    await http()
      .put(`/api/v1/public/qualification/${token}/responses/companyName`)
      .send({ value: "ACME SA" })
      .expect(200);
    await http()
      .put(`/api/v1/public/qualification/${token}/responses/budget`)
      .send({ value: 5000 })
      .expect(200);
    await http().post(`/api/v1/public/qualification/${token}/submit`).send({ consent: true }).expect(201);

    // Nouveau lien après complétion, puis révocation.
    const second = await http()
      .post(`/api/v1/requests/${requestId}/qualification-sessions`)
      .set(as(adminToken))
      .send({ formId: testFormId })
      .expect(201);
    await http()
      .post(`/api/v1/qualification-sessions/${second.body.id}/revoke`)
      .set(as(adminToken))
      .expect(201);

    const events = (await timeline(requestId)).filter(
      (e) => e.entityType === "qualification_session",
    );
    expect(events.map((e) => [e.type, e.actorType])).toEqual([
      ["QUALIFICATION_LINK_CREATED", "USER"],
      ["QUALIFICATION_LINK_SENT", "USER"],
      ["QUALIFICATION_LINK_EXTENDED", "USER"],
      ["QUALIFICATION_LINK_OPENED", "SYSTEM"],
      ["FORM_STARTED", "SYSTEM"],
      ["FORM_PROGRESS_UPDATED", "SYSTEM"],
      ["FORM_PROGRESS_UPDATED", "SYSTEM"],
      ["FORM_COMPLETED", "SYSTEM"],
      ["QUALIFICATION_LINK_CREATED", "USER"],
      ["QUALIFICATION_LINK_REVOKED", "USER"],
    ]);
    expect(events[1]!.payload.channel).toBe("MANUAL");
    expect(events.filter((e) => e.type === "FORM_PROGRESS_UPDATED").map((e) => e.payload.progressPercent)).toEqual([50, 100]);
    // Le token n'apparaît jamais dans le journal.
    expect(JSON.stringify(events)).not.toContain(token);
  });

  it("le journal est en ajout seul : un événement passé ne peut pas être modifié", async () => {
    const [first] = await timeline(createdRequestIds[0]!);
    const { error } = await db.from("events").update({ payload: {} }).eq("id", first!.id);
    expect(error?.message).toMatch(/ajout seul/);
  });

  it("accès : 401 sans jeton, 404 pour une demande inconnue, lecture autorisée au VIEWER", async () => {
    const requestId = createdRequestIds[0]!;
    await http().get(`/api/v1/requests/${requestId}/timeline`).expect(401);
    await http()
      .get("/api/v1/requests/00000000-0000-4000-8000-000000000000/timeline")
      .set(as(adminToken))
      .expect(404);
    await http().get(`/api/v1/requests/${requestId}/timeline`).set(as(viewerToken)).expect(200);
  });

  it(
    "chaîne événementielle réelle : email entrant → analyse → qualification requise → email envoyé et reçu → réponse rattachée",
    async () => {
      const requestsService = app.get(RequestsService);
      const conversations = app.get(ConversationsService);
      const ingestion = app.get(EmailIngestionService) as unknown as {
        processMessage(uid: number, source: Buffer): Promise<void>;
      };
      // Le "prospect" est la boîte de test elle-même : l'email de
      // qualification part réellement et peut être retrouvé par IMAP.
      const inbox = config.getOrThrow<string>("SMTP_USER");
      const inboundId = `<${run}-inbound@example.test>`;

      // Mêmes étapes, dans le même ordre, que EmailIngestionService pour
      // un nouvel email (hors parsing, sans lequel on ne pourrait pas
      // choisir l'adresse du prospect).
      const { request: created } = await requestsService.createFromInbound({
        source: RequestSource.EMAIL,
        channel: "gmail",
        subject: `${run} — site vitrine`,
        originalMessage: WEBSITE_REQUEST,
        language: null,
        country: null,
        clientId: null,
        contactId: null,
        emailMessageId: inboundId,
        emailThreadId: null,
      });
      createdRequestIds.push(created.id);
      await conversations.startForRequest("EMAIL", created, {
        fromAddress: inbox,
        fromName: "Alice Martin",
        toAddress: inbox,
        subject: `${run} — site vitrine`,
        body: WEBSITE_REQUEST,
        externalMessageId: inboundId,
        externalThreadId: null,
        sentAt: new Date().toISOString(),
      });
      await requestsService.analyze(created.id, AUTOMATION_ACTOR);

      const events = await timeline(created.id);
      const chain = events
        .filter((e) =>
          [
            "SERVICE_DETECTED",
            "QUALIFICATION_REQUIRED",
            "QUALIFICATION_LINK_CREATED",
            "QUALIFICATION_LINK_SENT",
          ].includes(e.type),
        )
        .map((e) => [e.type, e.actorType]);
      expect(chain).toEqual([
        ["SERVICE_DETECTED", "AI"],
        ["QUALIFICATION_REQUIRED", "AUTOMATION"],
        ["QUALIFICATION_LINK_CREATED", "AUTOMATION"],
        ["QUALIFICATION_LINK_SENT", "AUTOMATION"],
      ]);
      expect(events.find((e) => e.type === "QUALIFICATION_LINK_SENT")!.payload.channel).toBe("EMAIL");

      const { data: outbound } = await db
        .from("conversation_messages")
        .select("external_message_id, body, to_address")
        .eq("direction", "OUTBOUND")
        .eq("to_address", inbox)
        .ilike("body", "%Lien de qualification envoyé%")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      expect(outbound!.body).not.toContain("/qualification/");

      // L'email est réellement arrivé, dans le fil du message d'origine.
      const imap = new ImapFlow({
        host: config.getOrThrow<string>("IMAP_HOST"),
        port: Number(config.getOrThrow<string>("IMAP_PORT")),
        secure: true,
        auth: {
          user: config.getOrThrow<string>("IMAP_USER"),
          pass: config.getOrThrow<string>("IMAP_PASSWORD"),
        },
        logger: false,
      });
      await imap.connect();
      let found: number[] = [];
      try {
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline && found.length === 0) {
          const lock = await imap.getMailboxLock("INBOX");
          try {
            const result = await imap.search({ header: { "in-reply-to": inboundId } }, { uid: true });
            found = Array.isArray(result) ? result : [];
            if (found.length > 0) await imap.messageDelete(found, { uid: true });
          } finally {
            lock.release();
          }
          if (found.length === 0) await new Promise((r) => setTimeout(r, 2000));
        }
      } finally {
        await imap.logout().catch(() => undefined);
      }
      expect(found.length).toBeGreaterThan(0);

      // Le prospect répond à l'email de qualification : la réponse rejoint
      // la demande existante (aucune nouvelle demande), une seule fois.
      const replyId = `<${run}-reply@example.test>`;
      const reply = Buffer.from(
        [
          "From: Alice Martin <alice.prospect@example.test>",
          `To: ${inbox}`,
          `Subject: Re: votre demande`,
          `Message-ID: ${replyId}`,
          `In-Reply-To: ${outbound!.external_message_id}`,
          `References: ${inboundId} ${outbound!.external_message_id}`,
          `Date: ${new Date().toUTCString()}`,
          "Content-Type: text/plain; charset=utf-8",
          "",
          "Merci, je remplis le formulaire ce soir.",
        ].join("\r\n"),
      );
      await ingestion.processMessage(1, reply);
      await ingestion.processMessage(1, reply);

      const { count: requestsForReply } = await db
        .from("requests")
        .select("id", { count: "exact", head: true })
        .eq("email_message_id", replyId);
      expect(requestsForReply).toBe(0);

      const after = await timeline(created.id);
      const received = after.filter((e) => e.type === "CONVERSATION_MESSAGE_RECEIVED");
      expect(received).toHaveLength(1);
      expect(received[0]!.actorType).toBe("SYSTEM");
    },
    150000,
  );
});
