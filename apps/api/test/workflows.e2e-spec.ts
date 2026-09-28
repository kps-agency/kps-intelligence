// Tests d'intégration du Workflow Engine (Phase 15, sections 39, 45, 46) :
// l'application complète contre la VRAIE base Supabase de dev, un vrai
// Redis (étapes différées BullMQ), de vrais appels à Claude et de vrais
// emails vérifiés par IMAP. Aucun mock : les délais de relance sont
// raccourcis en modifiant réellement le workflow par l'API (restauré à la
// fin), exactement comme un administrateur le ferait.
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
import { simpleParser } from "mailparser";
import request from "supertest";
import { EventActorType, EventEntityType, EventType, RequestSource } from "@kps/types";
import type { Database, WorkflowResponse, WorkflowRunResponse } from "@kps/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { ConversationsService } from "../src/conversations/conversations.service";
import { AUTOMATION_ACTOR, EventBus } from "../src/events/event-bus.service";
import { QualificationSessionsService } from "../src/qualification-sessions/qualification-sessions.service";
import { RequestsService } from "../src/requests/requests.service";
import { SupabaseService } from "../src/supabase/supabase.service";
import { WorkflowEngine } from "../src/workflows/workflow-engine.service";

const WEBSITE_REQUEST =
  "Bonjour, nous souhaitons créer le site vitrine de notre cabinet d'architectes à Genève : " +
  "6 pages, portfolio de projets, formulaire de contact, FR/EN. Budget 8000 CHF.";

type RunRow = Database["public"]["Tables"]["workflow_runs"]["Row"];

