// Tests d'intégration des opportunités (Phase 17, sections 45 et 50) :
// l'application complète contre la VRAIE base Supabase de dev, de vrais
// appels à Claude (chaîne formulaire → qualification → matching), le vrai
// Workflow Engine et de vraies notifications. Aucun mock. Le commercial
// est un vrai compte créé pour le test (alias « + » de la boîte de test),
// supprimé à la fin.
//
// Prérequis : .env complet et `docker compose up -d redis`.
// Lancer : pnpm --filter @kps/api test:e2e

process.env.LOG_LEVEL = "silent";
process.env.RATE_LIMIT_MAX = "5000";

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import request from "supertest";
import type {
  Database,
  OpportunityBoardResponse,
  OpportunityResponse,
  TimelineEventResponse,
  WorkflowStepLogEntry,
} from "@kps/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { EventBus } from "../src/events/event-bus.service";
import { SupabaseService } from "../src/supabase/supabase.service";

describe("Opportunités (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let eventBus: EventBus;
  let adminToken: string;
  let viewerToken: string;
  let adminId: string;
  let salesId: string;
  let clientId: string;
  let testFormId: string;
  const tag = `o${Date.now()}`;
  const run = `e2e-opp-${tag}`;
  const createdAuthUserIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdOpportunityIds: string[] = [];

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

  async function createSalesUser(): Promise<string> {
    const [local, domain] = config.getOrThrow<string>("SMTP_USER").split("@");
    const email = `${local}+${tag}-sales@${domain}`;
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password: `Pw-${tag}-Sales-9!`,
      email_confirm: true,
    });
    if (error) throw error;
    createdAuthUserIds.push(created.user.id);
    const { data: role } = await db.from("roles").select("id").eq("key", "SALES").single();
    await db.from("users").insert({
      id: created.user.id,
      email,
      first_name: "Awa",
      last_name: `Test${tag}`,
      role_id: role!.id,
    });
    return created.user.id;
  }

  async function opportunityEvents(opportunityId: string) {
    await eventBus.whenIdle();
    const { data } = await db
      .from("events")
      .select("type, actor_type, payload")
      .eq("entity_type", "opportunity")
      .eq("entity_id", opportunityId)
      .order("created_at", { ascending: true });
    return data ?? [];
  }

  async function requestStatus(requestId: string): Promise<string> {
    const { data } = await db.from("requests").select("status").eq("id", requestId).single();
    return data!.status;
  }

  async function opportunitiesOf(requestId: string) {
    const { data } = await db.from("opportunities").select("id, status").eq("request_id", requestId);
    return data ?? [];
  }

  async function moveTo(opportunityId: string, status: string, lostReason?: string) {
    const response = await http()
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set(as(adminToken))
      .send({ status, lostReason })
      .expect(200);
    await eventBus.whenIdle();
    return response.body as OpportunityResponse;
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
    viewerToken = await signIn(
      config.getOrThrow<string>("E2E_VIEWER_EMAIL"),
      config.getOrThrow<string>("E2E_VIEWER_PASSWORD"),
    );
    adminId = (await http().get("/api/v1/users/me").set(as(adminToken)).expect(200)).body.id;
    salesId = await createSalesUser();

    const client = await http()
      .post("/api/v1/clients")
      .set(as(adminToken))
      .send({ companyName: `${run} SA`, country: "Suisse" })
      .expect(201);
    clientId = client.body.id;

    const form = await http()
      .post("/api/v1/forms")
      .set(as(adminToken))
      .send({ name: `${run}-form`, slug: `${run}-form` })
      .expect(201);
    testFormId = form.body.id;
    const step = await http()
      .post(`/api/v1/forms/${testFormId}/steps`)
      .set(as(adminToken))
      .send({ title: "Projet" })
      .expect(201);
    for (const field of [
      { key: "description", label: "Décrivez votre projet", type: "TEXTAREA", required: true },
      { key: "technologies", label: "Technologies souhaitées ou existantes", type: "TEXT" },
      { key: "budget", label: "Budget et délai", type: "TEXT" },
    ]) {
      await http()
        .post(`/api/v1/forms/${testFormId}/steps/${step.body.id}/fields`)
        .set(as(adminToken))
        .send(field)
        .expect(201);
    }
    await http().patch(`/api/v1/forms/${testFormId}`).set(as(adminToken)).send({ status: "PUBLISHED" }).expect(200);
  });

  afterAll(async () => {
    await eventBus.whenIdle();
    if (createdOpportunityIds.length > 0) {
      // Une opportunité sans demande n'est rattachée à rien qui cascade.
      await db.from("workflow_runs").delete().in("subject_id", createdOpportunityIds);
      await db.from("events").delete().in("entity_id", createdOpportunityIds);
      await db.from("opportunities").delete().in("id", createdOpportunityIds);
    }
    if (createdRequestIds.length > 0) await db.from("requests").delete().in("id", createdRequestIds);
    if (testFormId) await db.from("forms").delete().eq("id", testFormId);
    if (clientId) await db.from("clients").delete().eq("id", clientId);
    for (const id of createdAuthUserIds) await db.auth.admin.deleteUser(id);
    const imap = new ImapFlow({
      host: config.getOrThrow<string>("IMAP_HOST"),
      port: Number(config.getOrThrow<string>("IMAP_PORT")),
      secure: true,
      auth: { user: config.getOrThrow<string>("IMAP_USER"), pass: config.getOrThrow<string>("IMAP_PASSWORD") },
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

  describe("saisie manuelle et pipeline", () => {
    let opportunityId: string;

    it("création : droits, validation, valeurs par défaut (devise du pays du client, responsable)", async () => {
      await http().get("/api/v1/opportunities").expect(401);
      await http()
        .post("/api/v1/opportunities")
        .set(as(viewerToken))
        .send({ title: `${run} — refonte` })
        .expect(403);
      await http().post("/api/v1/opportunities").set(as(adminToken)).send({ description: "Sans titre" }).expect(400);
      await http()
        .post("/api/v1/opportunities")
        .set(as(adminToken))
        .send({ title: `${run} — client inconnu`, clientId: "00000000-0000-4000-8000-000000000000" })
        .expect(400);
      await http()
        .post("/api/v1/opportunities")
        .set(as(adminToken))
        .send({ title: `${run} — montant négatif`, estimatedValue: -5 })
        .expect(400);

      const created = await http()
        .post("/api/v1/opportunities")
        .set(as(adminToken))
        .send({ title: `${run} — refonte du site`, clientId, estimatedValue: 20000 })
        .expect(201);
      const opportunity = created.body as OpportunityResponse;
      opportunityId = opportunity.id;
      createdOpportunityIds.push(opportunityId);

      expect(opportunity).toEqual(
        expect.objectContaining({
          status: "NEW",
          clientCompanyName: `${run} SA`,
          currency: "CHF",
          probability: 10,
          estimatedValue: 20000,
          ownerUserId: adminId,
          requestId: null,
          closedAt: null,
        }),
      );

      const events = await opportunityEvents(opportunityId);
      expect(events.map((e) => e.type)).toContain("OPPORTUNITY_CREATED");
      expect(events.find((e) => e.type === "OPPORTUNITY_CREATED")?.actor_type).toBe("USER");
    });

    it("modification : responsable, valeur, probabilité ; lecture seule pour un observateur", async () => {
      await http()
        .patch(`/api/v1/opportunities/${opportunityId}`)
        .set(as(viewerToken))
        .send({ estimatedValue: 1 })
        .expect(403);
      await http().patch(`/api/v1/opportunities/${opportunityId}`).set(as(adminToken)).send({}).expect(400);
      await http()
        .patch(`/api/v1/opportunities/${opportunityId}`)
        .set(as(adminToken))
        .send({ probability: 150 })
        .expect(400);
      // Un observateur n'a pas le droit de gérer le pipeline : il ne peut pas en être responsable.
      const viewerId = (await http().get("/api/v1/users/me").set(as(viewerToken)).expect(200)).body.id;
      await http()
        .patch(`/api/v1/opportunities/${opportunityId}`)
        .set(as(adminToken))
        .send({ ownerUserId: viewerId })
        .expect(400);

      const updated = await http()
        .patch(`/api/v1/opportunities/${opportunityId}`)
        .set(as(adminToken))
        .send({ ownerUserId: salesId, estimatedValue: 24500.5, probability: 30, expectedCloseDate: "2026-12-15" })
        .expect(200);
      expect(updated.body).toEqual(
        expect.objectContaining({
          ownerUserId: salesId,
          ownerName: `Awa Test${tag}`,
          estimatedValue: 24500.5,
          probability: 30,
          expectedCloseDate: "2026-12-15",
        }),
      );

      const read = await http().get(`/api/v1/opportunities/${opportunityId}`).set(as(viewerToken)).expect(200);
      expect(read.body.title).toBe(`${run} — refonte du site`);
      await http()
        .get("/api/v1/opportunities/00000000-0000-4000-8000-000000000000")
        .set(as(adminToken))
        .expect(404);
      const owners = await http().get("/api/v1/opportunities/owners").set(as(viewerToken)).expect(200);
      expect(owners.body.map((o: { id: string }) => o.id)).toEqual(expect.arrayContaining([adminId, salesId]));
    });

    it("changement d'étape : persistant, tracé une seule fois, notifié au responsable", async () => {
      await http()
        .patch(`/api/v1/opportunities/${opportunityId}/stage`)
        .set(as(viewerToken))
        .send({ status: "NEGOTIATION" })
        .expect(403);
      await http()
        .patch(`/api/v1/opportunities/${opportunityId}/stage`)
        .set(as(adminToken))
        .send({ status: "PRESQUE_GAGNEE" })
        .expect(400);

      const moved = await moveTo(opportunityId, "NEGOTIATION");
      expect(moved).toEqual(expect.objectContaining({ status: "NEGOTIATION", probability: 75, closedAt: null }));
      // Déposer la carte dans sa propre colonne ne trace rien.
      await moveTo(opportunityId, "NEGOTIATION");

      const { data: row } = await db.from("opportunities").select("status").eq("id", opportunityId).single();
      expect(row?.status).toBe("NEGOTIATION");
      const changes = (await opportunityEvents(opportunityId)).filter((e) => e.type === "OPPORTUNITY_STAGE_CHANGED");
      expect(changes).toHaveLength(1);
      expect(changes[0]?.payload).toEqual(expect.objectContaining({ from: "NEW", to: "NEGOTIATION" }));

      const { data: notified } = await db
        .from("notifications")
        .select("channel, title, body, link, related_entity_type")
        .eq("user_id", salesId)
        .eq("event_type", "OPPORTUNITY_STAGE_CHANGED");
      expect(notified).toEqual([
        expect.objectContaining({
          channel: "IN_APP",
          link: `/opportunities/${opportunityId}`,
          related_entity_type: "opportunity",
        }),
      ]);
      expect(notified?.[0]?.title).toContain("Négociation");
      expect(notified?.[0]?.body).toContain("« Nouvelle » → « Négociation »");

      const timeline = await http()
        .get(`/api/v1/opportunities/${opportunityId}/timeline`)
        .set(as(viewerToken))
        .expect(200);
      const types = (timeline.body as TimelineEventResponse[]).map((e) => e.type);
      expect(types).toEqual(expect.arrayContaining(["OPPORTUNITY_CREATED", "OPPORTUNITY_STAGE_CHANGED", "TEAM_NOTIFIED"]));
      expect((timeline.body as TimelineEventResponse[]).find((e) => e.type === "OPPORTUNITY_STAGE_CHANGED")?.actorName).toBe(
        "Super Admin",
      );
    });

    it("gagnée puis rouverte puis perdue : jalons, dates de clôture, motif, notifications", async () => {
      const won = await moveTo(opportunityId, "WON");
      expect(won.status).toBe("WON");
      expect(won.probability).toBe(100);
      expect(won.closedAt).toBeTruthy();

      let events = await opportunityEvents(opportunityId);
      expect(events.filter((e) => e.type === "OPPORTUNITY_WON")).toHaveLength(1);
      const { data: wonNotifications } = await db
        .from("notifications")
        .select("channel, title")
        .eq("user_id", salesId)
        .eq("event_type", "OPPORTUNITY_WON");
      expect(wonNotifications?.map((n) => n.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
      expect(wonNotifications?.[0]?.title).toContain(`${run} — refonte du site`);
      // Pas de doublon « changement d'étape » pour une opportunité gagnée.
      const { count: stageNotifications } = await db
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", salesId)
        .eq("event_type", "OPPORTUNITY_STAGE_CHANGED");
      expect(stageNotifications).toBe(1);

      const reopened = await moveTo(opportunityId, "PROPOSAL_SENT");
      expect(reopened).toEqual(expect.objectContaining({ status: "PROPOSAL_SENT", probability: 60, closedAt: null }));

      const lost = await moveTo(opportunityId, "LOST", "Budget gelé jusqu'en 2027");
      expect(lost).toEqual(
        expect.objectContaining({ status: "LOST", probability: 0, lostReason: "Budget gelé jusqu'en 2027" }),
      );
      expect(lost.closedAt).toBeTruthy();
      events = await opportunityEvents(opportunityId);
      expect(events.find((e) => e.type === "OPPORTUNITY_LOST")?.payload).toEqual(
        expect.objectContaining({ lostReason: "Budget gelé jusqu'en 2027" }),
      );
      const { data: lostNotifications } = await db
        .from("notifications")
        .select("body")
        .eq("user_id", salesId)
        .eq("event_type", "OPPORTUNITY_LOST");
      expect(lostNotifications?.[0]?.body).toContain("Budget gelé jusqu'en 2027");

      // Le motif ne survit pas à une réouverture.
      const back = await moveTo(opportunityId, "NEGOTIATION");
      expect(back).toEqual(expect.objectContaining({ lostReason: null, closedAt: null }));
    });

    it("Kanban : colonnes dans l'ordre du pipeline, totaux par devise, filtres", async () => {
      const second = await http()
        .post("/api/v1/opportunities")
        .set(as(adminToken))
        .send({ title: `${run} — maintenance annuelle`, clientId, estimatedValue: 4000, ownerUserId: salesId })
        .expect(201);
      createdOpportunityIds.push(second.body.id);
      await moveTo(second.body.id, "NEGOTIATION");

      const response = await http()
        .get("/api/v1/opportunities/board")
        .query({ search: run })
        .set(as(viewerToken))
        .expect(200);
      const board = response.body as OpportunityBoardResponse;
      expect(board.columns.map((c) => c.status)).toEqual([
        "NEW",
        "QUALIFIED",
        "PROPOSAL_REQUIRED",
        "PROPOSAL_SENT",
        "NEGOTIATION",
        "WON",
        "LOST",
      ]);
      const negotiation = board.columns.find((c) => c.status === "NEGOTIATION")!;
      expect(negotiation.count).toBe(2);
      // 24 500,50 + 4 000 à 75 %.
      expect(negotiation.totals).toEqual([{ currency: "CHF", value: 28500.5, weightedValue: 21375.38 }]);
      // La plus récemment déplacée en tête.
      expect(negotiation.items.map((o) => o.id)).toEqual([second.body.id, opportunityId]);
      expect(board.columns.filter((c) => c.status !== "NEGOTIATION").every((c) => c.count === 0)).toBe(true);

      const byClient = await http()
        .get("/api/v1/opportunities")
        .query({ clientId, status: "NEGOTIATION" })
        .set(as(adminToken))
        .expect(200);
      expect(byClient.body.meta.total).toBe(2);
      const none = await http()
        .get("/api/v1/opportunities/board")
        .query({ search: `${run}-introuvable` })
        .set(as(adminToken))
        .expect(200);
      expect((none.body as OpportunityBoardResponse).columns.every((c) => c.count === 0)).toBe(true);
    });
  });

  describe("chaîne de la section 45 : formulaire → qualification → matching → opportunité", () => {
    let requestId: string;
    let opportunityId: string;

    beforeAll(async () => {
      const created = await http()
        .post("/api/v1/requests")
        .set(as(adminToken))
        .send({
          subject: `${run} — application de planification`,
          originalMessage:
            "Bonjour, nous voulons une application web métier pour planifier les interventions de nos techniciens.",
          language: "fr",
          clientId,
          assignedUserId: salesId,
        })
        .expect(201);
      requestId = created.body.id;
      createdRequestIds.push(requestId);
      const session = await http()
        .post(`/api/v1/requests/${requestId}/qualification-sessions`)
        .set(as(adminToken))
        .send({ formId: testFormId })
        .expect(201);
      const token = (session.body.qualificationUrl as string).split("/qualification/")[1]!;
      const answers = {
        description:
          "Application web interne pour 40 techniciens et 5 planificateurs : planning des interventions, " +
          "fiches client, suivi du stock de pièces, tableau de bord. Connexion par rôle, export PDF des rapports.",
        technologies:
          "Front en Next.js, API en NestJS, base PostgreSQL. Hébergement chez nous (Docker). Interface en français.",
        budget: "Budget validé de 60 000 CHF, mise en production souhaitée dans 5 mois.",
      };
      for (const [key, value] of Object.entries(answers)) {
        await http().put(`/api/v1/public/qualification/${token}/responses/${key}`).send({ value }).expect(200);
      }
      await http().post(`/api/v1/public/qualification/${token}/submit`).expect(201);
      await eventBus.whenIdle();
    });

    it("le matching terminé d'une demande qualifiée crée l'opportunité, sans intervention", async () => {
      const list = await http()
        .get("/api/v1/opportunities")
        .query({ requestId })
        .set(as(adminToken))
        .expect(200);
      expect(list.body.meta.total).toBe(1);
      const opportunity = list.body.data[0] as OpportunityResponse;
      opportunityId = opportunity.id;
      createdOpportunityIds.push(opportunityId);

      expect(opportunity).toEqual(
        expect.objectContaining({
          status: "QUALIFIED",
          probability: 25,
          title: `${run} — application de planification`,
          clientId,
          currency: "CHF",
          ownerUserId: salesId,
        }),
      );
      expect(opportunity.requestReference).toMatch(/^KPS-\d{4}-\d{5}$/);
      // Description de départ : le résumé de l'analyse Claude.
      expect((opportunity.description ?? "").length).toBeGreaterThan(20);

      const timeline = await http().get(`/api/v1/requests/${requestId}/timeline`).set(as(adminToken)).expect(200);
      const events = timeline.body as TimelineEventResponse[];
      const types = events.map((e) => e.type);
      expect(types.indexOf("MATCHING_COMPLETED")).toBeGreaterThan(-1);
      expect(types.indexOf("OPPORTUNITY_CREATED")).toBeGreaterThan(types.indexOf("MATCHING_COMPLETED"));
      expect(events.find((e) => e.type === "OPPORTUNITY_CREATED")?.actorType).toBe("AUTOMATION");

      // Le commercial en charge de la demande est notifié.
      const { data: notified } = await db
        .from("notifications")
        .select("channel, link")
        .eq("user_id", salesId)
        .eq("event_type", "OPPORTUNITY_CREATED");
      expect(notified).toEqual([{ channel: "IN_APP", link: `/opportunities/${opportunityId}` }]);
    });

    it("idempotent : matching relancé ou création demandée à nouveau → toujours une seule opportunité", async () => {
      await http().post(`/api/v1/requests/${requestId}/matching`).set(as(adminToken)).expect(201);
      await eventBus.whenIdle();
      expect(await opportunitiesOf(requestId)).toHaveLength(1);

      const { data: runs } = await db
        .from("workflow_runs")
        .select("status, steps_log, workflows!inner(key)")
        .eq("request_id", requestId)
        .eq("workflows.key", "opportunity-on-matching")
        .order("created_at", { ascending: true });
      const logs = (runs ?? []).map((r) => (r.steps_log as unknown as WorkflowStepLogEntry[])[0]?.status);
      expect(logs).toEqual(["DONE", "SKIPPED"]);

      const again = await http()
        .post("/api/v1/opportunities")
        .set(as(adminToken))
        .send({ requestId })
        .expect(201);
      expect(again.body.id).toBe(opportunityId);
      await eventBus.whenIdle();
      const { count } = await db
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("request_id", requestId)
        .eq("type", "OPPORTUNITY_CREATED");
      expect(count).toBe(1);
    });

    it("le statut de la demande suit l'étape de l'opportunité, visible dans sa timeline", async () => {
      await moveTo(opportunityId, "PROPOSAL_REQUIRED");
      expect(await requestStatus(requestId)).toBe("QUOTE_PENDING");
      await moveTo(opportunityId, "WON");
      expect(await requestStatus(requestId)).toBe("WON");

      const timeline = await http().get(`/api/v1/requests/${requestId}/timeline`).set(as(adminToken)).expect(200);
      const events = timeline.body as TimelineEventResponse[];
      const stages = events.filter((e) => e.type === "OPPORTUNITY_STAGE_CHANGED").map((e) => e.payload.to);
      expect(stages).toEqual(["PROPOSAL_REQUIRED", "WON"]);
      expect(events.some((e) => e.type === "OPPORTUNITY_WON")).toBe(true);
      const synced = events.filter(
        (e) => e.type === "REQUEST_STATUS_CHANGED" && ["QUOTE_PENDING", "WON"].includes(String(e.payload.to)),
      );
      expect(synced.map((e) => e.actorType)).toEqual(["AUTOMATION", "AUTOMATION"]);
    });
  });

  it("qualification manuelle : le matching qui suit crée aussi l'opportunité", async () => {
    const created = await http()
      .post("/api/v1/requests")
      .set(as(adminToken))
      .send({
        subject: `${run} — site vitrine`,
        originalMessage: "Création d'un site vitrine de 8 pages pour notre cabinet.",
        language: "fr",
        country: "France",
      })
      .expect(201);
    createdRequestIds.push(created.body.id);
    await http().patch(`/api/v1/requests/${created.body.id}`).set(as(adminToken)).send({ status: "QUALIFIED" }).expect(200);
    await eventBus.whenIdle();

    const list = await http()
      .get("/api/v1/opportunities")
      .query({ requestId: created.body.id })
      .set(as(viewerToken))
      .expect(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({
        status: "QUALIFIED",
        title: `${run} — site vitrine`,
        // Prospect sans fiche client : devise déduite du pays de la demande.
        clientId: null,
        currency: "EUR",
        ownerUserId: null,
      }),
    ]);
    createdOpportunityIds.push(list.body.data[0].id);

    // Perdue : la demande suit.
    await moveTo(list.body.data[0].id, "LOST", "Projet abandonné");
    expect(await requestStatus(created.body.id)).toBe("LOST");
  });

  it("matching lancé sur une demande non qualifiée : aucune opportunité", async () => {
    const created = await http()
      .post("/api/v1/requests")
      .set(as(adminToken))
      .send({ subject: `${run} — simple prise de contact`, originalMessage: "Bonjour, pouvez-vous me rappeler ?" })
      .expect(201);
    createdRequestIds.push(created.body.id);
    await http().post(`/api/v1/requests/${created.body.id}/matching`).set(as(adminToken)).expect(201);
    await eventBus.whenIdle();
    expect(await opportunitiesOf(created.body.id)).toHaveLength(0);

    // Créée à la main depuis la demande, elle entre à l'étape « Nouvelle ».
    const manual = await http()
      .post("/api/v1/opportunities")
      .set(as(adminToken))
      .send({ requestId: created.body.id })
      .expect(201);
    createdOpportunityIds.push(manual.body.id);
    expect(manual.body).toEqual(expect.objectContaining({ status: "NEW", requestId: created.body.id, clientId: null }));
  });
});
