// Tests d'intégration des sessions de qualification (autosave, section
// 32) : l'application NestJS complète contre la VRAIE base Supabase de
// dev, avec de vrais JWT — et un vrai appel à l'API Anthropic à chaque
// création de `request` (analyse IA synchrone, Phase 8). Aucun mock.
//
// Un formulaire de test dédié (pas un des 5 formulaires du catalogue)
// isole ces tests de tout changement futur du contenu réel des
// formulaires métier.
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

const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000000";

describe("Sessions de qualification (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let adminToken: string;
  let viewerToken: string;
  // En minuscules : réutilisé tel quel dans des slugs de formulaire
  // (lettres minuscules/chiffres/tirets uniquement — voir CreateFormDto).
  const run = `e2e-qual-${Date.now()}`;
  const createdFormIds: string[] = [];
  const createdRequestIds: string[] = [];
  let testFormId: string;

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

  async function createRequest(): Promise<string> {
    const response = await http()
      .post("/api/v1/requests")
      .set(as(adminToken))
      .send({ subject: `${run}-request-${createdRequestIds.length}` })
      .expect(201);
    createdRequestIds.push(response.body.id);
    return response.body.id;
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

    // Formulaire de test dédié : 1 étape, un champ requis, un champ SELECT
    // à options, un champ conditionnel dépendant du SELECT.
    const form = await http()
      .post("/api/v1/forms")
      .set(as(adminToken))
      .send({ name: `${run}-form`, slug: `${run}-form` })
      .expect(201);
    testFormId = form.body.id;
    createdFormIds.push(testFormId);

    const step = await http()
      .post(`/api/v1/forms/${testFormId}/steps`)
      .set(as(adminToken))
      .send({ title: "Étape unique" })
      .expect(201);
    const stepId = step.body.id;

    await http()
      .post(`/api/v1/forms/${testFormId}/steps/${stepId}/fields`)
      .set(as(adminToken))
      .send({ key: "companyName", label: "Société", type: "TEXT", required: true })
      .expect(201);
    await http()
      .post(`/api/v1/forms/${testFormId}/steps/${stepId}/fields`)
      .set(as(adminToken))
      .send({
        key: "plan",
        label: "Formule",
        type: "SELECT",
        options: [
          { value: "BASIC", label: "Basique" },
          { value: "PRO", label: "Pro" },
        ],
      })
      .expect(201);
    await http()
      .post(`/api/v1/forms/${testFormId}/steps/${stepId}/fields`)
      .set(as(adminToken))
      .send({
        key: "proDetails",
        label: "Détails Pro",
        type: "TEXT",
        conditionalLogic: { field: "plan", equals: "PRO" },
      })
      .expect(201);

    // Un formulaire DRAFT ne peut pas être utilisé pour une qualification
    // (vérifié explicitement plus bas) : on le publie ici pour tous les
    // autres tests du fichier.
    await http()
      .patch(`/api/v1/forms/${testFormId}`)
      .set(as(adminToken))
      .send({ status: "PUBLISHED" })
      .expect(200);
  });

  afterAll(async () => {
    if (createdRequestIds.length > 0) {
      await db.from("requests").delete().in("id", createdRequestIds);
    }
    if (createdFormIds.length > 0) {
      await db.from("forms").delete().in("id", createdFormIds);
    }
    await app.close();
  });

  it("refuse la création sur une demande inconnue (404)", async () => {
    await http()
      .post(`/api/v1/requests/${UNKNOWN_UUID}/qualification-sessions`)
      .set(as(adminToken))
      .send({ formId: testFormId })
      .expect(404);
  });

  it("refuse la création avec un formulaire inconnu (404)", async () => {
    const requestId = await createRequest();
    await http()
      .post(`/api/v1/requests/${requestId}/qualification-sessions`)
      .set(as(adminToken))
      .send({ formId: UNKNOWN_UUID })
      .expect(404);
  });

  it("refuse un formulaire non publié (DRAFT, 400)", async () => {
    const draft = await http()
      .post("/api/v1/forms")
      .set(as(adminToken))
      .send({ name: `${run}-draft`, slug: `${run}-draft` })
      .expect(201);
    createdFormIds.push(draft.body.id);

    const requestId = await createRequest();
    await http()
      .post(`/api/v1/requests/${requestId}/qualification-sessions`)
      .set(as(adminToken))
      .send({ formId: draft.body.id })
      .expect(400);
  });

  it("refuse la création à un VIEWER (403)", async () => {
    const requestId = await createRequest();
    await http()
      .post(`/api/v1/requests/${requestId}/qualification-sessions`)
      .set(as(viewerToken))
      .send({ formId: testFormId })
      .expect(403);
  });

  describe("cycle de vie complet", () => {
    let requestId: string;
    let sessionId: string;

    it("crée une session (CREATED) avec une URL publique par token", async () => {
      requestId = await createRequest();
      const response = await http()
        .post(`/api/v1/requests/${requestId}/qualification-sessions`)
        .set(as(adminToken))
        .send({ formId: testFormId })
        .expect(201);
      sessionId = response.body.id;
      expect(response.body).toMatchObject({
        requestId,
        formId: testFormId,
        status: "CREATED",
        sentAt: null,
        openedAt: null,
        progressPercent: 0,
      });
      expect(new Date(response.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(response.body.qualificationUrl).toContain("/qualification/");
      // Le token brut ne doit jamais apparaître ailleurs qu'ici — l'id
      // interne de la session ne doit pas non plus fuiter dans l'URL.
      expect(response.body.qualificationUrl).not.toContain(sessionId);
    });

    it("un second appel réutilise la même session mais fait tourner le token (id stable, URL différente)", async () => {
      const first = await http()
        .post(`/api/v1/requests/${requestId}/qualification-sessions`)
        .set(as(adminToken))
        .send({ formId: testFormId })
        .expect(201);
      const second = await http()
        .post(`/api/v1/requests/${requestId}/qualification-sessions`)
        .set(as(adminToken))
        .send({ formId: testFormId })
        .expect(201);
      expect(second.body.id).toBe(sessionId);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body.qualificationUrl).not.toBe(first.body.qualificationUrl);
    });

    it("le soumettre sans rien répondre échoue (400, champ requis manquant)", async () => {
      const response = await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/submit`)
        .set(as(adminToken))
        .expect(400);
      expect(response.body.message).toContain("Société");
    });

    it("rejette une valeur hors des options pour un SELECT (400)", async () => {
      await http()
        .put(`/api/v1/qualification-sessions/${sessionId}/responses/plan`)
        .set(as(adminToken))
        .send({ value: "ENTERPRISE" })
        .expect(400);
    });

    it("rejette une réponse pour une clé de champ inconnue (404)", async () => {
      await http()
        .put(`/api/v1/qualification-sessions/${sessionId}/responses/nope`)
        .set(as(adminToken))
        .send({ value: "x" })
        .expect(404);
    });

    it("enregistre une réponse (autosave) et passe IN_PROGRESS", async () => {
      const response = await http()
        .put(`/api/v1/qualification-sessions/${sessionId}/responses/companyName`)
        .set(as(adminToken))
        .send({ value: "ACME Sàrl" })
        .expect(200);
      expect(response.body.status).toBe("IN_PROGRESS");
      expect(response.body.responses).toMatchObject({ companyName: "ACME Sàrl" });
      expect(response.body.startedAt).toBeTruthy();
    });

    it("enregistre le SELECT, la réponse est bien restaurée dans le détail", async () => {
      await http()
        .put(`/api/v1/qualification-sessions/${sessionId}/responses/plan`)
        .set(as(adminToken))
        .send({ value: "PRO" })
        .expect(200);

      const detail = await http()
        .get(`/api/v1/qualification-sessions/${sessionId}`)
        .set(as(adminToken))
        .expect(200);
      expect(detail.body.responses).toMatchObject({ companyName: "ACME Sàrl", plan: "PRO" });
      expect(detail.body.form.slug).toBe(`${run}-form`);
    });

    it("efface une réponse avec value: null", async () => {
      const response = await http()
        .put(`/api/v1/qualification-sessions/${sessionId}/responses/plan`)
        .set(as(adminToken))
        .send({ value: null })
        .expect(200);
      expect(response.body.responses.plan).toBeUndefined();
    });

    it("soumet la session une fois le champ requis répondu (COMPLETED)", async () => {
      const response = await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/submit`)
        .set(as(adminToken))
        .expect(201);
      expect(response.body.status).toBe("COMPLETED");
      expect(response.body.completedAt).toBeTruthy();
    });

    it("refuse toute nouvelle réponse une fois COMPLETED (400)", async () => {
      await http()
        .put(`/api/v1/qualification-sessions/${sessionId}/responses/companyName`)
        .set(as(adminToken))
        .send({ value: "Autre" })
        .expect(400);
    });

    it("refuse une seconde soumission (400)", async () => {
      await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/submit`)
        .set(as(adminToken))
        .expect(400);
    });

    it("un VIEWER peut lire la session mais pas y écrire", async () => {
      await http()
        .get(`/api/v1/qualification-sessions/${sessionId}`)
        .set(as(viewerToken))
        .expect(200);
      await http()
        .put(`/api/v1/qualification-sessions/${sessionId}/responses/companyName`)
        .set(as(viewerToken))
        .send({ value: "x" })
        .expect(403);
    });

    it("refuse révocation/prolongation/régénération d'une session terminée (COMPLETED)", async () => {
      await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/revoke`)
        .set(as(adminToken))
        .expect(400);
      await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/extend`)
        .set(as(adminToken))
        .expect(400);
      await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/regenerate`)
        .set(as(adminToken))
        .expect(400);
    });

    it("apparaît dans la liste des sessions de la demande, la plus récente en premier", async () => {
      const response = await http()
        .get(`/api/v1/requests/${requestId}/qualification-sessions`)
        .set(as(adminToken))
        .expect(200);
      expect(response.body[0].id).toBe(sessionId);
      // 1 réponse (companyName) sur 3 champs au total dans le formulaire
      // (plan a été effacé, proDetails jamais répondu) — la soumission n'a
      // exigé que le champ requis (companyName), pas la complétion à 100%.
      expect(response.body[0].progressPercent).toBe(33);
    });
  });

  describe("gestion admin du lien (section 37 : marquer envoyé, révoquer, prolonger, régénérer)", () => {
    let requestId: string;
    let sessionId: string;

    beforeAll(async () => {
      requestId = await createRequest();
      const created = await http()
        .post(`/api/v1/requests/${requestId}/qualification-sessions`)
        .set(as(adminToken))
        .send({ formId: testFormId })
        .expect(201);
      sessionId = created.body.id;
    });

    it("liste vide pour une demande sans lien", async () => {
      const otherRequestId = await createRequest();
      const response = await http()
        .get(`/api/v1/requests/${otherRequestId}/qualification-sessions`)
        .set(as(adminToken))
        .expect(200);
      expect(response.body).toEqual([]);
    });

    it("404 sur la liste d'une demande inconnue", async () => {
      await http()
        .get(`/api/v1/requests/${UNKNOWN_UUID}/qualification-sessions`)
        .set(as(adminToken))
        .expect(404);
    });

    it("refuse la gestion admin à un VIEWER (403)", async () => {
      await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/mark-sent`)
        .set(as(viewerToken))
        .expect(403);
      await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/revoke`)
        .set(as(viewerToken))
        .expect(403);
      await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/extend`)
        .set(as(viewerToken))
        .expect(403);
      await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/regenerate`)
        .set(as(viewerToken))
        .expect(403);
    });

    it("marque comme envoyé (SENT, sentAt renseigné), refuse un second marquage", async () => {
      const response = await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/mark-sent`)
        .set(as(adminToken))
        .expect(201);
      expect(response.body.status).toBe("SENT");
      expect(response.body.sentAt).toBeTruthy();

      await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/mark-sent`)
        .set(as(adminToken))
        .expect(400);
    });

    it("prolonge l'expiration (30 jours par défaut, ou un nombre de jours donné)", async () => {
      const before = await http()
        .get(`/api/v1/qualification-sessions/${sessionId}`)
        .set(as(adminToken))
        .expect(200);

      const extended = await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/extend`)
        .set(as(adminToken))
        .send({ days: 5 })
        .expect(201);
      expect(new Date(extended.body.expiresAt).getTime()).toBeGreaterThan(
        new Date(before.body.expiresAt).getTime(),
      );
    });

    it("rejette un nombre de jours hors bornes (400)", async () => {
      await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/extend`)
        .set(as(adminToken))
        .send({ days: 0 })
        .expect(400);
      await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/extend`)
        .set(as(adminToken))
        .send({ days: 1000 })
        .expect(400);
    });

    it("régénère le lien : nouvelle URL, id de session inchangé, réponses conservées", async () => {
      await http()
        .put(`/api/v1/qualification-sessions/${sessionId}/responses/companyName`)
        .set(as(adminToken))
        .send({ value: "ACME Sàrl" })
        .expect(200);

      const regenerated = await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/regenerate`)
        .set(as(adminToken))
        .expect(201);
      expect(regenerated.body.id).toBe(sessionId);
      expect(regenerated.body.qualificationUrl).toContain("/qualification/");
      // La progression déjà faite est conservée malgré la rotation du token.
      expect(regenerated.body.progressPercent).toBeGreaterThan(0);

      const detail = await http()
        .get(`/api/v1/qualification-sessions/${sessionId}`)
        .set(as(adminToken))
        .expect(200);
      expect(detail.body.responses).toMatchObject({ companyName: "ACME Sàrl" });
    });

    it("révoque le lien (CANCELLED), refuse une seconde révocation", async () => {
      const response = await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/revoke`)
        .set(as(adminToken))
        .expect(201);
      expect(response.body.status).toBe("CANCELLED");

      await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/revoke`)
        .set(as(adminToken))
        .expect(400);
    });

    it("un lien révoqué refuse prolongation et écriture", async () => {
      await http()
        .post(`/api/v1/qualification-sessions/${sessionId}/extend`)
        .set(as(adminToken))
        .expect(400);
      await http()
        .put(`/api/v1/qualification-sessions/${sessionId}/responses/companyName`)
        .set(as(adminToken))
        .send({ value: "x" })
        .expect(400);
    });
  });

  describe("intégrité", () => {
    it("les erreurs ne divulguent aucun détail technique au client", async () => {
      const response = await http()
        .get(`/api/v1/qualification-sessions/${UNKNOWN_UUID}`)
        .set(as(adminToken))
        .expect(404);
      expect(JSON.stringify(response.body)).not.toMatch(/postgres|relation|violates|constraint/i);
    });
  });
});