describe("Workflow Engine (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let eventBus: EventBus;
  let adminToken: string;
  let viewerToken: string;
  const tag = `w${Date.now()}`;
  const run = `e2e-wf-${tag}`;
  const createdRequestIds: string[] = [];
  const createdClientIds: string[] = [];
  let testFormId: string;
  const originals = new Map<string, WorkflowResponse>();

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signIn(emailKey: string, passwordKey: string): Promise<string> {
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

  function workflow(key: string): WorkflowResponse {
    const found = originals.get(key);
    if (!found) throw new Error(`Workflow ${key} absent`);
    return found;
  }

  function putWorkflow(key: string, changes: Partial<WorkflowResponse>) {
    const current = workflow(key);
    const next = { ...current, ...changes };
    return http()
      .put(`/api/v1/workflows/${current.id}`)
      .set(as(adminToken))
      .send({
        name: next.name,
        description: next.description,
        isActive: next.isActive,
        conditions: next.conditions,
        steps: next.steps,
        cancelOn: next.cancelOn,
      });
  }

  // Relances raccourcies : mêmes étapes, conditions et actions que la
  // version livrée, seuls les délais changent.
  async function shortenReminders(delayMinutes: number): Promise<void> {
    const reminders = workflow("qualification-reminders");
    await putWorkflow("qualification-reminders", {
      steps: reminders.steps.map((step) => ({ ...step, delayMinutes })),
    }).expect(200);
  }

  async function runsFor(workflowKey: string, subjectId: string): Promise<RunRow[]> {
    const { data } = await db
      .from("workflow_runs")
      .select("*")
      .eq("workflow_id", workflow(workflowKey).id)
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: true });
    return data ?? [];
  }

  async function waitForRun(
    workflowKey: string,
    subjectId: string,
    predicate: (run: RunRow) => boolean,
    timeoutMs = 60000,
  ): Promise<RunRow> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await eventBus.whenIdle();
      const runs = await runsFor(workflowKey, subjectId);
      const match = runs.find(predicate);
      if (match) return match;
      if (Date.now() > deadline) {
        throw new Error(`Exécution attendue introuvable : ${JSON.stringify(runs.map((r) => [r.status, r.steps_log]))}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  async function createClientWithContact(email: string): Promise<{ clientId: string; contactId: string }> {
    const { data: client } = await db
      .from("clients")
      .insert({ company_name: `${run}-client-${email.split("@")[0]}` })
      .select("id")
      .single();
    createdClientIds.push(client!.id);
    const { data: contact } = await db
      .from("contacts")
      .insert({ client_id: client!.id, first_name: "Alice", last_name: "Martin", email })
      .select("id")
      .single();
    return { clientId: client!.id, contactId: contact!.id };
  }

  // Demande manuelle liée à un contact (adresse = alias de la boîte de
  // test), lien créé puis marqué envoyé : déclenche la chaîne de relances.
  async function sentLink(label: string): Promise<{ requestId: string; sessionId: string; token: string; email: string }> {
    const [local, domain] = config.getOrThrow<string>("SMTP_USER").split("@");
    const email = `${local}+${tag}-${label}@${domain}`.toLowerCase();
    const { clientId, contactId } = await createClientWithContact(email);
    const created = await http()
      .post("/api/v1/requests")
      .set(as(adminToken))
      .send({ subject: `${run} — ${label}`, originalMessage: "Demande de test.", clientId, contactId })
      .expect(201);
    createdRequestIds.push(created.body.id);
    const session = await http()
      .post(`/api/v1/requests/${created.body.id}/qualification-sessions`)
      .set(as(adminToken))
      .send({ formId: testFormId })
      .expect(201);
    await http()
      .post(`/api/v1/qualification-sessions/${session.body.id}/mark-sent`)
      .set(as(adminToken))
      .expect(201);
    return {
      requestId: created.body.id,
      sessionId: session.body.id,
      token: (session.body.qualificationUrl as string).split("/qualification/")[1]!,
      email,
    };
  }

  async function withImap<T>(fn: (imap: ImapFlow) => Promise<T>): Promise<T> {
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
      return await fn(imap);
    } finally {
      lock.release();
      await imap.logout().catch(() => undefined);
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    config = app.get(ConfigService);
    db = app.get(SupabaseService).getClient();
    eventBus = app.get(EventBus);
    adminToken = await signIn("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD");
    viewerToken = await signIn("E2E_VIEWER_EMAIL", "E2E_VIEWER_PASSWORD");

    const list = await http().get("/api/v1/workflows").set(as(adminToken)).expect(200);
    for (const wf of list.body as WorkflowResponse[]) if (wf.key) originals.set(wf.key, wf);

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
    // Définitions livrées restaurées à l'identique.
    for (const key of originals.keys()) await putWorkflow(key, {});
    await eventBus.whenIdle();
    if (createdRequestIds.length > 0) {
      await db.from("conversations").delete().in("request_id", createdRequestIds);
      await db.from("requests").delete().in("id", createdRequestIds);
    }
    if (createdClientIds.length > 0) await db.from("clients").delete().in("id", createdClientIds);
    if (testFormId) await db.from("forms").delete().eq("id", testFormId);
    await withImap(async (imap) => {
      const uids = await imap.search({ to: tag }, { uid: true });
      if (Array.isArray(uids) && uids.length > 0) await imap.messageDelete(uids, { uid: true });
      const inbound = await imap.search({ header: { "in-reply-to": `<${run}` } }, { uid: true });
      if (Array.isArray(inbound) && inbound.length > 0) await imap.messageDelete(inbound, { uid: true });
    });
    await app.close();
  });

  describe("API", () => {
    it("les workflows livrés sont exposés avec leur définition", async () => {
      expect([...originals.keys()]).toEqual(
        expect.arrayContaining([
          "qualification-auto-send",
          "qualification-reminders",
          "qualification-required",
          "qualification-analysis",
          "matching-on-qualified",
        ]),
      );
      const reminders = workflow("qualification-reminders");
      expect(reminders.triggerEvent).toBe("QUALIFICATION_LINK_SENT");
      expect(reminders.steps.map((s) => [s.delayMinutes, s.action.params.channel])).toEqual([
        [2880, "EMAIL"],
        [1440, "WHATSAPP"],
      ]);
      expect(reminders.cancelOn).toContain("FORM_COMPLETED");
      expect(workflow("qualification-required").conditions).toEqual([
        { field: "event.payload.confidence", operator: "gte", value: 0.6 },
      ]);
    });

    it("RBAC : lecture refusée au VIEWER, modification refusée hors admins, 401 sans jeton", async () => {
      await http().get("/api/v1/workflows").expect(401);
      await http().get("/api/v1/workflows").set(as(viewerToken)).expect(403);
      await http()
        .put(`/api/v1/workflows/${workflow("qualification-required").id}`)
        .set(as(viewerToken))
        .send({})
        .expect(403);
    });

    it("une définition hors vocabulaire est refusée, avec le détail de chaque erreur", async () => {
      const response = await putWorkflow("qualification-required", {
        conditions: [{ field: "request.password", operator: "eq", value: "x" }],
        steps: [{ delayMinutes: -1, conditions: [], action: { type: "DROP_TABLE", params: {} } }],
      }).expect(400);
      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining("champ inconnu"),
          expect.stringContaining("délai"),
          expect.stringContaining("action inconnue"),
        ]),
      );
      // Rien n'a été enregistré.
      const current = await http()
        .get(`/api/v1/workflows/${workflow("qualification-required").id}`)
        .set(as(adminToken))
        .expect(200);
      expect(current.body.conditions).toEqual(workflow("qualification-required").conditions);
    });
  });

  it(
    "la qualification automatique est pilotée par le workflow en base (désactivable sans code)",
    async () => {
      const requestsService = app.get(RequestsService);
      const conversations = app.get(ConversationsService);
      const inbox = config.getOrThrow<string>("SMTP_USER");

      async function inboundRequest(suffix: string): Promise<string> {
        const messageId = `<${run}-${suffix}@example.test>`;
        const { request: created } = await requestsService.createFromInbound({
          source: RequestSource.EMAIL,
          channel: "gmail",
          subject: `${run} — ${suffix}`,
          originalMessage: WEBSITE_REQUEST,
          language: null,
          country: null,
          clientId: null,
          contactId: null,
          emailMessageId: messageId,
        });
        createdRequestIds.push(created.id);
        await conversations.startForRequest("EMAIL", created, {
          fromAddress: inbox,
          fromName: "Alice Martin",
          toAddress: inbox,
          subject: `${run} — ${suffix}`,
          body: WEBSITE_REQUEST,
          externalMessageId: messageId,
          externalThreadId: null,
          sentAt: new Date().toISOString(),
        });
        await requestsService.analyze(created.id, AUTOMATION_ACTOR);
        await eventBus.whenIdle();
        return created.id;
      }

      async function types(requestId: string): Promise<string[]> {
        const { data } = await db.from("events").select("type").eq("request_id", requestId);
        return (data ?? []).map((e) => e.type);
      }

      // Workflow désactivé : le service est identifié, rien d'autre.
      await putWorkflow("qualification-required", { isActive: false }).expect(200);
      const off = await inboundRequest("wf-off");
      expect(await types(off)).toContain("SERVICE_DETECTED");
      expect(await types(off)).not.toContain("QUALIFICATION_REQUIRED");

      // Réactivé : même demande type → qualification requise puis envoi.
      await putWorkflow("qualification-required", { isActive: true }).expect(200);
      const on = await inboundRequest("wf-on");
      expect(await types(on)).toEqual(
        expect.arrayContaining(["QUALIFICATION_REQUIRED", "QUALIFICATION_LINK_SENT"]),
      );

      // Chaque exécution est tracée, étape par étape.
      const runs = await http()
        .get(`/api/v1/workflows/${workflow("qualification-auto-send").id}/runs`)
        .set(as(adminToken))
        .expect(200);
      const sendRun = (runs.body as WorkflowRunResponse[]).find((r) => r.requestId === on);
      expect(sendRun?.status).toBe("COMPLETED");
      expect(sendRun?.stepsLog).toEqual([
        expect.objectContaining({ index: 0, status: "DONE", detail: "Lien envoyé par email." }),
      ]);
      expect(sendRun?.requestReference).toMatch(/^KPS-/);
    },
    180000,
  );

  it(
    "relances : email réel au délai, nouveau lien valide, ancien invalidé, WhatsApp ignoré sans numéro",
    async () => {
      await shortenReminders(0.05);
      const { requestId, sessionId, token, email } = await sentLink("relance");

      const done = await waitForRun("qualification-reminders", sessionId, (r) => r.status === "COMPLETED", 90000);
      const log = done.steps_log as { index: number; status: string; detail: string }[];
      expect(log.map((s) => [s.index, s.status])).toEqual([
        [0, "DONE"],
        [1, "SKIPPED"],
      ]);
      expect(log[0]!.detail).toBe("Relance envoyée par email.");
      expect(log[1]!.detail).toBe("Aucune adresse WhatsApp connue pour le prospect.");

      const { data: events } = await db
        .from("events")
        .select("type, actor_type, payload")
        .eq("request_id", requestId)
        .eq("type", "QUALIFICATION_REMINDER_SENT");
      expect(events).toEqual([
        expect.objectContaining({ actor_type: "AUTOMATION", payload: expect.objectContaining({ channel: "EMAIL" }) }),
      ]);

      // L'email de relance est réellement arrivé ; son lien fonctionne, et
      // l'ancien (jamais ouvert) ne fonctionne plus.
      const newToken = await withImap(async (imap) => {
        const deadline = Date.now() + 45000;
        for (;;) {
          const uids = await imap.search({ to: email, subject: "Rappel" }, { uid: true });
          if (Array.isArray(uids) && uids.length > 0) {
            const message = await imap.fetchOne(String(uids[0]), { source: true }, { uid: true });
            const parsed = await simpleParser(message ? (message.source as Buffer) : Buffer.from(""));
            return /\/qualification\/([A-Za-z0-9_-]+)/.exec(parsed.text ?? "")?.[1] ?? null;
          }
          if (Date.now() > deadline) return null;
          await new Promise((r) => setTimeout(r, 2000));
        }
      });
      expect(newToken).toBeTruthy();
      expect(newToken).not.toBe(token);
      await http().get(`/api/v1/public/qualification/${newToken}`).expect(200);
      await http().get(`/api/v1/public/qualification/${token}`).expect(404);
    },
    180000,
  );

  it(
    "annulation : le prospect ouvre le lien avant l'échéance → aucune relance",
    async () => {
      await shortenReminders(0.25);
      const { requestId, sessionId, token } = await sentLink("annulation");

      await waitForRun("qualification-reminders", sessionId, (r) => r.status === "WAITING");
      await http().get(`/api/v1/public/qualification/${token}`).expect(200);

      const cancelled = await waitForRun("qualification-reminders", sessionId, (r) => r.status === "CANCELLED");
      expect(cancelled.error).toBe("Annulée : QUALIFICATION_LINK_OPENED.");

      // Au-delà de l'échéance initiale : toujours rien.
      await new Promise((r) => setTimeout(r, 20000));
      const { count } = await db
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("request_id", requestId)
        .eq("type", "QUALIFICATION_REMINDER_SENT");
      expect(count).toBe(0);
    },
    120000,
  );

  it("un lien régénéré et renvoyé remplace la chaîne de relances précédente", async () => {
    await shortenReminders(30);
    const { sessionId } = await sentLink("remplacement");
    await waitForRun("qualification-reminders", sessionId, (r) => r.status === "WAITING");

    await http()
      .post(`/api/v1/qualification-sessions/${sessionId}/regenerate`)
      .set(as(adminToken))
      .expect(201);
    await http()
      .post(`/api/v1/qualification-sessions/${sessionId}/mark-sent`)
      .set(as(adminToken))
      .expect(201);
    await eventBus.whenIdle();

    const runs = await runsFor("qualification-reminders", sessionId);
    expect(runs.map((r) => r.status)).toEqual(["CANCELLED", "WAITING"]);
    expect(runs[0]!.error).toBe("Remplacée par une exécution plus récente.");
  });

  it("un événement rejoué ne crée pas de seconde exécution (section 63)", async () => {
    const { sessionId } = await sentLink("rejeu");
    await eventBus.whenIdle();
    const { data: sent } = await db
      .from("events")
      .select("*")
      .eq("entity_id", sessionId)
      .eq("type", "QUALIFICATION_LINK_SENT")
      .single();

    const engine = app.get(WorkflowEngine);
    await engine.onEvent({
      id: sent!.id,
      type: EventType.QUALIFICATION_LINK_SENT,
      entityType: EventEntityType.QUALIFICATION_SESSION,
      entityId: sessionId,
      requestId: sent!.request_id,
      actor: { type: sent!.actor_type as EventActorType, id: sent!.actor_id },
      payload: sent!.payload as Record<string, string>,
      createdAt: sent!.created_at,
    });

    const runs = await runsFor("qualification-reminders", sessionId);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("WAITING");
  });

  it("une relance qui échoue restaure l'ancien lien : celui déjà reçu par le prospect reste valide", async () => {
    const { sessionId, token } = await sentLink("echec");
    const sessions = app.get(QualificationSessionsService);

    await expect(
      sessions.withFreshLink(sessionId, async () => {
        throw new Error("envoi impossible");
      }),
    ).rejects.toThrow("envoi impossible");
    await http().get(`/api/v1/public/qualification/${token}`).expect(200);
  });
});
