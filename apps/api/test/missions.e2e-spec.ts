// Tests d'intégration des missions et des tâches (Phase 19, sections 45,
// 52, 53) : l'application complète contre la VRAIE base Supabase de dev,
// le vrai Workflow Engine et de vraies notifications (in-app et email).
// Aucun mock. Les collaborateurs sont de vrais comptes créés pour le test
// (alias « + » de la boîte de test), supprimés à la fin.
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
  MissionResponse,
  TaskCommentResponse,
  TaskResponse,
  TeamMemberDetailResponse,
  TimelineEventResponse,
  WorkflowStepLogEntry,
} from "@kps/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { EventBus } from "../src/events/event-bus.service";
import { SupabaseService } from "../src/supabase/supabase.service";

interface Member {
  id: string;
  token: string;
  name: string;
}

describe("Missions et tâches (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let eventBus: EventBus;
  let adminToken: string;
  let viewerToken: string;
  let paul: Member; // chef de projet
  let amadou: Member; // collaborateur
  let fatou: Member; // collaborateur
  let clientId: string;
  const tag = `s${Date.now()}`;
  const run = `e2e-mission-${tag}`;
  const createdAuthUserIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdOpportunityIds: string[] = [];
  const createdMissionIds: string[] = [];

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

  async function createMember(firstName: string, roleKey: string): Promise<Member> {
    const [local, domain] = config.getOrThrow<string>("SMTP_USER").split("@");
    const email = `${local}+${tag}-${firstName.toLowerCase()}@${domain}`;
    const password = `Pw-${tag}-${firstName}-9!`;
    const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    createdAuthUserIds.push(created.user.id);
    const { data: role } = await db.from("roles").select("id").eq("key", roleKey).single();
    await db.from("users").insert({
      id: created.user.id,
      email,
      first_name: firstName,
      last_name: `Test${tag}`,
      role_id: role!.id,
    });
    return { id: created.user.id, token: await signIn(email, password), name: `${firstName} Test${tag}` };
  }

  async function missionEvents(missionId: string) {
    await eventBus.whenIdle();
    const { data } = await db
      .from("events")
      .select("type, actor_type, payload")
      .eq("entity_type", "mission")
      .eq("entity_id", missionId)
      .order("created_at", { ascending: true });
    return data ?? [];
  }

  async function notifications(userId: string, eventType: Database["public"]["Enums"]["event_type"], missionId: string) {
    await eventBus.whenIdle();
    const { data } = await db
      .from("notifications")
      .select("channel, title, body, link")
      .eq("user_id", userId)
      .eq("event_type", eventType)
      .eq("related_entity_id", missionId);
    return data ?? [];
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
    paul = await createMember("Paul", "PROJECT_MANAGER");
    amadou = await createMember("Amadou", "TEAM_MEMBER");
    fatou = await createMember("Fatou", "TEAM_MEMBER");

    const client = await http()
      .post("/api/v1/clients")
      .set(as(adminToken))
      .send({ companyName: `${run} SA`, country: "Suisse" })
      .expect(201);
    clientId = client.body.id;
  });

  afterAll(async () => {
    await eventBus.whenIdle();
    const subjects = [...createdMissionIds, ...createdOpportunityIds];
    if (subjects.length > 0) {
      await db.from("workflow_runs").delete().in("subject_id", subjects);
      await db.from("events").delete().in("entity_id", subjects);
    }
    if (createdMissionIds.length > 0) await db.from("missions").delete().in("id", createdMissionIds);
    // Devis et missions liés partent avec leur opportunité (cascade).
    if (createdOpportunityIds.length > 0) await db.from("opportunities").delete().in("id", createdOpportunityIds);
    if (createdRequestIds.length > 0) await db.from("requests").delete().in("id", createdRequestIds);
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

  describe("mission saisie à la main", () => {
    let missionId: string;
    let taskId: string;

    it("création : droits, validation, chefs de projet notifiés", async () => {
      await http().get("/api/v1/missions").expect(401);
      await http().post("/api/v1/missions").set(as(viewerToken)).send({ title: `${run} — refonte` }).expect(403);
      await http().post("/api/v1/missions").set(as(amadou.token)).send({ title: `${run} — refonte` }).expect(403);
      await http().post("/api/v1/missions").set(as(adminToken)).send({ description: "Sans titre" }).expect(400);
      // Un collaborateur ne peut pas être chef de projet.
      await http()
        .post("/api/v1/missions")
        .set(as(adminToken))
        .send({ title: `${run} — refonte`, projectManagerId: amadou.id })
        .expect(400);

      const created = await http()
        .post("/api/v1/missions")
        .set(as(adminToken))
        .send({ title: `${run} — refonte du site`, clientId })
        .expect(201);
      const mission = created.body as MissionResponse;
      missionId = mission.id;
      createdMissionIds.push(missionId);
      expect(mission).toEqual(
        expect.objectContaining({
          status: "PLANNED",
          clientCompanyName: `${run} SA`,
          projectManagerId: null,
          members: [],
          tasksDone: 0,
          tasksTotal: 0,
          requestId: null,
        }),
      );

      expect((await missionEvents(missionId)).map((e) => e.type)).toContain("MISSION_CREATED");
      // Pas encore de chef de projet désigné : tous les chefs de projet sont prévenus.
      const notified = await notifications(paul.id, "MISSION_CREATED", missionId);
      expect(notified.map((n) => n.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
      expect(notified[0]?.link).toBe(`/missions/${missionId}`);

      const managers = await http().get("/api/v1/missions/managers").set(as(viewerToken)).expect(200);
      const managerIds = managers.body.map((m: { id: string }) => m.id);
      expect(managerIds).toContain(paul.id);
      expect(managerIds).not.toContain(amadou.id);
    });

    it("pilotage : chef de projet désigné et notifié, dates cohérentes, budget", async () => {
      await http().patch(`/api/v1/missions/${missionId}`).set(as(amadou.token)).send({ budget: 1 }).expect(403);
      await http().patch(`/api/v1/missions/${missionId}`).set(as(adminToken)).send({}).expect(400);
      await http()
        .patch(`/api/v1/missions/${missionId}`)
        .set(as(adminToken))
        .send({ startDate: "2026-11-01", endDate: "2026-10-01" })
        .expect(400);

      const updated = await http()
        .patch(`/api/v1/missions/${missionId}`)
        .set(as(adminToken))
        .send({
          projectManagerId: paul.id,
          startDate: "2026-11-01",
          endDate: "2027-02-28",
          budget: 42000,
          currency: "CHF",
          priority: "HIGH",
        })
        .expect(200);
      expect(updated.body).toEqual(
        expect.objectContaining({
          projectManagerName: paul.name,
          startDate: "2026-11-01",
          endDate: "2027-02-28",
          budget: 42000,
          priority: "HIGH",
        }),
      );
      // Une date de fin seule, antérieure au début déjà enregistré, est refusée.
      await http().patch(`/api/v1/missions/${missionId}`).set(as(paul.token)).send({ endDate: "2026-10-15" }).expect(400);

      const notified = await notifications(paul.id, "MISSION_ASSIGNED", missionId);
      expect(notified.map((n) => n.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
    });

    it("équipe : ajout notifié une seule fois, retrait, collaborateur inconnu refusé", async () => {
      await http()
        .post(`/api/v1/missions/${missionId}/members`)
        .set(as(amadou.token))
        .send({ userId: amadou.id })
        .expect(403);
      await http()
        .post(`/api/v1/missions/${missionId}/members`)
        .set(as(paul.token))
        .send({ userId: "00000000-0000-4000-8000-000000000000" })
        .expect(400);

      await http()
        .post(`/api/v1/missions/${missionId}/members`)
        .set(as(paul.token))
        .send({ userId: amadou.id, roleOnMission: "Développeur" })
        .expect(201);
      const again = await http()
        .post(`/api/v1/missions/${missionId}/members`)
        .set(as(paul.token))
        .send({ userId: amadou.id, roleOnMission: "Autre" })
        .expect(201);
      expect((again.body as MissionResponse).members).toEqual([
        { userId: amadou.id, fullName: amadou.name, roleOnMission: "Développeur" },
      ]);

      const assigned = (await missionEvents(missionId)).filter(
        (e) => e.type === "MISSION_ASSIGNED" && (e.payload as { userId?: string }).userId === amadou.id,
      );
      expect(assigned).toHaveLength(1);
      const notified = await notifications(amadou.id, "MISSION_ASSIGNED", missionId);
      expect(notified.map((n) => n.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
      expect(notified.find((n) => n.channel === "IN_APP")?.body).toContain(paul.name);

      await http().delete(`/api/v1/missions/${missionId}/members/${fatou.id}`).set(as(paul.token)).expect(404);
    });

    it("tâches : pilotées par le chef de projet, statut avancé par leur responsable", async () => {
      await http()
        .post(`/api/v1/missions/${missionId}/tasks`)
        .set(as(amadou.token))
        .send({ title: "Maquettes" })
        .expect(403);
      await http().post(`/api/v1/missions/${missionId}/tasks`).set(as(paul.token)).send({ title: " " }).expect(400);
      // Fatou n'est pas dans l'équipe de la mission.
      const refused = await http()
        .post(`/api/v1/missions/${missionId}/tasks`)
        .set(as(paul.token))
        .send({ title: "Maquettes", assigneeId: fatou.id })
        .expect(400);
      expect(refused.body.message).toContain("Ajoutez d'abord ce collaborateur");

      const created = await http()
        .post(`/api/v1/missions/${missionId}/tasks`)
        .set(as(paul.token))
        .send({ title: "Maquettes de la page d'accueil", assigneeId: amadou.id, dueDate: "2026-11-20", priority: "HIGH" })
        .expect(201);
      const task = created.body as TaskResponse;
      taskId = task.id;
      expect(task).toEqual(
        expect.objectContaining({ status: "TODO", assigneeName: amadou.name, dueDate: "2026-11-20", commentCount: 0 }),
      );
      const second = await http()
        .post(`/api/v1/missions/${missionId}/tasks`)
        .set(as(paul.token))
        .send({ title: "Rédaction des contenus" })
        .expect(201);
      const third = await http()
        .post(`/api/v1/missions/${missionId}/tasks`)
        .set(as(paul.token))
        .send({ title: "Tâche abandonnée" })
        .expect(201);
      await http().patch(`/api/v1/tasks/${third.body.id}`).set(as(paul.token)).send({ status: "CANCELLED" }).expect(200);

      const notified = await notifications(amadou.id, "TASK_ASSIGNED", missionId);
      expect(notified).toHaveLength(1);
      expect(notified[0]).toEqual(expect.objectContaining({ channel: "IN_APP" }));
      expect(notified[0]?.title).toContain("Maquettes de la page d'accueil");
      expect(notified[0]?.body).toContain("20.11.2026");

      // Page d'accueil : chacun ne retrouve que ses propres tâches ouvertes.
      const mine = await http().get("/api/v1/tasks/mine").set(as(amadou.token)).expect(200);
      expect(mine.body).toEqual([
        expect.objectContaining({ id: taskId, missionId, missionTitle: `${run} — refonte du site`, status: "TODO" }),
      ]);
      expect((await http().get("/api/v1/tasks/mine").set(as(fatou.token)).expect(200)).body).toEqual([]);
      await http().get("/api/v1/tasks/mine").expect(401);

      // Amadou fait avancer SA tâche, et rien d'autre.
      await http().patch(`/api/v1/tasks/${taskId}`).set(as(amadou.token)).send({ title: "Autre titre" }).expect(403);
      await http()
        .patch(`/api/v1/tasks/${taskId}`)
        .set(as(amadou.token))
        .send({ status: "DONE", dueDate: "2027-01-01" })
        .expect(403);
      await http().patch(`/api/v1/tasks/${second.body.id}`).set(as(amadou.token)).send({ status: "DONE" }).expect(403);
      await http().patch(`/api/v1/tasks/${taskId}`).set(as(fatou.token)).send({ status: "DONE" }).expect(403);
      await http().patch(`/api/v1/tasks/${taskId}`).set(as(amadou.token)).send({ status: "TERMINEE" }).expect(400);

      await http().patch(`/api/v1/tasks/${taskId}`).set(as(amadou.token)).send({ status: "IN_PROGRESS" }).expect(200);
      const done = await http().patch(`/api/v1/tasks/${taskId}`).set(as(amadou.token)).send({ status: "DONE" }).expect(200);
      expect(done.body.status).toBe("DONE");
      expect(done.body.completedAt).toBeTruthy();
      // Même statut : rien n'est tracé.
      await http().patch(`/api/v1/tasks/${taskId}`).set(as(amadou.token)).send({ status: "DONE" }).expect(200);

      // Terminée : elle quitte la liste des tâches ouvertes.
      expect((await http().get("/api/v1/tasks/mine").set(as(amadou.token)).expect(200)).body).toEqual([]);

      const changes = (await missionEvents(missionId)).filter(
        (e) => e.type === "TASK_STATUS_CHANGED" && (e.payload as { taskId?: string }).taskId === taskId,
      );
      expect(changes.map((e) => (e.payload as { to: string }).to)).toEqual(["IN_PROGRESS", "DONE"]);

      // Avancement : 1 terminée sur 2 (la tâche annulée ne compte pas).
      const mission = await http().get(`/api/v1/missions/${missionId}`).set(as(viewerToken)).expect(200);
      expect(mission.body).toEqual(expect.objectContaining({ tasksDone: 1, tasksTotal: 2 }));
      const list = await http().get(`/api/v1/missions/${missionId}/tasks`).set(as(viewerToken)).expect(200);
      expect((list.body as TaskResponse[]).map((t) => t.title)).toEqual([
        "Maquettes de la page d'accueil",
        "Rédaction des contenus",
        "Tâche abandonnée",
      ]);

      await http().delete(`/api/v1/tasks/${third.body.id}`).set(as(amadou.token)).expect(403);
      await http().delete(`/api/v1/tasks/${third.body.id}`).set(as(paul.token)).expect(204);
      await http().delete(`/api/v1/tasks/${third.body.id}`).set(as(paul.token)).expect(404);
    });

    it("commentaires : réservés à l'équipe de la mission et à ses pilotes", async () => {
      await http()
        .post(`/api/v1/tasks/${taskId}/comments`)
        .set(as(amadou.token))
        .send({ body: "Maquettes déposées dans le dossier partagé." })
        .expect(201);
      await http().post(`/api/v1/tasks/${taskId}/comments`).set(as(fatou.token)).send({ body: "Je passe." }).expect(403);
      await http().post(`/api/v1/tasks/${taskId}/comments`).set(as(viewerToken)).send({ body: "Je passe." }).expect(403);
      await http().post(`/api/v1/tasks/${taskId}/comments`).set(as(paul.token)).send({ body: "  " }).expect(400);
      const comments = await http()
        .post(`/api/v1/tasks/${taskId}/comments`)
        .set(as(paul.token))
        .send({ body: "Validé, merci." })
        .expect(201);
      expect((comments.body as TaskCommentResponse[]).map((c) => [c.authorName, c.body])).toEqual([
        [amadou.name, "Maquettes déposées dans le dossier partagé."],
        [paul.name, "Validé, merci."],
      ]);
      const read = await http().get(`/api/v1/tasks/${taskId}/comments`).set(as(viewerToken)).expect(200);
      expect(read.body).toHaveLength(2);
      const tasks = await http().get(`/api/v1/missions/${missionId}/tasks`).set(as(adminToken)).expect(200);
      expect((tasks.body as TaskResponse[]).find((t) => t.id === taskId)?.commentCount).toBe(2);
    });

    it("statut : tracé une fois, blocage notifié avec son motif, fin datée", async () => {
      await http()
        .patch(`/api/v1/missions/${missionId}/status`)
        .set(as(amadou.token))
        .send({ status: "IN_PROGRESS" })
        .expect(403);
      await http()
        .patch(`/api/v1/missions/${missionId}/status`)
        .set(as(paul.token))
        .send({ status: "PRESQUE_FINIE" })
        .expect(400);

      await http().patch(`/api/v1/missions/${missionId}/status`).set(as(paul.token)).send({ status: "IN_PROGRESS" }).expect(200);
      await http().patch(`/api/v1/missions/${missionId}/status`).set(as(paul.token)).send({ status: "IN_PROGRESS" }).expect(200);
      const blocked = await http()
        .patch(`/api/v1/missions/${missionId}/status`)
        .set(as(adminToken))
        .send({ status: "BLOCKED", reason: "Contenus non livrés par le client" })
        .expect(200);
      expect(blocked.body).toEqual(
        expect.objectContaining({ status: "BLOCKED", blockedReason: "Contenus non livrés par le client" }),
      );

      const events = await missionEvents(missionId);
      expect(
        events.filter((e) => e.type === "MISSION_STATUS_CHANGED").map((e) => (e.payload as { to: string }).to),
      ).toEqual(["IN_PROGRESS", "BLOCKED"]);
      expect(events.filter((e) => e.type === "MISSION_BLOCKED")).toHaveLength(1);
      // Le chef de projet désigné est prévenu (et non tous les chefs de projet).
      const notified = await notifications(paul.id, "MISSION_BLOCKED", missionId);
      expect(notified.map((n) => n.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
      expect(notified[0]?.body).toContain("Contenus non livrés par le client");

      const completed = await http()
        .patch(`/api/v1/missions/${missionId}/status`)
        .set(as(paul.token))
        .send({ status: "COMPLETED" })
        .expect(200);
      expect(completed.body.completedAt).toBeTruthy();
      expect(completed.body.blockedReason).toBeNull();
    });

    it("retrait d'un membre : ses tâches en cours sont libérées, l'historique est complet", async () => {
      const open = await http()
        .post(`/api/v1/missions/${missionId}/tasks`)
        .set(as(paul.token))
        .send({ title: "Intégration", assigneeId: amadou.id })
        .expect(201);
      const removed = await http()
        .delete(`/api/v1/missions/${missionId}/members/${amadou.id}`)
        .set(as(paul.token))
        .expect(200);
      expect((removed.body as MissionResponse).members).toEqual([]);

      const tasks = (await http().get(`/api/v1/missions/${missionId}/tasks`).set(as(adminToken)).expect(200))
        .body as TaskResponse[];
      expect(tasks.find((t) => t.id === open.body.id)?.assigneeId).toBeNull();
      // La tâche déjà terminée garde son auteur.
      expect(tasks.find((t) => t.id === taskId)?.assigneeId).toBe(amadou.id);

      const timeline = await http().get(`/api/v1/missions/${missionId}/timeline`).set(as(viewerToken)).expect(200);
      const types = (timeline.body as TimelineEventResponse[]).map((e) => e.type);
      expect(types).toEqual(
        expect.arrayContaining([
          "MISSION_CREATED",
          "MISSION_ASSIGNED",
          "TASK_CREATED",
          "TASK_ASSIGNED",
          "TASK_STATUS_CHANGED",
          "MISSION_STATUS_CHANGED",
          "MISSION_BLOCKED",
          "MISSION_MEMBER_REMOVED",
        ]),
      );
    });

    it("liste et profils : filtres, missions du chef de projet et des collaborateurs", async () => {
      const mine = await http().get("/api/v1/missions").query({ memberId: paul.id }).set(as(viewerToken)).expect(200);
      expect(mine.body.data.map((m: { id: string }) => m.id)).toEqual([missionId]);
      const none = await http().get("/api/v1/missions").query({ memberId: fatou.id }).set(as(adminToken)).expect(200);
      expect(none.body.meta.total).toBe(0);
      const byStatus = await http()
        .get("/api/v1/missions")
        .query({ search: run, status: "COMPLETED", clientId })
        .set(as(adminToken))
        .expect(200);
      expect(byStatus.body.data).toEqual([
        expect.objectContaining({ id: missionId, tasksDone: 1, tasksTotal: 3, memberCount: 0 }),
      ]);
      const planned = await http().get("/api/v1/missions").query({ search: run, status: "PLANNED" }).set(as(adminToken)).expect(200);
      expect(planned.body.meta.total).toBe(0);
      await http().get("/api/v1/missions/00000000-0000-4000-8000-000000000000").set(as(adminToken)).expect(404);

      const profile = (await http().get(`/api/v1/team/${paul.id}`).set(as(adminToken)).expect(200))
        .body as TeamMemberDetailResponse;
      expect(profile.missions).toEqual([
        expect.objectContaining({ missionId, isProjectManager: true, status: "COMPLETED", clientCompanyName: `${run} SA` }),
      ]);
    });
  });

  describe("chaîne de la section 45 : opportunité gagnée → mission", () => {
    let requestId: string;
    let opportunityId: string;
    let missionId: string;

    beforeAll(async () => {
      const created = await http()
        .post("/api/v1/requests")
        .set(as(adminToken))
        .send({ subject: `${run} — application de planification`, originalMessage: "Besoin d'une application métier.", clientId })
        .expect(201);
      requestId = created.body.id;
      createdRequestIds.push(requestId);
      // Équipe affectée à la demande (décision humaine de la Phase 16).
      await http().post(`/api/v1/requests/${requestId}/team-members`).set(as(adminToken)).send({ userId: fatou.id }).expect(201);
      const opportunity = await http().post("/api/v1/opportunities").set(as(adminToken)).send({ requestId }).expect(201);
      opportunityId = opportunity.body.id;
      createdOpportunityIds.push(opportunityId);
      await http()
        .patch(`/api/v1/opportunities/${opportunityId}`)
        .set(as(adminToken))
        .send({ estimatedValue: 20000 })
        .expect(200);
      // Devis accepté posé en base : son montant HT devient le budget.
      await db.from("quotes").insert({
        opportunity_id: opportunityId,
        client_id: clientId,
        title: `${run} — devis accepté`,
        status: "ACCEPTED",
        subtotal: 10000,
        discount: 500,
        tax_amount: 769.5,
        total: 10269.5,
        accepted_at: new Date().toISOString(),
      });
      await eventBus.whenIdle();
    });

    it("gagner l'opportunité crée la mission avec l'équipe de la demande ; la demande est convertie", async () => {
      await http()
        .patch(`/api/v1/opportunities/${opportunityId}/stage`)
        .set(as(adminToken))
        .send({ status: "WON" })
        .expect(200);
      await eventBus.whenIdle();

      const list = await http().get("/api/v1/missions").query({ opportunityId }).set(as(viewerToken)).expect(200);
      expect(list.body.meta.total).toBe(1);
      missionId = list.body.data[0].id;
      const mission = (await http().get(`/api/v1/missions/${missionId}`).set(as(adminToken)).expect(200))
        .body as MissionResponse;
      expect(mission).toEqual(
        expect.objectContaining({
          status: "PLANNED",
          title: `${run} — application de planification`,
          clientId,
          budget: 9500,
          currency: "CHF",
          projectManagerId: null,
          requestId,
          members: [{ userId: fatou.id, fullName: fatou.name, roleOnMission: null }],
        }),
      );
      expect(mission.requestReference).toMatch(/^KPS-\d{4}-\d{5}$/);

      const { data: row } = await db.from("requests").select("status").eq("id", requestId).single();
      expect(row?.status).toBe("CONVERTED_TO_MISSION");

      const timeline = await http().get(`/api/v1/requests/${requestId}/timeline`).set(as(adminToken)).expect(200);
      const events = timeline.body as TimelineEventResponse[];
      const types = events.map((e) => e.type);
      expect(types.indexOf("MISSION_CREATED")).toBeGreaterThan(types.indexOf("OPPORTUNITY_WON"));
      expect(events.find((e) => e.type === "MISSION_CREATED")?.actorType).toBe("AUTOMATION");

      // L'équipe reprise de la demande est prévenue, comme les chefs de projet.
      expect((await notifications(fatou.id, "MISSION_ASSIGNED", missionId)).map((n) => n.channel).sort()).toEqual([
        "EMAIL",
        "IN_APP",
      ]);
      expect((await notifications(paul.id, "MISSION_CREATED", missionId)).length).toBe(2);
      const profile = (await http().get(`/api/v1/team/${fatou.id}`).set(as(adminToken)).expect(200))
        .body as TeamMemberDetailResponse;
      expect(profile.missions.map((m) => m.missionId)).toEqual([missionId]);
    });

    it("idempotent : opportunité rouverte puis regagnée, ou création redemandée → une seule mission", async () => {
      for (const status of ["NEGOTIATION", "WON"]) {
        await http().patch(`/api/v1/opportunities/${opportunityId}/stage`).set(as(adminToken)).send({ status }).expect(200);
        await eventBus.whenIdle();
      }
      const { count } = await db
        .from("missions")
        .select("id", { count: "exact", head: true })
        .eq("opportunity_id", opportunityId);
      expect(count).toBe(1);

      const { data: runs } = await db
        .from("workflow_runs")
        .select("steps_log, workflows!inner(key)")
        .eq("subject_id", opportunityId)
        .eq("workflows.key", "mission-on-opportunity-won")
        .order("created_at", { ascending: true });
      expect((runs ?? []).map((r) => (r.steps_log as unknown as WorkflowStepLogEntry[])[0]?.status)).toEqual([
        "DONE",
        "SKIPPED",
      ]);

      const again = await http().post("/api/v1/missions").set(as(paul.token)).send({ opportunityId }).expect(201);
      expect(again.body.id).toBe(missionId);
      // La demande convertie ne redevient pas « Gagnée » ni « Négociation ».
      const { data: row } = await db.from("requests").select("status").eq("id", requestId).single();
      expect(row?.status).toBe("CONVERTED_TO_MISSION");
      const { count: created } = await db
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("request_id", requestId)
        .eq("type", "MISSION_CREATED");
      expect(created).toBe(1);
    });
  });
});
