// Tests d'intégration des notifications (Phase 14, sections 5, 41, 42,
// 62, 63) : l'application complète contre la VRAIE base Supabase de dev,
// un vrai Redis (BullMQ), de vrais appels à Claude et de vrais emails,
// dont la réception est vérifiée par IMAP. Aucun mock.
//
// Les destinataires sont de vrais comptes créés pour le test, avec des
// alias "+" de la boîte de test : chaque email part réellement et arrive
// dans une boîte que le test peut lire, sans jamais écrire à un tiers.
//
// Prérequis : .env complet (Supabase, Anthropic, SMTP/IMAP, REDIS_URL) et
// `docker compose up -d redis`. Lancer : pnpm --filter @kps/api test:e2e

process.env.LOG_LEVEL = "silent";
process.env.RATE_LIMIT_MAX = "5000";

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import request from "supertest";
import { EventActorType, EventEntityType, EventType, RequestSource } from "@kps/types";
import type { Database } from "@kps/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { AUTOMATION_ACTOR, EventBus } from "../src/events/event-bus.service";
import { NotificationsDispatcher } from "../src/notifications/notifications.dispatcher";
import { RequestsService } from "../src/requests/requests.service";
import { SupabaseService } from "../src/supabase/supabase.service";

interface TestUser {
  id: string;
  email: string;
  name: string;
  token: string;
}

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

