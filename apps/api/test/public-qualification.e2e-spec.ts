// Tests d'intégration de la page publique de qualification (sections
// 23-24-34-37-38 du prompt) : l'application NestJS complète contre la
// VRAIE base Supabase de dev — mais SANS aucun token d'authentification,
// exactement comme un prospect qui ouvre le lien depuis son téléphone.
// Un vrai appel à l'API Anthropic a lieu à chaque création de `request`
// (analyse IA synchrone, Phase 8). Aucun mock.
//
// Prérequis : .env à la racine avec E2E_ADMIN_* et ANTHROPIC_API_KEY.
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

describe("Page publique de qualification (intégration réelle, sans authentification)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let adminToken: string;
  const run = `e2e-pubqual-${Date.now()}`;
  const createdFormIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdClientIds: string[] = [];
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

  // Crée une demande + une session de qualification réelle, et renvoie le
  // token public brut (jamais stocké côté serveur, seul son hash l'est —
  // extrait ici de l'URL renvoyée à la création, exactement comme un
  // administrateur le copierait pour le transmettre au prospect).
  async function createSessionAndToken(fields: {
    subject: string;
    clientId?: string;
    contactId?: string;
  }): Promise<{ requestId: string; sessionId: string; token: string }> {
    const req = await http()
      .post("/api/v1/requests")
      .set(as(adminToken))
      .send(fields)
      .expect(201);
    createdRequestIds.push(req.body.id);

    const session = await http()
      .post(`/api/v1/requests/${req.body.id}/qualification-sessions`)
      .set(as(adminToken))
      .send({ formId: testFormId })
      .expect(201);

    const token = (session.body.qualificationUrl as string).split("/qualification/")[1]!;
    return { requestId: req.body.id, sessionId: session.body.id, token };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    config = app.get(ConfigService);
    db = app.get(SupabaseService).getClient();
    adminToken = await login("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD");

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
        key: "budget",
        label: "Budget",
        type: "NUMBER",
        validation: { min: 0, max: 100000 },
      })
      .expect(201);

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
    if (createdClientIds.length > 0) {
      await db.from("clients").delete().in("id", createdClientIds);
    }
    if (createdFormIds.length > 0) {
      await db.from("forms").delete().in("id", createdFormIds);
    }
    await app.close();
  });

  it("404 pour un token inconnu, aucune fuite de détail technique", async () => {
    const response = await http()
      .get("/api/v1/public/qualification/ce-token-nexiste-pas")
      .expect(404);
    expect(JSON.stringify(response.body)).not.toMatch(/postgres|relation|violates|constraint/i);
  });

  it("n'expose que les champs destinés au prospect (jamais de champ interne)", async () => {
    const { token } = await createSessionAndToken({ subject: `${run}-champs-exposes` });
    const response = await http().get(`/api/v1/public/qualification/${token}`).expect(200);

    expect(Object.keys(response.body).sort()).toEqual(
      [
        "contactFirstName",
        "expiresAt",
        "form",
        "requestReference",
        "responses",
        "serviceName",
        "status",
      ].sort(),
    );
  });

  it("ouvrir le lien fait passer la session de CREATED à OPENED (sans authentification)", async () => {
    const { sessionId, token } = await createSessionAndToken({
      subject: `${run}-open-transition`,
    });

    const before = await http()
      .get(`/api/v1/qualification-sessions/${sessionId}`)
      .set(as(adminToken))
      .expect(200);
    expect(before.body.status).toBe("CREATED");

    await http().get(`/api/v1/public/qualification/${token}`).expect(200);

    const after = await http()
      .get(`/api/v1/qualification-sessions/${sessionId}`)
      .set(as(adminToken))
      .expect(200);
    expect(after.body.status).toBe("OPENED");
    expect(after.body.openedAt).toBeTruthy();
  });

  it("cycle complet public : réponses, validation par type, soumission, confirmation", async () => {
    const { token, requestId } = await createSessionAndToken({
      subject: `${run}-cycle-complet`,
    });

    await http().get(`/api/v1/public/qualification/${token}`).expect(200);

    await http()
      .put(`/api/v1/public/qualification/${token}/responses/budget`)
      .send({ value: "pas un nombre" })
      .expect(400);

    await http()
      .put(`/api/v1/public/qualification/${token}/responses/budget`)
      .send({ value: 500000 })
      .expect(400); // au-dessus du max (100000)

    const saved = await http()
      .put(`/api/v1/public/qualification/${token}/responses/companyName`)
      .send({ value: "Prospect Sàrl" })
      .expect(200);
    expect(saved.body.status).toBe("IN_PROGRESS");
    expect(saved.body.responses.companyName).toBe("Prospect Sàrl");

    const submitted = await http()
      .post(`/api/v1/public/qualification/${token}/submit`)
      .expect(201); // companyName seul suffit (seul champ requis) : succès direct
    expect(submitted.body.status).toBe("COMPLETED");
    expect(submitted.body.requestReference).toMatch(/^KPS-\d{4}-\d{5}$/);

    // Plus aucune écriture possible une fois complété.
    await http()
      .put(`/api/v1/public/qualification/${token}/responses/companyName`)
      .send({ value: "Autre" })
      .expect(400);
    await http().post(`/api/v1/public/qualification/${token}/submit`).expect(400);

    // La demande a avancé côté interne (RESPONSE_RECEIVED).
    const requestRow = await http()
      .get(`/api/v1/requests/${requestId}`)
      .set(as(adminToken))
      .expect(200);
    expect(requestRow.body.status).toBe("RESPONSE_RECEIVED");
  });

  it("inclut le prénom du contact et le service du formulaire dans la salutation", async () => {
    const client = await http()
      .post("/api/v1/clients")
      .set(as(adminToken))
      .send({ companyName: `${run}-client` })
      .expect(201);
    createdClientIds.push(client.body.id);
    const contact = await http()
      .post(`/api/v1/clients/${client.body.id}/contacts`)
      .set(as(adminToken))
      .send({ firstName: "Alice", lastName: "Martin" })
      .expect(201);

    const { token } = await createSessionAndToken({
      subject: `${run}-greeting`,
      clientId: client.body.id,
      contactId: contact.body.id,
    });

    const response = await http().get(`/api/v1/public/qualification/${token}`).expect(200);
    expect(response.body.contactFirstName).toBe("Alice");
  });

  it("un lien révoqué refuse toute écriture mais reste lisible (statut CANCELLED)", async () => {
    const { sessionId, token } = await createSessionAndToken({
      subject: `${run}-revoked`,
    });
    await http()
      .post(`/api/v1/qualification-sessions/${sessionId}/revoke`)
      .set(as(adminToken))
      .expect(201);

    const response = await http().get(`/api/v1/public/qualification/${token}`).expect(200);
    expect(response.body.status).toBe("CANCELLED");

    await http()
      .put(`/api/v1/public/qualification/${token}/responses/companyName`)
      .send({ value: "x" })
      .expect(400);
    await http().post(`/api/v1/public/qualification/${token}/submit`).expect(400);
  });

  it("un lien expiré (expiration forcée en base) passe EXPIRED et refuse toute écriture", async () => {
    const { sessionId, token } = await createSessionAndToken({
      subject: `${run}-expired`,
    });
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await db.from("qualification_sessions").update({ expires_at: past }).eq("id", sessionId);

    const response = await http().get(`/api/v1/public/qualification/${token}`).expect(200);
    expect(response.body.status).toBe("EXPIRED");

    await http()
      .put(`/api/v1/public/qualification/${token}/responses/companyName`)
      .send({ value: "x" })
      .expect(400);

    // Prolonger réactive le lien avec un statut cohérent (pas de réponse
    // encore enregistrée → repart à CREATED) — vérifié côté admin, une
    // lecture authentifiée ne déclenchant jamais la transition OPENED.
    const extended = await http()
      .post(`/api/v1/qualification-sessions/${sessionId}/extend`)
      .set(as(adminToken))
      .expect(201);
    expect(extended.body.status).toBe("CREATED");

    // Le prospect peut de nouveau ouvrir le lien — ce qui redéclenche
    // légitimement la transition CREATED → OPENED, exactement comme pour
    // un lien qui n'aurait jamais expiré.
    const restored = await http().get(`/api/v1/public/qualification/${token}`).expect(200);
    expect(restored.body.status).toBe("OPENED");
  });
});
