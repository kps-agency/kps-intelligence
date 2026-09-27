// Tests d'intégration du CRM (clients + contacts) : l'application NestJS
// complète (guards, validation, filtre d'erreurs) contre la VRAIE base
// Supabase de dev, avec de vrais JWT. Aucun mock. Les données créées sont
// supprimées à la fin (la suppression d'un client emporte ses contacts).
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

describe("CRM — clients & contacts (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let adminToken: string;
  let viewerToken: string;
  const run = `E2E-${Date.now()}`;
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

  async function createClient(
    fields: Record<string, unknown>,
  ): Promise<{ id: string; [key: string]: unknown }> {
    const response = await http()
      .post("/api/v1/clients")
      .set(as(adminToken))
      .send(fields)
      .expect(201);
    createdClientIds.push(response.body.id);
    return response.body;
  }

  async function primaryCount(clientId: string): Promise<number> {
    const { data, error } = await db
      .from("contacts")
      .select("id")
      .eq("client_id", clientId)
      .eq("is_primary", true);
    if (error) throw new Error(error.message);
    return data.length;
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
    if (createdClientIds.length > 0) {
      await db.from("clients").delete().in("id", createdClientIds);
    }
    await app.close();
  });

  describe("authentification et permissions (RBAC)", () => {
    it("refuse un accès sans token (401)", async () => {
      await http().get("/api/v1/clients").expect(401);
    });

    it("autorise la lecture à un VIEWER (clients.read)", async () => {
      await http().get("/api/v1/clients").set(as(viewerToken)).expect(200);
      await http().get("/api/v1/contacts").set(as(viewerToken)).expect(200);
    });

    it("refuse l'écriture à un VIEWER (403) sans rien créer", async () => {
      await http()
        .post("/api/v1/clients")
        .set(as(viewerToken))
        .send({ companyName: `${run}-viewer-interdit` })
        .expect(403);
      const { data } = await db
        .from("clients")
        .select("id")
        .eq("company_name", `${run}-viewer-interdit`);
      expect(data).toHaveLength(0);
    });

    it("la base refuse la lecture directe au rôle public (RLS)", async () => {
      await createClient({ companyName: `${run}-rls` });
      const response = await fetch(
        `${config.getOrThrow<string>("SUPABASE_URL")}/rest/v1/clients?select=id&limit=5`,
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
    it("rejette un client sans nom de société (400, message français)", async () => {
      const response = await http()
        .post("/api/v1/clients")
        .set(as(adminToken))
        .send({})
        .expect(400);
      expect(response.body.message).toContain("Le nom de la société est requis.");
      expect(response.body.requestId).toBeDefined();
    });

    it("rejette un nom de société blanc (espaces seuls)", async () => {
      await http()
        .post("/api/v1/clients")
        .set(as(adminToken))
        .send({ companyName: "   " })
        .expect(400);
    });

    it("rejette email, site web, téléphone et statut invalides", async () => {
      const response = await http()
        .post("/api/v1/clients")
        .set(as(adminToken))
        .send({
          companyName: `${run}-invalide`,
          email: "pas-un-email",
          website: "pas une url",
          phone: "abc",
          status: "INCONNU",
        })
        .expect(400);
      expect(response.body.message).toEqual(
        expect.arrayContaining([
          "Adresse email invalide.",
          "Adresse de site web invalide.",
          "Numéro de téléphone invalide.",
          "Statut client invalide.",
        ]),
      );
    });

    it("rejette une propriété inconnue (whitelist stricte)", async () => {
      await http()
        .post("/api/v1/clients")
        .set(as(adminToken))
        .send({ companyName: `${run}-x`, id: UNKNOWN_UUID })
        .expect(400);
    });

    it("rejette un identifiant qui n'est pas un UUID (400) et un inconnu (404)", async () => {
      await http().get("/api/v1/clients/pas-un-uuid").set(as(adminToken)).expect(400);
      await http().get(`/api/v1/clients/${UNKNOWN_UUID}`).set(as(adminToken)).expect(404);
    });
  });

  describe("cycle de vie d'un client", () => {
    let clientId: string;

    it("crée un client : 201, statut PROSPECT par défaut, champs blancs stockés à null, persisté en base", async () => {
      const created = await createClient({
        companyName: `  ${run}-life  `,
        country: "Suisse",
        city: "   ",
        email: "contact@acme-e2e.test",
        website: "acme-e2e.test",
        phone: "+41 79 123 45 67",
        source: "MANUAL",
      });
      clientId = created.id;

      expect(created).toMatchObject({
        companyName: `${run}-life`,
        country: "Suisse",
        city: null,
        status: "PROSPECT",
        source: "MANUAL",
      });

      const { data: row } = await db.from("clients").select("*").eq("id", clientId).single();
      expect(row).toMatchObject({
        company_name: `${run}-life`,
        city: null,
        status: "PROSPECT",
        email: "contact@acme-e2e.test",
      });
    });

    it("relit le client par son id", async () => {
      const response = await http()
        .get(`/api/v1/clients/${clientId}`)
        .set(as(viewerToken))
        .expect(200);
      expect(response.body.companyName).toBe(`${run}-life`);
    });

    it("modifie des champs, en efface un avec null, et persiste en base", async () => {
      const response = await http()
        .patch(`/api/v1/clients/${clientId}`)
        .set(as(adminToken))
        .send({ city: "Genève", website: null, status: "ACTIVE", notes: "Client clé" })
        .expect(200);
      expect(response.body).toMatchObject({
        city: "Genève",
        website: null,
        status: "ACTIVE",
        notes: "Client clé",
        country: "Suisse",
      });

      const { data: row } = await db.from("clients").select("*").eq("id", clientId).single();
      expect(row).toMatchObject({ city: "Genève", website: null, status: "ACTIVE" });
      expect(new Date(row!.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(row!.created_at).getTime(),
      );
    });

    it("refuse de vider les champs obligatoires ou d'envoyer un corps vide (400)", async () => {
      const patch = (body: Record<string, unknown>) =>
        http().patch(`/api/v1/clients/${clientId}`).set(as(adminToken)).send(body);
      await patch({ companyName: null }).expect(400);
      await patch({ companyName: "" }).expect(400);
      await patch({ status: null }).expect(400);
      await patch({}).expect(400);
    });

    it("renvoie 404 pour la modification d'un client inconnu", async () => {
      await http()
        .patch(`/api/v1/clients/${UNKNOWN_UUID}`)
        .set(as(adminToken))
        .send({ city: "X" })
        .expect(404);
    });
  });

  describe("liste : pagination, tri, recherche et filtre", () => {
    beforeAll(async () => {
      await createClient({ companyName: `${run}-page-C`, status: "ACTIVE" });
      await createClient({ companyName: `${run}-page-A`, status: "ACTIVE" });
      await createClient({ companyName: `${run}-page-B`, status: "CHURNED" });
    });

    it("pagine et trie par nom (meta cohérente)", async () => {
      const page1 = await http()
        .get(`/api/v1/clients?search=${run}-page&limit=2&page=1`)
        .set(as(adminToken))
        .expect(200);
      expect(page1.body.meta).toEqual({ total: 3, page: 1, limit: 2 });
      expect(page1.body.data.map((c: { companyName: string }) => c.companyName)).toEqual([
        `${run}-page-A`,
        `${run}-page-B`,
      ]);

      const page2 = await http()
        .get(`/api/v1/clients?search=${run}-page&limit=2&page=2`)
        .set(as(adminToken))
        .expect(200);
      expect(page2.body.data.map((c: { companyName: string }) => c.companyName)).toEqual([
        `${run}-page-C`,
      ]);
    });

    it("filtre par statut", async () => {
      const response = await http()
        .get(`/api/v1/clients?search=${run}-page&status=CHURNED`)
        .set(as(adminToken))
        .expect(200);
      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0].companyName).toBe(`${run}-page-B`);
    });

    it("la recherche est insensible à la casse et n'est pas injectable", async () => {
      const lower = await http()
        .get(`/api/v1/clients?search=${encodeURIComponent(`${run}-PAGE-a`.toLowerCase())}`)
        .set(as(adminToken))
        .expect(200);
      expect(lower.body.meta.total).toBe(1);

      // Une tentative d'ajouter une condition au filtre PostgREST ne doit
      // ni planter ni élargir le résultat (il existe des clients ACTIVE).
      const injection = await http()
        .get(`/api/v1/clients?search=${encodeURIComponent("zzz,status.eq.ACTIVE")}`)
        .set(as(adminToken))
        .expect(200);
      expect(injection.body.meta.total).toBe(0);
    });

    it("valide les paramètres de liste (400)", async () => {
      await http().get("/api/v1/clients?limit=1000").set(as(adminToken)).expect(400);
      await http().get("/api/v1/clients?page=0").set(as(adminToken)).expect(400);
      await http().get("/api/v1/clients?status=NOPE").set(as(adminToken)).expect(400);
      await http().get("/api/v1/clients?inconnu=1").set(as(adminToken)).expect(400);
    });
  });

  describe("contacts", () => {
    let clientId: string;
    let first: string;
    let second: string;
    let third: string;

    const post = (body: Record<string, unknown>) =>
      http().post(`/api/v1/clients/${clientId}/contacts`).set(as(adminToken)).send(body);

    beforeAll(async () => {
      clientId = (await createClient({ companyName: `${run}-contacts` })).id;
    });

    it("le premier contact d'un client devient principal automatiquement", async () => {
      const response = await post({
        firstName: "Alice",
        lastName: "Martin",
        email: "alice@acme-e2e.test",
        position: "Directrice",
      }).expect(201);
      first = response.body.id;
      expect(response.body).toMatchObject({
        clientId,
        clientCompanyName: `${run}-contacts`,
        isPrimary: true,
      });
      expect(await primaryCount(clientId)).toBe(1);
    });

    it("un contact suivant n'est pas principal, sauf si on le demande", async () => {
      const b = await post({ firstName: "Bob", lastName: "Durand" }).expect(201);
      second = b.body.id;
      expect(b.body.isPrimary).toBe(false);

      const c = await post({ firstName: "Chloé", lastName: "Petit", isPrimary: true }).expect(201);
      third = c.body.id;
      expect(c.body.isPrimary).toBe(true);

      expect(await primaryCount(clientId)).toBe(1);
      const { data } = await db.from("contacts").select("id, is_primary").eq("client_id", clientId);
      expect(data!.find((row) => row.id === first)!.is_primary).toBe(false);
    });

    it("liste les contacts du client, principal en premier", async () => {
      const response = await http()
        .get(`/api/v1/clients/${clientId}/contacts`)
        .set(as(viewerToken))
        .expect(200);
      expect(response.body).toHaveLength(3);
      expect(response.body[0].id).toBe(third);
      expect(response.body[0].isPrimary).toBe(true);
    });

    it("désigne un autre contact principal via PATCH (l'ancien est retiré)", async () => {
      await http()
        .patch(`/api/v1/contacts/${second}`)
        .set(as(adminToken))
        .send({ isPrimary: true })
        .expect(200);
      expect(await primaryCount(clientId)).toBe(1);
      const { data } = await db.from("contacts").select("is_primary").eq("id", second).single();
      expect(data!.is_primary).toBe(true);
    });

    it("refuse de retirer le statut principal directement (isPrimary:false → 400)", async () => {
      await http()
        .patch(`/api/v1/contacts/${second}`)
        .set(as(adminToken))
        .send({ isPrimary: false })
        .expect(400);
    });

    it("garantit un seul contact principal même avec deux désignations simultanées", async () => {
      const responses = await Promise.all([
        http().patch(`/api/v1/contacts/${first}`).set(as(adminToken)).send({ isPrimary: true }),
        http().patch(`/api/v1/contacts/${third}`).set(as(adminToken)).send({ isPrimary: true }),
      ]);
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect(await primaryCount(clientId)).toBe(1);
    });

    it("l'index unique de la base interdit deux principaux, même en contournant l'API", async () => {
      const { error } = await db.from("contacts").insert({
        client_id: clientId,
        first_name: "Intrus",
        last_name: "Direct",
        is_primary: true,
      });
      expect(error?.code).toBe("23505");
    });

    it("modifie un contact, efface un champ avec null, refuse un prénom vide", async () => {
      const response = await http()
        .patch(`/api/v1/contacts/${first}`)
        .set(as(adminToken))
        .send({ position: "CEO", email: null, phone: "+33 6 12 34 56 78" })
        .expect(200);
      expect(response.body).toMatchObject({
        position: "CEO",
        email: null,
        phone: "+33 6 12 34 56 78",
      });
      await http()
        .patch(`/api/v1/contacts/${first}`)
        .set(as(adminToken))
        .send({ firstName: null })
        .expect(400);
    });

    it("valide un contact (nom requis, email invalide) et un client inconnu", async () => {
      const response = await post({ email: "nope" }).expect(400);
      expect(response.body.message).toEqual(
        expect.arrayContaining([
          "Le prénom est requis.",
          "Le nom est requis.",
          "Adresse email invalide.",
        ]),
      );
      await http()
        .post(`/api/v1/clients/${UNKNOWN_UUID}/contacts`)
        .set(as(adminToken))
        .send({ firstName: "A", lastName: "B" })
        .expect(404);
    });

    it("liste transversale : recherche, filtre par client, nom de société inclus", async () => {
      const response = await http()
        .get(`/api/v1/contacts?clientId=${clientId}&search=chlo`)
        .set(as(viewerToken))
        .expect(200);
      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0]).toMatchObject({
        firstName: "Chloé",
        clientCompanyName: `${run}-contacts`,
      });
    });

    it("la recherche trouve un contact par prénom+nom complets (deux colonnes distinctes)", async () => {
      const response = await http()
        .get("/api/v1/contacts?search=Alice+Martin")
        .set(as(viewerToken))
        .expect(200);
      expect(response.body.data.map((c: { id: string }) => c.id)).toContain(first);
    });

    it("supprime un contact (204) ; s'il était principal, un autre reprend le rôle", async () => {
      const { data: before } = await db
        .from("contacts")
        .select("id")
        .eq("client_id", clientId)
        .eq("is_primary", true)
        .single();
      const primaryId = before!.id;

      await http().delete(`/api/v1/contacts/${primaryId}`).set(as(adminToken)).expect(204);

      const { data: gone } = await db.from("contacts").select("id").eq("id", primaryId);
      expect(gone).toHaveLength(0);
      expect(await primaryCount(clientId)).toBe(1);
      await http().delete(`/api/v1/contacts/${primaryId}`).set(as(adminToken)).expect(404);
    });

    it("refuse la suppression à un VIEWER (403)", async () => {
      await http().delete(`/api/v1/contacts/${second}`).set(as(viewerToken)).expect(403);
    });

    it("la liste des clients indique le nombre de contacts", async () => {
      const response = await http()
        .get(`/api/v1/clients?search=${run}-contacts`)
        .set(as(adminToken))
        .expect(200);
      expect(response.body.data[0].contactsCount).toBe(2);
    });
  });

  describe("intégrité", () => {
    it("supprimer un client supprime ses contacts (cascade en base)", async () => {
      const client = await createClient({ companyName: `${run}-cascade` });
      await http()
        .post(`/api/v1/clients/${client.id}/contacts`)
        .set(as(adminToken))
        .send({ firstName: "Z", lastName: "Z" })
        .expect(201);

      await db.from("clients").delete().eq("id", client.id);

      const { data } = await db.from("contacts").select("id").eq("client_id", client.id);
      expect(data).toHaveLength(0);
    });

    it("les erreurs base de données ne divulguent aucun détail au client", async () => {
      // Le client est absent : l'API doit répondre 404, jamais un message
      // brut de PostgREST/Postgres.
      const response = await http()
        .get(`/api/v1/clients/${UNKNOWN_UUID}/contacts`)
        .set(as(adminToken))
        .expect(404);
      expect(JSON.stringify(response.body)).not.toMatch(/postgres|relation|violates|constraint/i);
    });
  });
});
