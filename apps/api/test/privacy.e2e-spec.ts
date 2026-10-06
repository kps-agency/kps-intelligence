// Tests d'intégration RGPD et langue du prospect (Phase 22, sections 65
// et 66) : l'application complète contre la VRAIE base Supabase de dev et
// le VRAI stockage. Aucun mock. Les données personnelles utilisées sont
// fictives, créées pour le test et supprimées à la fin.
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
import type {
  ContactAnonymizationResponse,
  ContactPersonalDataExport,
  Database,
  PublicQualificationSessionResponse,
} from "@kps/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { EventBus } from "../src/events/event-bus.service";
import { SupabaseService } from "../src/supabase/supabase.service";

const PDF = Buffer.from("%PDF-1.4\n% cahier des charges du prospect\n%%EOF\n");

describe("RGPD et langue du prospect (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let eventBus: EventBus;
  let adminToken: string;
  let viewerToken: string;
  let adminId: string;
  let clientId: string;
  let contactId: string;
  let requestId: string;
  let englishRequestId: string;
  let opportunityId: string;
  let formId: string;
  let token: string;
  let documentPath: string;
  const tag = `p${Date.now()}`;
  const run = `e2e-privacy-${tag}`;
  const email = `claire.${tag}@example.test`;

  const http = () => request(app.getHttpServer());
  const as = (bearer: string) => ({ Authorization: `Bearer ${bearer}` });

  async function signIn(address: string, password: string): Promise<string> {
    const response = await fetch(
      `${config.getOrThrow<string>("SUPABASE_URL")}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: config.getOrThrow<string>("SUPABASE_PUBLISHABLE_KEY"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: address, password }),
      },
    );
    const body = (await response.json()) as { access_token?: string };
    if (!body.access_token) throw new Error(`Connexion impossible pour ${address}`);
    return body.access_token;
  }

  async function insertRequest(subject: string, language: string | null): Promise<string> {
    const { data, error } = await db
      .from("requests")
      .insert({
        subject,
        original_message: "Bonjour, je suis Claire Dubois, joignable au 079 000 00 00. Nous voulons refaire notre site.",
        source: "EMAIL",
        language,
        client_id: clientId,
        contact_id: contactId,
        status: "ANALYZED",
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
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
    adminId = (await http().get("/api/v1/users/me").set(as(adminToken)).expect(200)).body.id;

    clientId = (
      await http().post("/api/v1/clients").set(as(adminToken)).send({ companyName: `${run} SA` }).expect(201)
    ).body.id;
    contactId = (
      await http()
        .post(`/api/v1/clients/${clientId}/contacts`)
        .set(as(adminToken))
        .send({ firstName: "Claire", lastName: "Dubois", email, phone: "+41 79 000 00 00", position: "Directrice" })
        .expect(201)
    ).body.id;

    // Demandes posées directement en base (comme l'ingestion le ferait),
    // l'une en français, l'autre détectée en anglais.
    requestId = await insertRequest(`${run} — refonte du site de Claire Dubois`, "fr");
    englishRequestId = await insertRequest(`${run} — website redesign`, "en-GB");

    // Échanges avec la personne.
    const { data: conversation } = await db
      .from("conversations")
      .insert({ request_id: requestId, contact_id: contactId, client_id: clientId, channel: "EMAIL" })
      .select("id")
      .single();
    await db.from("conversation_messages").insert([
      { conversation_id: conversation!.id, direction: "INBOUND", channel: "EMAIL", from_address: email, from_name: "Claire Dubois", subject: "Refonte", body: "Voici mon numéro personnel : 079 000 00 00." },
      { conversation_id: conversation!.id, direction: "OUTBOUND", channel: "EMAIL", to_address: email, subject: "Re: Refonte", body: "Lien de qualification envoyé." },
    ]);
    await db.from("ai_analyses").insert({
      request_id: requestId,
      kind: "REQUEST_ANALYSIS",
      status: "COMPLETED",
      model: "test",
      prompt_version: "test",
      result: { summary: "Claire Dubois souhaite refaire son site." },
    });
    const { data: opportunity } = await db
      .from("opportunities")
      .insert({ request_id: requestId, client_id: clientId, title: `${run} — refonte`, description: "Claire Dubois souhaite refaire son site." })
      .select("id")
      .single();
    opportunityId = opportunity!.id;

    // Formulaire de qualification et lien public.
    formId = (
      await http().post("/api/v1/forms").set(as(adminToken)).send({ name: `${run}-form`, slug: `${run}-form` }).expect(201)
    ).body.id;
    const step = await http().post(`/api/v1/forms/${formId}/steps`).set(as(adminToken)).send({ title: "Projet" }).expect(201);
    await http()
      .post(`/api/v1/forms/${formId}/steps/${step.body.id}/fields`)
      .set(as(adminToken))
      .send({ key: "description", label: "Décrivez votre projet", type: "TEXTAREA", required: true })
      .expect(201);
    await http().patch(`/api/v1/forms/${formId}`).set(as(adminToken)).send({ status: "PUBLISHED" }).expect(200);
    const session = await http()
      .post(`/api/v1/requests/${requestId}/qualification-sessions`)
      .set(as(adminToken))
      .send({ formId })
      .expect(201);
    token = (session.body.qualificationUrl as string).split("/qualification/")[1]!;

    // Document déposé sur la demande.
    const uploaded = await http()
      .post("/api/v1/documents")
      .set(as(adminToken))
      .field("entityType", "request")
      .field("entityId", requestId)
      .attach("file", PDF, { filename: "cahier-des-charges.pdf", contentType: "application/pdf" })
      .expect(201);
    const { data: document } = await db.from("documents").select("storage_path").eq("id", uploaded.body.id).single();
    documentPath = document!.storage_path;
  });

  afterAll(async () => {
    await eventBus.whenIdle();
    const requestIds = [requestId, englishRequestId].filter(Boolean);
    await db.from("audit_logs").delete().eq("entity_id", contactId);
    const { data: leftovers } = await db.from("documents").select("id, storage_path").in("entity_id", requestIds);
    if (leftovers && leftovers.length > 0) {
      await db.storage.from("documents").remove(leftovers.map((d) => d.storage_path));
      await db.from("documents").delete().in("id", leftovers.map((d) => d.id));
    }
    if (opportunityId) {
      await db.from("workflow_runs").delete().eq("subject_id", opportunityId);
      await db.from("events").delete().eq("entity_id", opportunityId);
    }
    if (requestIds.length > 0) await db.from("requests").delete().in("id", requestIds);
    if (formId) await db.from("forms").delete().eq("id", formId);
    if (clientId) await db.from("clients").delete().eq("id", clientId);
    await app.close();
  });

  describe("page publique : langue et consentement", () => {
    it("la page s'adresse au prospect dans la langue de sa demande", async () => {
      const french = await http().get(`/api/v1/public/qualification/${token}`).expect(200);
      expect((french.body as PublicQualificationSessionResponse).language).toBe("fr");

      const session = await http()
        .post(`/api/v1/requests/${englishRequestId}/qualification-sessions`)
        .set(as(adminToken))
        .send({ formId })
        .expect(201);
      const englishToken = (session.body.qualificationUrl as string).split("/qualification/")[1]!;
      const english = await http().get(`/api/v1/public/qualification/${englishToken}`).expect(200);
      expect((english.body as PublicQualificationSessionResponse).language).toBe("en");
    });

    it("sans accord explicite, les réponses ne sont pas envoyées ; avec, l'accord est daté et versionné", async () => {
      await http()
        .put(`/api/v1/public/qualification/${token}/responses/description`)
        .send({ value: "Site vitrine de 10 pages, je m'appelle Claire Dubois." })
        .expect(200);

      const refused = await http().post(`/api/v1/public/qualification/${token}/submit`).expect(400);
      expect(refused.body.message).toContain("accord");
      await http().post(`/api/v1/public/qualification/${token}/submit`).send({ consent: false }).expect(400);
      await http().post(`/api/v1/public/qualification/${token}/submit`).send({ consent: "oui" }).expect(400);
      const { data: pending } = await db
        .from("qualification_sessions")
        .select("status, consent_at")
        .eq("request_id", requestId)
        .single();
      expect(pending).toEqual({ status: "IN_PROGRESS", consent_at: null });

      const submitted = await http().post(`/api/v1/public/qualification/${token}/submit`).send({ consent: true }).expect(201);
      expect(submitted.body.status).toBe("COMPLETED");
      const { data: done } = await db
        .from("qualification_sessions")
        .select("status, consent_at, consent_version")
        .eq("request_id", requestId)
        .single();
      expect(done?.status).toBe("COMPLETED");
      expect(done?.consent_version).toBe("2026-10");
      expect(Date.now() - new Date(done!.consent_at!).getTime()).toBeLessThan(60_000);
      await eventBus.whenIdle();
    });
  });

  describe("droit d'accès : export des données d'un contact", () => {
    it("réservé aux administrateurs", async () => {
      await http().get(`/api/v1/contacts/${contactId}/personal-data`).expect(401);
      await http().get(`/api/v1/contacts/${contactId}/personal-data`).set(as(viewerToken)).expect(403);
      await http().post(`/api/v1/contacts/${contactId}/anonymize`).set(as(viewerToken)).expect(403);
      await http()
        .get("/api/v1/contacts/00000000-0000-4000-8000-000000000000/personal-data")
        .set(as(adminToken))
        .expect(404);
    });

    it("rassemble tout ce qui est détenu sur la personne, et trace l'export", async () => {
      const response = await http().get(`/api/v1/contacts/${contactId}/personal-data`).set(as(adminToken)).expect(200);
      const data = response.body as ContactPersonalDataExport;

      expect(data.contact).toEqual(
        expect.objectContaining({ firstName: "Claire", lastName: "Dubois", email, position: "Directrice", company: `${run} SA`, anonymizedAt: null }),
      );
      expect(data.requests.map((r) => r.subject).sort()).toEqual([
        `${run} — refonte du site de Claire Dubois`,
        `${run} — website redesign`,
      ]);
      expect(data.requests[0]?.message).toContain("079 000 00 00");
      expect(data.messages.map((m) => [m.direction, m.body]).sort()).toEqual([
        ["INBOUND", "Voici mon numéro personnel : 079 000 00 00."],
        ["OUTBOUND", "Lien de qualification envoyé."],
      ]);
      const completed = data.qualifications.find((q) => q.status === "COMPLETED");
      expect(completed).toEqual(
        expect.objectContaining({
          form: `${run}-form`,
          consentVersion: "2026-10",
          answers: [{ question: "Décrivez votre projet", answer: "Site vitrine de 10 pages, je m'appelle Claire Dubois." }],
        }),
      );
      expect(data.documents).toEqual([
        expect.objectContaining({ name: "cahier-des-charges.pdf", mimeType: "application/pdf", size: PDF.length }),
      ]);

      const { data: audit } = await db
        .from("audit_logs")
        .select("user_id, action, new_value")
        .eq("entity_id", contactId)
        .eq("action", "CONTACT_DATA_EXPORTED");
      expect(audit).toHaveLength(1);
      expect(audit?.[0]).toEqual(
        expect.objectContaining({ user_id: adminId, new_value: { requests: 2, messages: 2, qualifications: 2, documents: 1 } }),
      );
    });
  });

  describe("droit à l'effacement : anonymisation d'un contact", () => {
    let result: ContactAnonymizationResponse;

    it("efface les données personnelles en une fois et en rend compte", async () => {
      const response = await http().post(`/api/v1/contacts/${contactId}/anonymize`).set(as(adminToken)).expect(200);
      result = response.body as ContactAnonymizationResponse;
      expect(result.contactId).toBe(contactId);
      expect(result.filesRemaining).toBe(0);
      expect(result.erased).toEqual(
        expect.objectContaining({ requests: 2, messages: 2, formResponses: 1, documents: 1 }),
      );
      expect(result.erased.aiAnalyses).toBeGreaterThanOrEqual(1);
    });

    it("il ne reste aucune donnée de la personne en base ni dans le stockage", async () => {
      const { data: contact } = await db.from("contacts").select("*").eq("id", contactId).single();
      expect(contact).toEqual(
        expect.objectContaining({ first_name: "Contact", last_name: "anonymisé", email: null, phone: null, whatsapp: null, position: null }),
      );
      expect(contact?.anonymized_at).toBeTruthy();

      const { data: requests } = await db.from("requests").select("subject, original_message").in("id", [requestId, englishRequestId]);
      expect(requests).toEqual([
        { subject: "Demande anonymisée", original_message: null },
        { subject: "Demande anonymisée", original_message: null },
      ]);

      const { data: conversations } = await db.from("conversations").select("id").eq("request_id", requestId);
      const { count: messages } = await db
        .from("conversation_messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", conversations!.map((c) => c.id));
      expect(messages).toBe(0);
      const { data: sessions } = await db.from("qualification_sessions").select("id").in("request_id", [requestId, englishRequestId]);
      const { count: responses } = await db
        .from("form_responses")
        .select("id", { count: "exact", head: true })
        .in("qualification_session_id", sessions!.map((s) => s.id));
      expect(responses).toBe(0);
      const { count: analyses } = await db
        .from("ai_analyses")
        .select("id", { count: "exact", head: true })
        .in("request_id", [requestId, englishRequestId]);
      expect(analyses).toBe(0);
      const { count: documents } = await db
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", requestId);
      expect(documents).toBe(0);

      const file = await db.storage.from("documents").download(documentPath);
      expect(file.data).toBeNull();
      expect(file.error).toBeTruthy();

      // Plus aucune trace du nom, de l'email ou du téléphone dans ce qui reste lié à ses demandes.
      const { data: events } = await db.from("events").select("payload").in("request_id", [requestId, englishRequestId]);
      const { data: notifications } = await db.from("notifications").select("title, body").in("related_entity_id", [requestId, englishRequestId]);
      const remaining = JSON.stringify({ events, notifications, requests, contact });
      expect(remaining).not.toMatch(/Dubois|Claire|079 000|example\.test/);
    });

    it("les objets commerciaux sont conservés, vidés de ce qui identifie la personne", async () => {
      const kept = await http().get(`/api/v1/requests/${requestId}`).set(as(adminToken)).expect(200);
      expect(kept.body.reference).toMatch(/^KPS-\d{4}-\d{5}$/);
      expect(kept.body).toEqual(expect.objectContaining({ subject: "Demande anonymisée", originalMessage: null, contactFullName: "Contact anonymisé" }));

      const opportunity = await http().get(`/api/v1/opportunities/${opportunityId}`).set(as(adminToken)).expect(200);
      expect(opportunity.body).toEqual(expect.objectContaining({ title: `${run} — refonte`, description: null, clientId }));

      const contact = await http().get(`/api/v1/contacts/${contactId}`).set(as(viewerToken)).expect(200);
      expect(contact.body.anonymizedAt).toBeTruthy();
      expect(contact.body.email).toBeNull();
    });

    it("l'effacement est tracé sans recopier ce qui a été effacé, et ne se rejoue pas", async () => {
      const { data: audit } = await db
        .from("audit_logs")
        .select("user_id, action, entity_type, new_value, old_value")
        .eq("entity_id", contactId)
        .eq("action", "CONTACT_ANONYMIZED");
      expect(audit).toHaveLength(1);
      expect(audit?.[0]).toEqual(expect.objectContaining({ user_id: adminId, entity_type: "contact", old_value: null }));
      expect(audit?.[0]?.new_value).toEqual(result.erased);
      expect(JSON.stringify(audit)).not.toMatch(/Dubois|Claire|example\.test/);

      await http().post(`/api/v1/contacts/${contactId}/anonymize`).set(as(adminToken)).expect(409);
      await http().post("/api/v1/contacts/00000000-0000-4000-8000-000000000000/anonymize").set(as(adminToken)).expect(404);

      const after = (await http().get(`/api/v1/contacts/${contactId}/personal-data`).set(as(adminToken)).expect(200))
        .body as ContactPersonalDataExport;
      expect(after.contact.anonymizedAt).toBeTruthy();
      expect(after.messages).toEqual([]);
      expect(after.documents).toEqual([]);
      expect(after.qualifications.every((q) => q.answers.length === 0)).toBe(true);
      expect(JSON.stringify(after)).not.toMatch(/Dubois|Claire|079 000|example\.test/);
    });
  });
});
