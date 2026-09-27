// Tests d'intégration du module services : l'application NestJS complète
// contre la VRAIE base Supabase de dev, avec de vrais JWT. Aucun mock.
// Le catalogue est pré-seedé (migration 000016) : pas de création/
// suppression testée ici, seulement lecture et configuration — les
// modifications faites par les tests sont restaurées à la fin.
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

describe("Services (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let adminToken: string;
  let viewerToken: string;
  let websiteServiceId: string;
  let originalWebsiteService: { description: string | null; status: string };

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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    config = app.get(ConfigService);
    db = app.get(SupabaseService).getClient();
    adminToken = await login("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD");
    viewerToken = await login("E2E_VIEWER_EMAIL", "E2E_VIEWER_PASSWORD");

    const { data } = await db.from("services").select("*").eq("slug", "WEBSITE").single();
    websiteServiceId = data!.id;
    originalWebsiteService = { description: data!.description, status: data!.status };
  });

  afterAll(async () => {
    await db
      .from("services")
      .update({
        description: originalWebsiteService.description,
        status: originalWebsiteService.status as "ACTIVE",
      })
      .eq("id", websiteServiceId);
    await app.close();
  });

  it("refuse un accès sans token (401)", async () => {
    await http().get("/api/v1/services").expect(401);
  });

  it("liste les 10 services du catalogue, formulaire lié inclus", async () => {
    const response = await http().get("/api/v1/services").set(as(viewerToken)).expect(200);
    expect(response.body).toHaveLength(10);
    const website = response.body.find((s: { slug: string }) => s.slug === "WEBSITE");
    expect(website).toMatchObject({
      slug: "WEBSITE",
      status: "ACTIVE",
      qualificationFormName: "Qualification — Site web",
    });
    expect(website.qualificationFormId).toBeTruthy();
  });

  it("lit un service par son id", async () => {
    const response = await http()
      .get(`/api/v1/services/${websiteServiceId}`)
      .set(as(viewerToken))
      .expect(200);
    expect(response.body.slug).toBe("WEBSITE");
  });

  it("404 pour un service inconnu", async () => {
    await http().get(`/api/v1/services/${UNKNOWN_UUID}`).set(as(viewerToken)).expect(404);
  });

  it("refuse la configuration à un VIEWER (403) sans rien modifier", async () => {
    await http()
      .patch(`/api/v1/services/${websiteServiceId}`)
      .set(as(viewerToken))
      .send({ status: "INACTIVE" })
      .expect(403);
  });

  it("un ADMIN configure un service (description, statut)", async () => {
    const response = await http()
      .patch(`/api/v1/services/${websiteServiceId}`)
      .set(as(adminToken))
      .send({ description: "E2E — description modifiée" })
      .expect(200);
    expect(response.body.description).toBe("E2E — description modifiée");
  });

  it("rejette un qualificationFormId qui n'existe pas (404)", async () => {
    await http()
      .patch(`/api/v1/services/${websiteServiceId}`)
      .set(as(adminToken))
      .send({ qualificationFormId: UNKNOWN_UUID })
      .expect(404);
  });

  it("rejette un corps vide (400)", async () => {
    await http()
      .patch(`/api/v1/services/${websiteServiceId}`)
      .set(as(adminToken))
      .send({})
      .expect(400);
  });
});
