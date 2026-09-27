// Tests d'intégration du form builder (forms/steps/fields) : l'application
// NestJS complète contre la VRAIE base Supabase de dev, avec de vrais
// JWT. Aucun mock. Toutes les données créées sont supprimées à la fin
// (la suppression d'un formulaire emporte ses étapes puis ses champs).
//
// Prérequis : .env à la racine avec E2E_ADMIN_*/E2E_VIEWER_*.
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

describe("Form builder (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let adminToken: string;
  let viewerToken: string;
  // En minuscules : réutilisé tel quel dans des slugs (lettres
  // minuscules/chiffres/tirets uniquement — voir CreateFormDto).
  const run = `e2e-forms-${Date.now()}`;
  const createdFormIds: string[] = [];

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

  async function createForm(slug: string): Promise<{ id: string; [k: string]: unknown }> {
    const response = await http()
      .post("/api/v1/forms")
      .set(as(adminToken))
      .send({ name: `${run}-${slug}`, slug: `${run}-${slug}` })
      .expect(201);
    createdFormIds.push(response.body.id);
    return response.body;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    config = app.get(ConfigService);
    db = app.get(SupabaseService).getClient();
    adminToken = await login("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD");
    viewerToken = await login("E2E_VIEWER_EMAIL", "E2E_VIEWER_PASSWORD");
  });

  afterAll(async () => {
    if (createdFormIds.length > 0) {
      await db.from("forms").delete().in("id", createdFormIds);
    }
    await app.close();
  });

  describe("catalogue existant (les 5 formulaires de qualification, section 25-29)", () => {
    it("liste au moins les 5 formulaires publiés du catalogue", async () => {
      const response = await http().get("/api/v1/forms").set(as(viewerToken)).expect(200);
      const slugs = response.body.map((f: { slug: string }) => f.slug);
      expect(slugs).toEqual(
        expect.arrayContaining([
          "website-qualification",
          "ecommerce-qualification",
          "seo-qualification",
          "maintenance-qualification",
          "business-application-qualification",
        ]),
      );
    });

    it("le formulaire WEBSITE expose la logique conditionnelle de la section 30", async () => {
      const list = await http().get("/api/v1/forms").set(as(viewerToken)).expect(200);
      const websiteForm = list.body.find(
        (f: { slug: string }) => f.slug === "website-qualification",
      );
      const detail = await http()
        .get(`/api/v1/forms/${websiteForm.id}`)
        .set(as(viewerToken))
        .expect(200);

      const allFields = detail.body.steps.flatMap((s: { fields: unknown[] }) => s.fields);
      const urlField = allFields.find((f: { key: string }) => f.key === "existingSiteUrl");
      const objectiveField = allFields.find((f: { key: string }) => f.key === "objective");
      expect(urlField.conditionalLogic).toEqual({ field: "hasExistingSite", equals: "OUI" });
      expect(objectiveField.conditionalLogic).toEqual({ field: "hasExistingSite", equals: "NON" });
    });
  });

  describe("RBAC", () => {
    it("refuse un accès sans token (401)", async () => {
      await http().get("/api/v1/forms").expect(401);
    });

    it("autorise la lecture à un VIEWER", async () => {
      await http().get("/api/v1/forms").set(as(viewerToken)).expect(200);
    });

    it("refuse l'écriture à un VIEWER (403) sans rien créer", async () => {
      await http()
        .post("/api/v1/forms")
        .set(as(viewerToken))
        .send({ name: `${run}-viewer-interdit`, slug: `${run}-viewer-interdit` })
        .expect(403);
      const { data } = await db.from("forms").select("id").eq("slug", `${run}-viewer-interdit`);
      expect(data).toHaveLength(0);
    });
  });

  describe("validation des entrées", () => {
    it("rejette un slug invalide (majuscules/espaces)", async () => {
      await http()
        .post("/api/v1/forms")
        .set(as(adminToken))
        .send({ name: "X", slug: "Pas Valide" })
        .expect(400);
    });

    it("rejette un serviceId inconnu (404)", async () => {
      await http()
        .post("/api/v1/forms")
        .set(as(adminToken))
        .send({ name: "X", slug: `${run}-bad-service`, serviceId: UNKNOWN_UUID })
        .expect(404);
    });
  });

  describe("cycle de vie complet (form → step → field → reorder)", () => {
    let formId: string;
    let step1Id: string;
    let step2Id: string;
    let fieldId: string;

    it("crée un formulaire vide (DRAFT)", async () => {
      const form = await createForm("lifecycle");
      formId = form.id;
      expect(form).toMatchObject({ status: "DRAFT", version: 1, steps: [] });
    });

    it("ajoute deux étapes, dans l'ordre de création", async () => {
      const s1 = await http()
        .post(`/api/v1/forms/${formId}/steps`)
        .set(as(adminToken))
        .send({ title: "Étape 1" })
        .expect(201);
      const s2 = await http()
        .post(`/api/v1/forms/${formId}/steps`)
        .set(as(adminToken))
        .send({ title: "Étape 2" })
        .expect(201);
      step1Id = s1.body.id;
      step2Id = s2.body.id;
      expect(s1.body.orderIndex).toBe(0);
      expect(s2.body.orderIndex).toBe(1);
    });

    it("rejette un SELECT sans options (400)", async () => {
      await http()
        .post(`/api/v1/forms/${formId}/steps/${step1Id}/fields`)
        .set(as(adminToken))
        .send({ key: "choice", label: "Choix", type: "SELECT" })
        .expect(400);
    });

    it("rejette une clé de champ mal formée (400)", async () => {
      await http()
        .post(`/api/v1/forms/${formId}/steps/${step1Id}/fields`)
        .set(as(adminToken))
        .send({ key: "Pas-Valide", label: "X", type: "TEXT" })
        .expect(400);
    });

    it("crée un champ valide", async () => {
      const response = await http()
        .post(`/api/v1/forms/${formId}/steps/${step1Id}/fields`)
        .set(as(adminToken))
        .send({ key: "companyName", label: "Nom de l'entreprise", type: "TEXT", required: true })
        .expect(201);
      fieldId = response.body.id;
      expect(response.body).toMatchObject({ key: "companyName", required: true, orderIndex: 0 });
    });

    it("rejette une clé déjà utilisée ailleurs dans le même formulaire (400)", async () => {
      await http()
        .post(`/api/v1/forms/${formId}/steps/${step2Id}/fields`)
        .set(as(adminToken))
        .send({ key: "companyName", label: "Dupliqué", type: "TEXT" })
        .expect(400);
    });

    it("rejette une condition référençant un champ inconnu (400)", async () => {
      await http()
        .post(`/api/v1/forms/${formId}/steps/${step2Id}/fields`)
        .set(as(adminToken))
        .send({
          key: "dependent",
          label: "Dépendant",
          type: "TEXT",
          conditionalLogic: { field: "inconnu", equals: "X" },
        })
        .expect(400);
    });

    it("accepte une condition référençant un champ réel", async () => {
      const response = await http()
        .post(`/api/v1/forms/${formId}/steps/${step2Id}/fields`)
        .set(as(adminToken))
        .send({
          key: "dependent",
          label: "Dépendant",
          type: "TEXT",
          conditionalLogic: { field: "companyName", equals: "ACME" },
        })
        .expect(201);
      expect(response.body.conditionalLogic).toEqual({ field: "companyName", equals: "ACME" });
    });

    it("modifie un champ (label, plus de condition)", async () => {
      const response = await http()
        .patch(`/api/v1/forms/${formId}/steps/${step1Id}/fields/${fieldId}`)
        .set(as(adminToken))
        .send({ label: "Société" })
        .expect(200);
      expect(response.body.label).toBe("Société");
    });

    it("réordonne les étapes (permutation), persisté en base", async () => {
      await http()
        .post(`/api/v1/forms/${formId}/steps/reorder`)
        .set(as(adminToken))
        .send({ orderedIds: [step2Id, step1Id] })
        .expect(204);

      const detail = await http().get(`/api/v1/forms/${formId}`).set(as(adminToken)).expect(200);
      expect(detail.body.steps[0].id).toBe(step2Id);
      expect(detail.body.steps[1].id).toBe(step1Id);
    });

    it("rejette un réordonnancement dont la liste ne correspond pas (400)", async () => {
      await http()
        .post(`/api/v1/forms/${formId}/steps/reorder`)
        .set(as(adminToken))
        .send({ orderedIds: [step1Id] })
        .expect(400);
    });

    it("publie le formulaire", async () => {
      const response = await http()
        .patch(`/api/v1/forms/${formId}`)
        .set(as(adminToken))
        .send({ status: "PUBLISHED" })
        .expect(200);
      expect(response.body.status).toBe("PUBLISHED");
    });

    it("supprime un champ", async () => {
      await http()
        .delete(`/api/v1/forms/${formId}/steps/${step1Id}/fields/${fieldId}`)
        .set(as(adminToken))
        .expect(204);
      const detail = await http().get(`/api/v1/forms/${formId}`).set(as(adminToken)).expect(200);
      const step1 = detail.body.steps.find((s: { id: string }) => s.id === step1Id);
      expect(step1.fields).toHaveLength(0);
    });

    it("supprime une étape (emporte ses champs restants)", async () => {
      await http()
        .delete(`/api/v1/forms/${formId}/steps/${step2Id}`)
        .set(as(adminToken))
        .expect(204);
      const detail = await http().get(`/api/v1/forms/${formId}`).set(as(adminToken)).expect(200);
      expect(detail.body.steps.map((s: { id: string }) => s.id)).toEqual([step1Id]);
    });

    it("404 sur une étape qui n'appartient pas à ce formulaire", async () => {
      const other = await createForm("other");
      const otherStep = await http()
        .post(`/api/v1/forms/${other.id}/steps`)
        .set(as(adminToken))
        .send({ title: "Étape autre formulaire" })
        .expect(201);

      await http()
        .patch(`/api/v1/forms/${formId}/steps/${otherStep.body.id}`)
        .set(as(adminToken))
        .send({ title: "X" })
        .expect(404);
    });
  });

  describe("intégrité", () => {
    it("les erreurs ne divulguent aucun détail technique au client", async () => {
      const response = await http()
        .get(`/api/v1/forms/${UNKNOWN_UUID}`)
        .set(as(adminToken))
        .expect(404);
      expect(JSON.stringify(response.body)).not.toMatch(/postgres|relation|violates|constraint/i);
    });
  });
});
