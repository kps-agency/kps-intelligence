// Tests d'intégration du module IA (analyse de demande, Phase 8, section
// 19 du prompt) : l'application NestJS complète contre la VRAIE base
// Supabase de dev, avec de vrais JWT, ET un vrai appel à l'API Anthropic
// pour chaque cas. Aucun mock — la classification est jugée sur les
// résultats réels de Claude. Les données créées sont supprimées à la fin.
//
// Prérequis : .env à la racine avec E2E_ADMIN_*/E2E_VIEWER_* et
// ANTHROPIC_API_KEY. Lancer : pnpm --filter @kps/api test:e2e

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
import businessAppRequest from "./fixtures/ai/business-app-request.json";
import ecommerceRequest from "./fixtures/ai/ecommerce-request.json";
import maintenanceRequest from "./fixtures/ai/maintenance-request.json";
import seoRequest from "./fixtures/ai/seo-request.json";
import spamRequest from "./fixtures/ai/spam-request.json";
import supportRequest from "./fixtures/ai/support-request.json";
import websiteRequest from "./fixtures/ai/website-request.json";

const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000000";

type Fixture = {
  subject: string;
  originalMessage: string;
  language: string | null;
  country: string | null;
  expected: { intent: string; service: string | null };
};

const FIXTURES: [string, Fixture][] = [
  ["website", websiteRequest as Fixture],
  ["ecommerce", ecommerceRequest as Fixture],
  ["seo", seoRequest as Fixture],
  ["maintenance", maintenanceRequest as Fixture],
  ["business-app", businessAppRequest as Fixture],
  ["support", supportRequest as Fixture],
  ["spam", spamRequest as Fixture],
];

describe("IA — analyse de demande (intégration réelle, appelle Claude)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let adminToken: string;
  let viewerToken: string;
  const run = `E2E-AI-${Date.now()}`;
  const createdRequestIds: string[] = [];

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

  async function createRequest(fields: Record<string, unknown>) {
    const response = await http()
      .post("/api/v1/requests")
      .set(as(adminToken))
      .send(fields)
      .expect(201);
    createdRequestIds.push(response.body.id);
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
    if (createdRequestIds.length > 0) {
      // La suppression d'une demande emporte ses ai_analyses (ON DELETE CASCADE).
      await db.from("requests").delete().in("id", createdRequestIds);
    }
    await app.close();
  });

  describe("classification (section 71 : 7 catégories de référence)", () => {
    it.each(FIXTURES)(
      "classe correctement le cas %s",
      async (_label, fixture) => {
        const created = await createRequest({
          subject: `${run}-${fixture.subject}`,
          originalMessage: fixture.originalMessage,
          language: fixture.language ?? undefined,
          country: fixture.country ?? undefined,
        });

        // L'analyse est synchrone à la création : le statut et les champs
        // détectés sont déjà présents dans la réponse de POST.
        expect(created.status).toBe("ANALYZED");
        expect(created.detectedServiceSlug).toBe(fixture.expected.service);
        expect(typeof created.aiConfidence).toBe("number");
        expect(created.aiConfidence).toBeGreaterThanOrEqual(0);
        expect(created.aiConfidence).toBeLessThanOrEqual(1);

        const analyses = await http()
          .get(`/api/v1/requests/${created.id}/analyses`)
          .set(as(adminToken))
          .expect(200);
        expect(analyses.body).toHaveLength(1);
        expect(analyses.body[0]).toMatchObject({
          requestId: created.id,
          status: "COMPLETED",
          error: null,
        });
        expect(analyses.body[0].result.intent).toBe(fixture.expected.intent);
        expect(analyses.body[0].result.confidence).toBe(created.aiConfidence);
        expect(analyses.body[0].result.summary.length).toBeGreaterThan(0);
      },
    );
  });

  describe("cas ambigu (confiance faible → validation humaine, section 71)", () => {
    it("analyse quand même une demande vague, sans planter", async () => {
      const created = await createRequest({
        subject: `${run}-ambigu`,
        originalMessage: "Bonjour, il me faudrait un truc pour mon activité, vous pouvez m'aider ?",
      });

      expect(created.status).toBe("ANALYZED");
      const analyses = await http()
        .get(`/api/v1/requests/${created.id}/analyses`)
        .set(as(adminToken))
        .expect(200);
      expect(analyses.body[0].status).toBe("COMPLETED");
      // Une demande aussi vague doit lister des informations manquantes —
      // sur la confiance exacte, on ne peut pas figer une valeur produite
      // par un vrai modèle non déterministe.
      expect(analyses.body[0].result.missingInformation.length).toBeGreaterThan(0);
    });
  });

  describe("re-déclenchement manuel", () => {
    it("POST /requests/:id/analyze ajoute une nouvelle analyse à l'historique", async () => {
      const created = await createRequest({ subject: `${run}-retrigger` });

      const first = await http()
        .get(`/api/v1/requests/${created.id}/analyses`)
        .set(as(adminToken))
        .expect(200);
      expect(first.body).toHaveLength(1);

      await http()
        .post(`/api/v1/requests/${created.id}/analyze`)
        .set(as(adminToken))
        .expect(201);

      const second = await http()
        .get(`/api/v1/requests/${created.id}/analyses`)
        .set(as(adminToken))
        .expect(200);
      expect(second.body).toHaveLength(2);
      // La plus récente d'abord.
      expect(new Date(second.body[0].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(second.body[1].createdAt).getTime(),
      );
    });

    it("404 sur une demande inconnue", async () => {
      await http()
        .post(`/api/v1/requests/${UNKNOWN_UUID}/analyze`)
        .set(as(adminToken))
        .expect(404);
      await http()
        .get(`/api/v1/requests/${UNKNOWN_UUID}/analyses`)
        .set(as(adminToken))
        .expect(404);
    });
  });

  describe("RBAC", () => {
    let requestId: string;

    beforeAll(async () => {
      const created = await createRequest({ subject: `${run}-rbac` });
      requestId = created.id;
    });

    it("refuse le re-déclenchement à un VIEWER (403)", async () => {
      await http()
        .post(`/api/v1/requests/${requestId}/analyze`)
        .set(as(viewerToken))
        .expect(403);
    });

    it("autorise la lecture des analyses à un VIEWER (requests.read)", async () => {
      await http()
        .get(`/api/v1/requests/${requestId}/analyses`)
        .set(as(viewerToken))
        .expect(200);
    });

    it("refuse tout accès sans token (401)", async () => {
      await http().get(`/api/v1/requests/${requestId}/analyses`).expect(401);
      await http().post(`/api/v1/requests/${requestId}/analyze`).expect(401);
    });
  });

  describe("intégrité", () => {
    it("les erreurs ne divulguent aucun détail technique au client", async () => {
      const response = await http()
        .post(`/api/v1/requests/${UNKNOWN_UUID}/analyze`)
        .set(as(adminToken))
        .expect(404);
      expect(JSON.stringify(response.body)).not.toMatch(/anthropic|api key|postgres|stack/i);
    });
  });
});
