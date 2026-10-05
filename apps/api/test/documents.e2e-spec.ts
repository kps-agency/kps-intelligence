// Tests d'intégration des documents (Phase 20, sections 54 et 60) :
// l'application complète contre la VRAIE base Supabase de dev et le VRAI
// Supabase Storage (bucket privé `documents`) — fichiers réellement
// déposés, retéléchargés par lien signé et comparés octet pour octet.
// Aucun mock. Tout ce qui est déposé est supprimé à la fin.
//
// Prérequis : .env complet et `docker compose up -d redis`.
// Lancer : pnpm --filter @kps/api test:e2e

process.env.LOG_LEVEL = "silent";
process.env.RATE_LIMIT_MAX = "5000";

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import type { Database, DocumentResponse, TimelineEventResponse } from "@kps/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { EventBus } from "../src/events/event-bus.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const PDF = Buffer.from("%PDF-1.4\n% cahier des charges de test\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]);

describe("Documents (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let eventBus: EventBus;
  let adminToken: string;
  let viewerToken: string;
  let salesToken: string;
  let amadouToken: string;
  let amadouId: string;
  let clientId: string;
  let opportunityId: string;
  let missionId: string;
  let taskId: string;
  const tag = `d${Date.now()}`;
  const run = `e2e-doc-${tag}`;
  const createdAuthUserIds: string[] = [];

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

  async function createUser(firstName: string, roleKey: string): Promise<{ id: string; token: string }> {
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
    return { id: created.user.id, token: await signIn(email, password) };
  }

  function upload(
    token: string,
    target: { entityType: string; entityId: string },
    file: { name: string; type: string; content: Buffer },
  ) {
    return http()
      .post("/api/v1/documents")
      .set(as(token))
      .field("entityType", target.entityType)
      .field("entityId", target.entityId)
      .attach("file", file.content, { filename: file.name, contentType: file.type });
  }

  const list = (token: string, entityType: string, entityId: string) =>
    http().get("/api/v1/documents").query({ entityType, entityId }).set(as(token));

  async function entityIds(): Promise<string[]> {
    return [opportunityId, missionId, taskId, clientId].filter(Boolean);
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
    salesToken = (await createUser("Awa", "SALES")).token;
    const amadou = await createUser("Amadou", "TEAM_MEMBER");
    amadouId = amadou.id;
    amadouToken = amadou.token;

    clientId = (
      await http().post("/api/v1/clients").set(as(adminToken)).send({ companyName: `${run} SA` }).expect(201)
    ).body.id;
    opportunityId = (
      await http()
        .post("/api/v1/opportunities")
        .set(as(adminToken))
        .send({ title: `${run} — opportunité`, clientId })
        .expect(201)
    ).body.id;
    missionId = (
      await http().post("/api/v1/missions").set(as(adminToken)).send({ title: `${run} — mission`, clientId }).expect(201)
    ).body.id;
    await http().post(`/api/v1/missions/${missionId}/members`).set(as(adminToken)).send({ userId: amadouId }).expect(201);
    taskId = (
      await http()
        .post(`/api/v1/missions/${missionId}/tasks`)
        .set(as(adminToken))
        .send({ title: "Maquettes", assigneeId: amadouId })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await eventBus.whenIdle();
    const ids = await entityIds();
    const { data: leftovers } = await db.from("documents").select("id, storage_path").in("entity_id", ids);
    if (leftovers && leftovers.length > 0) {
      await db.storage.from("documents").remove(leftovers.map((d) => d.storage_path));
      await db.from("documents").delete().in("id", leftovers.map((d) => d.id));
    }
    await db.from("workflow_runs").delete().in("subject_id", ids);
    await db.from("events").delete().in("entity_id", ids);
    if (missionId) await db.from("missions").delete().eq("id", missionId);
    if (opportunityId) await db.from("opportunities").delete().eq("id", opportunityId);
    if (clientId) await db.from("clients").delete().eq("id", clientId);
    for (const id of createdAuthUserIds) await db.auth.admin.deleteUser(id);
    await app.close();
  });

  it("le bucket de stockage est privé", async () => {
    const { data } = await db.storage.getBucket("documents");
    expect(data?.public).toBe(false);
  });

  describe("dépôt", () => {
    const target = () => ({ entityType: "opportunity", entityId: opportunityId });
    const pdf = { name: "Cahier des charges – été.pdf", type: "application/pdf", content: PDF };

    it("refuse sans droit, sans fichier, sur un objet inconnu ou d'un type invalide", async () => {
      await http().post("/api/v1/documents").field("entityType", "opportunity").field("entityId", opportunityId).expect(401);
      // L'observateur ne dépose rien.
      await upload(viewerToken, target(), pdf).expect(403);
      // Un collaborateur n'a pas accès aux opportunités, donc pas à leurs documents.
      await upload(amadouToken, target(), pdf).expect(403);
      await http()
        .post("/api/v1/documents")
        .set(as(adminToken))
        .field("entityType", "opportunity")
        .field("entityId", opportunityId)
        .expect(400);
      await upload(adminToken, { entityType: "facture", entityId: opportunityId }, pdf).expect(400);
      await upload(adminToken, { entityType: "opportunity", entityId: "00000000-0000-4000-8000-000000000000" }, pdf).expect(404);
    });

    it("contrôle le fichier : type, extension, contenu réel, taille", async () => {
      const refused = async (file: { name: string; type: string; content: Buffer }, message: string) => {
        const response = await upload(adminToken, target(), file).expect(400);
        expect(response.body.message).toContain(message);
      };
      await refused({ name: "outil.exe", type: "application/x-msdownload", content: EXE }, "non accepté");
      // Exécutable renommé en PDF : l'extension et le type annoncé ne suffisent pas.
      await refused({ name: "facture.pdf", type: "application/pdf", content: EXE }, "contenu");
      await refused({ name: "image.png", type: "application/pdf", content: PDF }, "extension");
      await refused({ name: "vide.pdf", type: "application/pdf", content: Buffer.alloc(0) }, "vide");
      await upload(adminToken, target(), {
        name: "enorme.pdf",
        type: "application/pdf",
        content: Buffer.concat([PDF, Buffer.alloc(15 * 1024 * 1024)]),
      }).expect(413);

      const { count } = await db
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", opportunityId);
      expect(count).toBe(0);
    });

    it("enregistre le fichier dans le stockage, garde son nom, trace le dépôt", async () => {
      const response = await upload(salesToken, target(), pdf).expect(201);
      const document = response.body as DocumentResponse;
      expect(document).toEqual(
        expect.objectContaining({
          name: "Cahier des charges – été.pdf",
          mimeType: "application/pdf",
          size: PDF.length,
          entityType: "opportunity",
          entityId: opportunityId,
          uploadedByName: `Awa Test${tag}`,
          canDelete: true,
        }),
      );

      const { data: row } = await db.from("documents").select("storage_path").eq("id", document.id).single();
      expect(row?.storage_path).toMatch(new RegExp(`^opportunity/${opportunityId}/[0-9a-f-]{36}-Cahier-des-charges-ete\\.pdf$`));
      const stored = await db.storage.from("documents").download(row!.storage_path);
      expect(Buffer.from(await stored.data!.arrayBuffer()).equals(PDF)).toBe(true);

      await eventBus.whenIdle();
      const timeline = await http().get(`/api/v1/opportunities/${opportunityId}/timeline`).set(as(adminToken)).expect(200);
      const uploaded = (timeline.body as TimelineEventResponse[]).find((e) => e.type === "DOCUMENT_UPLOADED");
      expect(uploaded?.payload).toEqual(expect.objectContaining({ name: "Cahier des charges – été.pdf", attachedTo: "opportunity" }));
      expect(uploaded?.actorName).toBe(`Awa Test${tag}`);
    });
  });

  describe("consultation et téléchargement", () => {
    it("les droits suivent ceux de l'objet", async () => {
      const seen = await list(viewerToken, "opportunity", opportunityId).expect(200);
      expect((seen.body as DocumentResponse[]).map((d) => [d.name, d.canDelete])).toEqual([
        ["Cahier des charges – été.pdf", false],
      ]);
      await list(amadouToken, "opportunity", opportunityId).expect(403);
      await list(adminToken, "opportunity", "00000000-0000-4000-8000-000000000000").expect(404);
      await http().get("/api/v1/documents").query({ entityType: "opportunity" }).set(as(adminToken)).expect(400);
      await http().get("/api/v1/documents").query({ entityType: "opportunity", entityId: opportunityId }).expect(401);

      const documentId = (seen.body as DocumentResponse[])[0]!.id;
      await http().get(`/api/v1/documents/${documentId}/download`).set(as(amadouToken)).expect(403);
      await http().get(`/api/v1/documents/${documentId}/download`).expect(401);
      await http().get("/api/v1/documents/00000000-0000-4000-8000-000000000000/download").set(as(adminToken)).expect(404);
    });

    it("lien signé de courte durée : le fichier revient à l'identique ; rien n'est public", async () => {
      const documents = (await list(viewerToken, "opportunity", opportunityId).expect(200)).body as DocumentResponse[];
      const link = await http().get(`/api/v1/documents/${documents[0]!.id}/download`).set(as(viewerToken)).expect(200);
      expect(link.body.expiresInSeconds).toBe(60);
      expect(link.body.url).toContain("/storage/v1/object/sign/documents/");
      expect(link.body.url).toContain("token=");

      const downloaded = await fetch(link.body.url as string);
      expect(downloaded.status).toBe(200);
      expect(Buffer.from(await downloaded.arrayBuffer()).equals(PDF)).toBe(true);
      expect(downloaded.headers.get("content-disposition")).toContain("attachment");

      // Sans signature, le même fichier est inaccessible.
      const { data: row } = await db.from("documents").select("storage_path").eq("id", documents[0]!.id).single();
      const base = `${config.getOrThrow<string>("SUPABASE_URL")}/storage/v1/object`;
      expect((await fetch(`${base}/public/documents/${row!.storage_path}`)).status).not.toBe(200);
      expect((await fetch(`${base}/documents/${row!.storage_path}`)).status).not.toBe(200);
      expect((await fetch((link.body.url as string).replace(/token=[^&]+/, "token=invalide"))).status).not.toBe(200);
    });
  });

  describe("missions, tâches et suppression", () => {
    let missionDocumentId: string;
    let taskDocumentId: string;

    it("un collaborateur dépose sur sa mission et en pièce jointe d'une tâche", async () => {
      const onMission = await upload(amadouToken, { entityType: "mission", entityId: missionId }, {
        name: "maquette.png",
        type: "image/png",
        content: PNG,
      }).expect(201);
      missionDocumentId = onMission.body.id;
      const onTask = await upload(amadouToken, { entityType: "task", entityId: taskId }, {
        name: "notes.txt",
        type: "text/plain",
        content: Buffer.from("Points à valider avec le client."),
      }).expect(201);
      taskDocumentId = onTask.body.id;

      const attachments = (await list(viewerToken, "task", taskId).expect(200)).body as DocumentResponse[];
      expect(attachments.map((d) => d.name)).toEqual(["notes.txt"]);
      // Les documents d'une tâche ne se mélangent pas à ceux de sa mission.
      const missionDocuments = (await list(viewerToken, "mission", missionId).expect(200)).body as DocumentResponse[];
      expect(missionDocuments.map((d) => d.name)).toEqual(["maquette.png"]);

      // La pièce jointe d'une tâche est tracée dans l'historique de sa mission.
      await eventBus.whenIdle();
      const timeline = await http().get(`/api/v1/missions/${missionId}/timeline`).set(as(adminToken)).expect(200);
      const uploads = (timeline.body as TimelineEventResponse[]).filter((e) => e.type === "DOCUMENT_UPLOADED");
      expect(uploads.map((e) => e.payload.attachedTo).sort()).toEqual(["mission", "task"]);
    });

    it("suppression : par l'auteur ou un responsable de l'objet, fichier réellement effacé", async () => {
      // La commerciale voit les missions mais ne les pilote pas, et n'est pas l'auteure.
      await http().delete(`/api/v1/documents/${missionDocumentId}`).set(as(salesToken)).expect(403);
      await http().delete(`/api/v1/documents/${missionDocumentId}`).set(as(viewerToken)).expect(403);
      await http().delete(`/api/v1/documents/${missionDocumentId}`).expect(401);

      const { data: row } = await db.from("documents").select("storage_path").eq("id", missionDocumentId).single();
      // L'auteur supprime son propre dépôt.
      await http().delete(`/api/v1/documents/${missionDocumentId}`).set(as(amadouToken)).expect(204);
      await http().delete(`/api/v1/documents/${missionDocumentId}`).set(as(amadouToken)).expect(404);
      await http().get(`/api/v1/documents/${missionDocumentId}/download`).set(as(adminToken)).expect(404);
      const gone = await db.storage.from("documents").download(row!.storage_path);
      expect(gone.data).toBeNull();
      expect(gone.error).toBeTruthy();

      // Un pilote de la mission supprime la pièce jointe d'un autre.
      await http().delete(`/api/v1/documents/${taskDocumentId}`).set(as(adminToken)).expect(204);
      expect((await list(adminToken, "task", taskId).expect(200)).body).toEqual([]);

      await eventBus.whenIdle();
      const timeline = await http().get(`/api/v1/missions/${missionId}/timeline`).set(as(adminToken)).expect(200);
      const deleted = (timeline.body as TimelineEventResponse[]).filter((e) => e.type === "DOCUMENT_DELETED");
      expect(deleted.map((e) => e.payload.name).sort()).toEqual(["maquette.png", "notes.txt"]);
    });

    it("fiche client : dépôt et lecture par qui voit les clients", async () => {
      await upload(amadouToken, { entityType: "client", entityId: clientId }, {
        name: "contrat.pdf",
        type: "application/pdf",
        content: PDF,
      }).expect(403);
      const contract = await upload(salesToken, { entityType: "client", entityId: clientId }, {
        name: "contrat.pdf",
        type: "application/pdf",
        content: PDF,
      }).expect(201);
      expect((await list(viewerToken, "client", clientId).expect(200)).body).toEqual([
        expect.objectContaining({ id: contract.body.id, name: "contrat.pdf" }),
      ]);
    });
  });
});