describe("Notifications (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let eventBus: EventBus;
  let adminToken: string;
  let adminId: string;
  const tag = `n${Date.now()}`;
  const run = `e2e-notif-${tag}`;
  const createdRequestIds: string[] = [];
  const createdAuthUserIds: string[] = [];
  let salesA: TestUser;
  let salesB: TestUser;
  let director: TestUser;
  let testFormId: string;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signIn(email: string, password: string): Promise<string> {
    const response = await fetch(
      `${config.getOrThrow<string>("SUPABASE_URL")}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: config.getOrThrow<string>("SUPABASE_PUBLISHABLE_KEY"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      },
    );
    const body = (await response.json()) as { access_token?: string };
    if (!body.access_token) throw new Error(`Connexion impossible pour ${email}`);
    return body.access_token;
  }

  async function createUser(roleKey: string, label: string): Promise<TestUser> {
    const [local, domain] = config.getOrThrow<string>("SMTP_USER").split("@");
    const email = `${local}+${tag}-${label}@${domain}`.toLowerCase();
    const password = `Pw-${tag}-${label}-9!`;
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    createdAuthUserIds.push(created.user.id);
    const { data: role } = await db.from("roles").select("id").eq("key", roleKey).single();
    const firstName = label.charAt(0).toUpperCase() + label.slice(1);
    await db.from("users").insert({
      id: created.user.id,
      email,
      first_name: firstName,
      last_name: "Test",
      role_id: role!.id,
    });
    return {
      id: created.user.id,
      email,
      name: `${firstName} Test`,
      token: await signIn(email, password),
    };
  }

  async function notificationsFor(requestId: string): Promise<NotificationRow[]> {
    await eventBus.whenIdle();
    const { data } = await db
      .from("notifications")
      .select("*")
      .eq("related_entity_id", requestId)
      .order("created_at", { ascending: true });
    return data ?? [];
  }

  function summary(rows: NotificationRow[], eventType: string): string[] {
    return rows
      .filter((r) => r.event_type === eventType)
      .map((r) => `${r.user_id}:${r.channel}`)
      .sort();
  }

  async function waitForEmailsSent(ids: string[]): Promise<NotificationRow[]> {
    const deadline = Date.now() + 60000;
    for (;;) {
      const { data } = await db.from("notifications").select("*").in("id", ids);
      const rows = data ?? [];
      if (rows.every((r) => r.sent_at) || Date.now() > deadline) return rows;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  async function createManualRequest(body: Record<string, unknown>): Promise<string> {
    const created = await http().post("/api/v1/requests").set(as(adminToken)).send(body).expect(201);
    createdRequestIds.push(created.body.id);
    return created.body.id as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    config = app.get(ConfigService);
    db = app.get(SupabaseService).getClient();
    eventBus = app.get(EventBus);
    adminToken = await signIn(
      config.getOrThrow<string>("E2E_ADMIN_EMAIL"),
      config.getOrThrow<string>("E2E_ADMIN_PASSWORD"),
    );
    const me = await http().get("/api/v1/users/me").set(as(adminToken)).expect(200);
    adminId = me.body.id;

    salesA = await createUser("SALES", "salesa");
    salesB = await createUser("SALES", "salesb");
    director = await createUser("DIRECTOR", "director");

    const form = await http()
      .post("/api/v1/forms")
      .set(as(adminToken))
      .send({ name: `${run}-form`, slug: `${run}-form` })
      .expect(201);
    testFormId = form.body.id;
    const step = await http()
      .post(`/api/v1/forms/${testFormId}/steps`)
      .set(as(adminToken))
      .send({ title: "Étape" })
      .expect(201);
    await http()
      .post(`/api/v1/forms/${testFormId}/steps/${step.body.id}/fields`)
      .set(as(adminToken))
      .send({ key: "companyName", label: "Société", type: "TEXT", required: true })
      .expect(201);
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
    if (testFormId) await db.from("forms").delete().eq("id", testFormId);
    for (const id of createdAuthUserIds) await db.auth.admin.deleteUser(id);

    // Emails de test reçus par les alias : supprimés de la boîte.
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
    const lock = await imap.getMailboxLock("INBOX");
    try {
      const uids = await imap.search({ to: tag }, { uid: true });
      if (Array.isArray(uids) && uids.length > 0) await imap.messageDelete(uids, { uid: true });
    } finally {
      lock.release();
      await imap.logout().catch(() => undefined);
    }
    await app.close();
  });

  describe("demande assignée dès la création", () => {
    let requestId: string;
    let reference: string;

    beforeAll(async () => {
      requestId = await createManualRequest({
        subject: `${run} — site vitrine`,
        originalMessage:
          "Nous souhaitons créer le site vitrine de notre cabinet d'architectes : 6 pages, portfolio, FR/EN.",
        assignedUserId: salesA.id,
      });
      const { data } = await db.from("requests").select("reference").eq("id", requestId).single();
      reference = data!.reference;
    });

    it("seul le commercial assigné est notifié — jamais l'auteur ni toute l'équipe", async () => {
      const rows = await notificationsFor(requestId);

      expect(summary(rows, "REQUEST_RECEIVED")).toEqual(
        [`${salesA.id}:EMAIL`, `${salesA.id}:IN_APP`].sort(),
      );
      expect(summary(rows, "REQUEST_ASSIGNED")).toEqual(
        [`${salesA.id}:EMAIL`, `${salesA.id}:IN_APP`].sort(),
      );
      // Défaut : in-app seulement pour ces étapes moins urgentes.
      expect(summary(rows, "REQUEST_ANALYSIS_COMPLETED")).toEqual([`${salesA.id}:IN_APP`]);
      expect(summary(rows, "QUALIFICATION_REQUIRED")).toEqual([`${salesA.id}:IN_APP`]);
      expect(rows.some((r) => [adminId, salesB.id, director.id].includes(r.user_id))).toBe(false);

      const received = rows.find((r) => r.event_type === "REQUEST_RECEIVED" && r.channel === "IN_APP")!;
      expect(received.title).toBe(`Nouvelle demande ${reference}`);
      expect(received.body).toContain("par saisie manuelle");
      expect(received.link).toBe(`/requests/${requestId}`);
      expect(received.priority).toBe("MEDIUM");
      expect(`${received.title} ${received.body}`).not.toMatch(/\{\{/);
    });

    it("l'email part réellement par la file BullMQ et arrive dans la boîte du destinataire", async () => {
      const rows = await notificationsFor(requestId);
      const emails = rows.filter((r) => r.channel === "EMAIL");
      const sent = await waitForEmailsSent(emails.map((r) => r.id));
      expect(sent.every((r) => r.sent_at !== null && r.error === null)).toBe(true);

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
        const deadline = Date.now() + 45000;
        while (Date.now() < deadline && found.length === 0) {
          const lock = await imap.getMailboxLock("INBOX");
          try {
            const result = await imap.search(
              { to: salesA.email, subject: `Nouvelle demande ${reference}` },
              { uid: true },
            );
            found = Array.isArray(result) ? result : [];
          } finally {
            lock.release();
          }
          if (found.length === 0) await new Promise((r) => setTimeout(r, 2000));
        }
      } finally {
        await imap.logout().catch(() => undefined);
      }
      expect(found).toHaveLength(1);
    });

    it("la timeline indique qui a été notifié (section 43)", async () => {
      await eventBus.whenIdle();
      const timeline = await http()
        .get(`/api/v1/requests/${requestId}/timeline`)
        .set(as(adminToken))
        .expect(200);
      const notified = (timeline.body as { type: string; payload: Record<string, unknown> }[]).filter(
        (e) => e.type === "TEAM_NOTIFIED",
      );
      const received = notified.find((e) => e.payload.rule === "REQUEST_RECEIVED");
      expect(received?.payload.recipients).toEqual([
        { name: salesA.name, channels: ["EMAIL", "IN_APP"] },
      ]);
    });

    it("formulaire complété par le prospect : commercial assigné + responsable, avec email", async () => {
      const session = await http()
        .post(`/api/v1/requests/${requestId}/qualification-sessions`)
        .set(as(adminToken))
        .send({ formId: testFormId })
        .expect(201);
      const token = (session.body.qualificationUrl as string).split("/qualification/")[1]!;
      await http()
        .put(`/api/v1/public/qualification/${token}/responses/companyName`)
        .send({ value: "ACME SA" })
        .expect(200);
      await http().post(`/api/v1/public/qualification/${token}/submit`).send({ consent: true }).expect(201);

      const rows = await notificationsFor(requestId);
      expect(summary(rows, "FORM_COMPLETED")).toEqual(
        [
          `${salesA.id}:EMAIL`,
          `${salesA.id}:IN_APP`,
          `${director.id}:EMAIL`,
          `${director.id}:IN_APP`,
        ].sort(),
      );
      expect(rows.find((r) => r.event_type === "FORM_COMPLETED")!.priority).toBe("HIGH");
    });

    it("réassignation : le nouvel assigné est notifié, puis seul lui suit la demande", async () => {
      await http()
        .patch(`/api/v1/requests/${requestId}`)
        .set(as(adminToken))
        .send({ assignedUserId: salesB.id })
        .expect(200);
      await http()
        .patch(`/api/v1/requests/${requestId}`)
        .set(as(adminToken))
        .send({ status: "QUALIFIED" })
        .expect(200);

      const rows = await notificationsFor(requestId);
      expect(summary(rows, "REQUEST_ASSIGNED")).toEqual(
        [
          `${salesA.id}:EMAIL`,
          `${salesA.id}:IN_APP`,
          `${salesB.id}:EMAIL`,
          `${salesB.id}:IN_APP`,
        ].sort(),
      );
      expect(summary(rows, "REQUEST_QUALIFIED")).toEqual(
        [
          `${salesB.id}:EMAIL`,
          `${salesB.id}:IN_APP`,
          `${director.id}:EMAIL`,
          `${director.id}:IN_APP`,
        ].sort(),
      );
      const qualified = rows.find((r) => r.event_type === "REQUEST_QUALIFIED" && r.channel === "IN_APP")!;
      expect(qualified.body).toContain("qualifiée par Super Admin");
    });

    // Rejoué *après* la réassignation (test précédent) : les destinataires
    // ne doivent pas être recalculés d'après l'état actuel de la demande.
    it("un événement rejoué ne crée ni notification ni email supplémentaire (section 63)", async () => {
      const before = await notificationsFor(requestId);
      const { data: stored } = await db
        .from("events")
        .select("*")
        .eq("request_id", requestId)
        .eq("type", "REQUEST_RECEIVED")
        .single();

      const dispatcher = app.get(NotificationsDispatcher);
      const replay = {
        id: stored!.id,
        type: EventType.REQUEST_RECEIVED,
        entityType: EventEntityType.REQUEST,
        entityId: requestId,
        requestId,
        actor: { type: stored!.actor_type as EventActorType, id: stored!.actor_id },
        payload: stored!.payload as Record<string, string>,
        createdAt: stored!.created_at,
      };
      await dispatcher.dispatch(replay);
      await dispatcher.dispatch(replay);

      const after = await notificationsFor(requestId);
      expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());
      const notifiedEvents = await db
        .from("events")
        .select("id")
        .eq("request_id", requestId)
        .eq("type", "TEAM_NOTIFIED")
        .eq("payload->>rule", "REQUEST_RECEIVED");
      expect(notifiedEvents.data).toHaveLength(1);
    });

    it("refuse d'assigner un utilisateur sans droit de gestion (VIEWER)", async () => {
      const { data: viewer } = await db
        .from("users")
        .select("id")
        .eq("email", config.getOrThrow<string>("E2E_VIEWER_EMAIL"))
        .single();
      await http()
        .patch(`/api/v1/requests/${requestId}`)
        .set(as(adminToken))
        .send({ assignedUserId: viewer!.id })
        .expect(400);
    });
  });

  it("demande entrante non assignée : tous les commerciaux, ni le responsable ni les autres rôles", async () => {
    const requestsService = app.get(RequestsService);
    const { request: created } = await requestsService.createFromInbound({
      source: RequestSource.EMAIL,
      channel: "gmail",
      subject: `${run} — entrante`,
      originalMessage: "Bonjour, une question sur vos services.",
      language: null,
      country: null,
      clientId: null,
      contactId: null,
      emailMessageId: `<${run}-inbound@example.test>`,
    });
    createdRequestIds.push(created.id);

    const rows = await notificationsFor(created.id);
    const recipients = new Set(rows.map((r) => r.user_id));
    expect(recipients.has(salesA.id)).toBe(true);
    expect(recipients.has(salesB.id)).toBe(true);
    expect(recipients.has(director.id)).toBe(false);
    expect(recipients.has(adminId)).toBe(false);
    const { data: nonSales } = await db
      .from("users")
      .select("id, roles!inner(key)")
      .in("id", [...recipients])
      .neq("roles.key", "SALES");
    expect(nonSales).toEqual([]);
    expect(rows.find((r) => r.user_id === salesA.id)!.body).toContain("par email");
  });

  describe("préférences", () => {
    it("liste les règles avec l'état de chaque canal et verrouille l'in-app critique", async () => {
      const response = await http()
        .get("/api/v1/notifications/preferences")
        .set(as(salesA.token))
        .expect(200);
      const byType = new Map(
        (response.body as { eventType: string; channels: Record<string, { enabled: boolean; locked: boolean }> }[]).map(
          (p) => [p.eventType, p.channels],
        ),
      );
      expect(byType.get("REQUEST_RECEIVED")).toEqual({
        IN_APP: { enabled: true, locked: false },
        EMAIL: { enabled: true, locked: false },
      });
      expect(byType.get("REQUEST_ANALYSIS_COMPLETED")?.EMAIL).toEqual({ enabled: false, locked: false });
      expect(byType.get("REQUEST_ASSIGNED")?.IN_APP).toEqual({ enabled: true, locked: true });
    });

    it("refuse de couper l'in-app d'une notification critique, et WhatsApp", async () => {
      await http()
        .put("/api/v1/notifications/preferences")
        .set(as(salesA.token))
        .send({ eventType: "REQUEST_ASSIGNED", channel: "IN_APP", enabled: false })
        .expect(400);
      await http()
        .put("/api/v1/notifications/preferences")
        .set(as(salesA.token))
        .send({ eventType: "REQUEST_RECEIVED", channel: "WHATSAPP", enabled: true })
        .expect(400);
      await http()
        .put("/api/v1/notifications/preferences")
        .set(as(salesA.token))
        .send({ eventType: "TEAM_NOTIFIED", channel: "IN_APP", enabled: false })
        .expect(400);
    });

    it("les préférences sont réellement appliquées à l'envoi suivant", async () => {
      await http()
        .put("/api/v1/notifications/preferences")
        .set(as(salesA.token))
        .send({ eventType: "REQUEST_ANALYSIS_COMPLETED", channel: "IN_APP", enabled: false })
        .expect(200);
      await http()
        .put("/api/v1/notifications/preferences")
        .set(as(salesA.token))
        .send({ eventType: "REQUEST_ANALYSIS_COMPLETED", channel: "EMAIL", enabled: true })
        .expect(200);

      const requestId = await createManualRequest({
        subject: `${run} — préférences`,
        originalMessage: "Refonte de notre boutique en ligne, 50 produits.",
        assignedUserId: salesA.id,
      });
      const rows = await notificationsFor(requestId);
      expect(summary(rows, "REQUEST_ANALYSIS_COMPLETED")).toEqual([`${salesA.id}:EMAIL`]);
      await waitForEmailsSent(rows.filter((r) => r.channel === "EMAIL").map((r) => r.id));
    });
  });

  describe("centre de notifications (section 42)", () => {
    it("liste, filtre, recherche et compte les non lues de l'utilisateur connecté uniquement", async () => {
      const all = await http().get("/api/v1/notifications?limit=100").set(as(salesA.token)).expect(200);
      expect(all.body.meta.total).toBeGreaterThan(0);
      // Uniquement l'in-app, uniquement les siennes.
      const { data: own } = await db
        .from("notifications")
        .select("id")
        .eq("user_id", salesA.id)
        .eq("channel", "IN_APP");
      expect(all.body.meta.total).toBe(own!.length);

      const high = await http()
        .get("/api/v1/notifications?priority=HIGH&limit=100")
        .set(as(salesA.token))
        .expect(200);
      expect(high.body.data.every((n: { priority: string }) => n.priority === "HIGH")).toBe(true);
      expect(high.body.meta.total).toBeGreaterThan(0);

      const search = await http()
        .get(`/api/v1/notifications?search=${encodeURIComponent("préférences")}`)
        .set(as(salesA.token))
        .expect(200);
      expect(search.body.data.length).toBeGreaterThan(0);
      expect(
        search.body.data.every((n: { title: string; body: string }) =>
          `${n.title} ${n.body}`.includes("préférences"),
        ),
      ).toBe(true);

      const count = await http()
        .get("/api/v1/notifications/unread-count")
        .set(as(salesA.token))
        .expect(200);
      expect(count.body.count).toBe(all.body.meta.total);
    });

    it("marquer lu, puis tout marquer lu ; la notification d'un autre est introuvable", async () => {
      const unread = await http()
        .get("/api/v1/notifications?status=unread")
        .set(as(salesA.token))
        .expect(200);
      const first = unread.body.data[0];
      const before = (await http().get("/api/v1/notifications/unread-count").set(as(salesA.token))).body
        .count as number;

      const marked = await http()
        .post(`/api/v1/notifications/${first.id}/read`)
        .set(as(salesA.token))
        .expect(201);
      expect(marked.body.isRead).toBe(true);
      expect(marked.body.readAt).toBeTruthy();
      const afterOne = await http().get("/api/v1/notifications/unread-count").set(as(salesA.token));
      expect(afterOne.body.count).toBe(before - 1);

      // salesB ne peut ni lire ni marquer une notification de salesA.
      await http().post(`/api/v1/notifications/${first.id}/read`).set(as(salesB.token)).expect(404);

      const all = await http().post("/api/v1/notifications/read-all").set(as(salesA.token)).expect(201);
      expect(all.body.updated).toBe(before - 1);
      const final = await http().get("/api/v1/notifications/unread-count").set(as(salesA.token));
      expect(final.body.count).toBe(0);
      const read = await http()
        .get("/api/v1/notifications?status=read&limit=100")
        .set(as(salesA.token))
        .expect(200);
      expect(read.body.meta.total).toBe(before);
    });

    it("401 sans jeton", async () => {
      await http().get("/api/v1/notifications").expect(401);
      await http().get("/api/v1/notifications/unread-count").expect(401);
    });
  });

  it("application métier : responsable technique, et à défaut les administrateurs", async () => {
    const requestsService = app.get(RequestsService);
    const businessApp =
      "Nous voulons une application métier sur mesure pour gérer nos plannings d'intervention, " +
      "nos stocks de pièces et la facturation interne, accessible à nos 40 techniciens.";

    async function inboundAnalyzed(suffix: string): Promise<string> {
      const { request: created } = await requestsService.createFromInbound({
        source: RequestSource.EMAIL,
        channel: "gmail",
        subject: `${run} — ${suffix}`,
        originalMessage: businessApp,
        language: null,
        country: null,
        clientId: null,
        contactId: null,
        emailMessageId: `<${run}-${suffix}@example.test>`,
      });
      createdRequestIds.push(created.id);
      await requestsService.analyze(created.id, AUTOMATION_ACTOR);
      return created.id;
    }

    const { count: existingTechManagers } = await db
      .from("users")
      .select("id, roles!inner(key)", { count: "exact", head: true })
      .eq("roles.key", "TECHNICAL_MANAGER")
      .eq("status", "ACTIVE");

    const withoutManager = await inboundAnalyzed("app-metier-sans-rt");
    const fallbackRows = (await notificationsFor(withoutManager)).filter(
      (r) => r.event_type === "SERVICE_DETECTED",
    );
    if ((existingTechManagers ?? 0) === 0) {
      // Personne n'a le rôle : l'administrateur reçoit à sa place.
      expect(fallbackRows.map((r) => r.user_id)).toContain(adminId);
    }

    const techManager = await createUser("TECHNICAL_MANAGER", "techmanager");
    const withManager = await inboundAnalyzed("app-metier-avec-rt");
    const rows = (await notificationsFor(withManager)).filter((r) => r.event_type === "SERVICE_DETECTED");
    expect(rows.map((r) => `${r.user_id}:${r.channel}`)).toContain(`${techManager.id}:IN_APP`);
    expect(rows.map((r) => r.user_id)).not.toContain(adminId);
    expect(rows[0]!.title).toMatch(/^Application métier détectée/);
  });
});
