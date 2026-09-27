// Tests d'intégration du module requests : l'application NestJS complète
// (guards, validation, filtre d'erreurs) contre la VRAIE base Supabase de
// dev, avec de vrais JWT. Aucun mock. Les données créées sont supprimées
// à la fin.
//
// Prérequis : .env à la racine avec E2E_ADMIN_* (SUPER_ADMIN) et E2E_VIEWER_*.
// Lancer : pnpm --filter @kps/api test:e2e

process.env.LOG_LEVEL = "silent";
process.env.RATE_LIMIT_MAX = "5000";

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import type { Database } from "@kps/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { SupabaseService } from "../src/supabase/supabase.service";

const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000000";

describe("Requests (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let adminToken: string;
  let viewerToken: string;
  const run = `E2E-REQ-${Date.now()}`;
  const createdRequestIds: string[] = [];
  const createdClientIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(emailKey: string, passwordKey: string): Promise<string> {
    const email = config.getOrThrow<string>(emailKey);
    const password = config.getOrThrow<string>(passwordKey);
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

  async function createRequestRaw(
    fields: Record<string, unknown>,
  ): Promise<{ id: string; [key: string]: unknown }> {
    const response = await http()
      .post("/api/v1/requests")
      .set(as(adminToken))
      .send(fields)
      .expect(201);
    createdRequestIds.push(response.body.id);
    return response.body;
  }

  async function createClientWithContact(): Promise<{
    clientId: string;
    contactId: string;
  }> {
    const clientRes = await http()
      .post("/api/v1/clients")
      .set(as(adminToken))
      .send({ companyName: `${run}-client-${createdClientIds.length}` })
      .expect(201);
    createdClientIds.push(clientRes.body.id);

    const contactRes = await http()
      .post(`/api/v1/clients/${clientRes.body.id}/contacts`)
      .set(as(adminToken))
      .send({ firstName: "Alice", lastName: "Martin" })
      .expect(201);

    return { clientId: clientRes.body.id, contactId: contactRes.body.id };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    config = app.get(ConfigService);
    db = app.get(SupabaseService).getClient();
    adminToken = await login("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD");
    viewerToken = await login("E2E_VIEWER_EMAIL", "E2E_VIEWER_PASSWORD");
  });

  afterAll(async () => {
    if (createdRequestIds.length > 0) {
      await db.from("requests").delete().in("id", createdRequestIds);
    }
    if (createdClientIds.length > 0) {
      await db.from("clients").delete().in("id", createdClientIds);
    }
    await app.close();
  });

  describe("authentification et permissions (RBAC)", () => {
    it("refuse un accès sans token (401)", async () => {
      await http().get("/api/v1/requests").expect(401);
    });

    it("autorise la lecture à un VIEWER (requests.read)", async () => {
      await http().get("/api/v1/requests").set(as(viewerToken)).expect(200);
    });

    it("refuse l'écriture à un VIEWER (403) sans rien créer", async () => {
      await http()
        .post("/api/v1/requests")
        .set(as(viewerToken))
        .send({ subject: `${run}-viewer-interdit` })
        .expect(403);
      const { data } = await db
        .from("requests")
        .select("id")
        .eq("subject", `${run}-viewer-interdit`);
      expect(data).toHaveLength(0);
    });

    it("la base refuse la lecture directe au rôle public (RLS)", async () => {
      await createRequestRaw({ subject: `${run}-rls` });
      const response = await fetch(
        `${config.getOrThrow<string>("SUPABASE_URL")}/rest/v1/requests?select=id&limit=5`,
        {
          headers: {
            apikey: config.getOrThrow<string>("SUPABASE_PUBLISHABLE_KEY"),
            Authorization: `Bearer ${config.getOrThrow<string>("SUPABASE_PUBLISHABLE_KEY")}`,
          },
        },
      );
      expect(await response.json()).toEqual([]);
    });
  });

  describe("validation des entrées", () => {
    it("rejette une demande sans sujet (400, message français)", async () => {
      const response = await http()
        .post("/api/v1/requests")
        .set(as(adminToken))
        .send({})
        .expect(400);
      expect(response.body.message).toContain("Le sujet est requis.");
      expect(response.body.requestId).toBeDefined();
    });

    it("rejette un sujet blanc (espaces seuls)", async () => {
      await http()
        .post("/api/v1/requests")
        .set(as(adminToken))
        .send({ subject: "   " })
        .expect(400);
    });

    it("rejette priorité/urgence invalides et une propriété inconnue", async () => {
      const response = await http()
        .post("/api/v1/requests")
        .set(as(adminToken))
        .send({ subject: `${run}-invalide`, priority: "NOPE", urgency: "NOPE", source: "EMAIL" })
        .expect(400);
      expect(response.body.message).toEqual(
        expect.arrayContaining(["Priorité invalide.", "Urgence invalide."]),
      );
    });

    it("rejette un identifiant qui n'est pas un UUID (400) et un inconnu (404)", async () => {
      await http().get("/api/v1/requests/pas-un-uuid").set(as(adminToken)).expect(400);
      await http().get(`/api/v1/requests/${UNKNOWN_UUID}`).set(as(adminToken)).expect(404);
    });
  });

  describe("lien client/contact", () => {
    it("crée sans client ni contact", async () => {
      const created = await createRequestRaw({ subject: `${run}-sans-lien` });
      expect(created).toMatchObject({
        subject: `${run}-sans-lien`,
        clientId: null,
        contactId: null,
        clientCompanyName: null,
        contactFullName: null,
        source: "MANUAL",
        status: "NEW",
      });
      expect(created.reference).toMatch(/^KPS-\d{4}-\d{5}$/);
    });

    it("rejette contactId sans clientId (400)", async () => {
      const { contactId } = await createClientWithContact();
      await http()
        .post("/api/v1/requests")
        .set(as(adminToken))
        .send({ subject: `${run}-orphelin`, contactId })
        .expect(400);
    });

    it("rejette un contact qui n'appartient pas au client donné (400)", async () => {
      const { contactId } = await createClientWithContact();
      const other = await createClientWithContact();
      await http()
        .post("/api/v1/requests")
        .set(as(adminToken))
        .send({ subject: `${run}-mismatch`, clientId: other.clientId, contactId })
        .expect(400);
    });

    it("crée avec un client et son contact, et renvoie leurs noms", async () => {
      const { clientId, contactId } = await createClientWithContact();
      const created = await createRequestRaw({
        subject: `${run}-avec-lien`,
        clientId,
        contactId,
      });
      expect(created).toMatchObject({
        clientId,
        contactId,
        contactFullName: "Alice Martin",
      });
      expect(created.clientCompanyName).toBeTruthy();
    });
  });

  describe("cycle de vie", () => {
    let requestId: string;

    it("crée une demande complète", async () => {
      const created = await createRequestRaw({
        subject: `  ${run}-life  `,
        originalMessage: "Bonjour, nous voulons un site.",
        country: "Suisse",
        language: "fr",
        priority: "HIGH",
      });
      requestId = created.id;
      expect(created).toMatchObject({
        subject: `${run}-life`,
        country: "Suisse",
        priority: "HIGH",
        urgency: null,
      });
    });

    it("relit la demande par son id", async () => {
      const response = await http()
        .get(`/api/v1/requests/${requestId}`)
        .set(as(viewerToken))
        .expect(200);
      expect(response.body.subject).toBe(`${run}-life`);
    });

    it("change le statut et la priorité, efface un champ avec null", async () => {
      const response = await http()
        .patch(`/api/v1/requests/${requestId}`)
        .set(as(adminToken))
        .send({ status: "QUALIFYING", priority: "URGENT", country: null })
        .expect(200);
      expect(response.body).toMatchObject({
        status: "QUALIFYING",
        priority: "URGENT",
        country: null,
      });

      const { data: row } = await db
        .from("requests")
        .select("*")
        .eq("id", requestId)
        .single();
      expect(row).toMatchObject({ status: "QUALIFYING", country: null });
    });

    it("lie la demande à un client après coup", async () => {
      const { clientId, contactId } = await createClientWithContact();
      const response = await http()
        .patch(`/api/v1/requests/${requestId}`)
        .set(as(adminToken))
        .send({ clientId, contactId })
        .expect(200);
      expect(response.body).toMatchObject({ clientId, contactId });
    });

    it("changer de client sans nouveau contact délie automatiquement l'ancien contact", async () => {
      const { clientId: newClientId } = await createClientWithContact();
      const response = await http()
        .patch(`/api/v1/requests/${requestId}`)
        .set(as(adminToken))
        .send({ clientId: newClientId })
        .expect(200);
      expect(response.body).toMatchObject({ clientId: newClientId, contactId: null });
    });

    it("clientId: null délie aussi le contact", async () => {
      const { clientId, contactId } = await createClientWithContact();
      await http()
        .patch(`/api/v1/requests/${requestId}`)
        .set(as(adminToken))
        .send({ clientId, contactId })
        .expect(200);

      const response = await http()
        .patch(`/api/v1/requests/${requestId}`)
        .set(as(adminToken))
        .send({ clientId: null })
        .expect(200);
      expect(response.body).toMatchObject({ clientId: null, contactId: null });
    });

    it("refuse de vider le sujet ou d'envoyer un corps vide (400)", async () => {
      await http()
        .patch(`/api/v1/requests/${requestId}`)
        .set(as(adminToken))
        .send({ subject: null })
        .expect(400);
      await http()
        .patch(`/api/v1/requests/${requestId}`)
        .set(as(adminToken))
        .send({})
        .expect(400);
    });

    it("renvoie 404 pour la modification d'une demande inconnue", async () => {
      await http()
        .patch(`/api/v1/requests/${UNKNOWN_UUID}`)
        .set(as(adminToken))
        .send({ subject: "X" })
        .expect(404);
    });

    it("refuse la modification à un VIEWER (403)", async () => {
      await http()
        .patch(`/api/v1/requests/${requestId}`)
        .set(as(viewerToken))
        .send({ subject: "X" })
        .expect(403);
    });
  });

  describe("liste : pagination, tri, recherche et filtres", () => {
    beforeAll(async () => {
      await createRequestRaw({ subject: `${run}-page-C`, priority: "LOW" });
      await createRequestRaw({ subject: `${run}-page-A`, priority: "LOW" });
      await createRequestRaw({ subject: `${run}-page-B`, priority: "HIGH" });
    });

    it("pagine, triée par date de création décroissante (meta cohérente)", async () => {
      const page1 = await http()
        .get(`/api/v1/requests?search=${run}-page&limit=2&page=1`)
        .set(as(adminToken))
        .expect(200);
      expect(page1.body.meta).toEqual({ total: 3, page: 1, limit: 2 });
      // Créées dans l'ordre C, A, B → la plus récente (B) sort en premier.
      expect(page1.body.data.map((r: { subject: string }) => r.subject)).toEqual([
        `${run}-page-B`,
        `${run}-page-A`,
      ]);
    });

    it("filtre par statut et par source", async () => {
      const response = await http()
        .get(`/api/v1/requests?search=${run}-page&status=NEW&source=MANUAL`)
        .set(as(adminToken))
        .expect(200);
      expect(response.body.meta.total).toBe(3);
    });

    it("recherche sur la référence", async () => {
      const created = await createRequestRaw({ subject: `${run}-ref-test` });
      const response = await http()
        .get(`/api/v1/requests?search=${created.reference}`)
        .set(as(adminToken))
        .expect(200);
      expect(response.body.data.map((r: { id: string }) => r.id)).toContain(created.id);
    });

    it("la recherche n'est pas injectable dans le filtre PostgREST", async () => {
      const response = await http()
        .get(`/api/v1/requests?search=${encodeURIComponent("zzz,status.eq.NEW")}`)
        .set(as(adminToken))
        .expect(200);
      expect(response.body.meta.total).toBe(0);
    });

    it("valide les paramètres de liste (400)", async () => {
      await http().get("/api/v1/requests?limit=1000").set(as(adminToken)).expect(400);
      await http().get("/api/v1/requests?status=NOPE").set(as(adminToken)).expect(400);
      await http().get("/api/v1/requests?source=NOPE").set(as(adminToken)).expect(400);
    });
  });

  describe("intégrité", () => {
    it("les erreurs base de données ne divulguent aucun détail au client", async () => {
      const response = await http()
        .get(`/api/v1/requests/${UNKNOWN_UUID}`)
        .set(as(adminToken))
        .expect(404);
      expect(JSON.stringify(response.body)).not.toMatch(/postgres|relation|violates|constraint/i);
    });
  });
});
