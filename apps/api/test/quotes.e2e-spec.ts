// Tests d'intégration des devis (Phase 18, section 51) : l'application
// complète contre la VRAIE base Supabase de dev, de vrais emails (SMTP
// pour l'envoi du devis, IMAP pour vérifier sa réception et sa pièce
// jointe), de vrais PDF relus, le vrai Workflow Engine et de vraies
// notifications. Aucun mock. Le devis est envoyé à un alias « + » de la
// boîte de test — jamais à un tiers.
//
// L'identité de l'entreprise (company_settings, une seule ligne partagée)
// est modifiée pour le test puis restaurée à l'identique.
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
import pdfParse from "pdf-parse";
import request from "supertest";
import type { Database, QuoteResponse, TimelineEventResponse } from "@kps/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { EventBus } from "../src/events/event-bus.service";
import { SupabaseService } from "../src/supabase/supabase.service";

type CompanySettingsRow = Database["public"]["Tables"]["company_settings"]["Row"];

const ITEMS = [
  { description: "Conception et développement de l'application", quantity: 10, unitPrice: 1200, discountPercent: 0 },
  { description: "Reprise des données existantes", quantity: 1, unitPrice: 999.99, discountPercent: 10 },
  { description: "Formation des utilisateurs (jours)", quantity: 2.5, unitPrice: 80.4, discountPercent: 0 },
];

describe("Devis (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let eventBus: EventBus;
  let adminToken: string;
  let viewerToken: string;
  let salesId: string;
  let clientId: string;
  let opportunityId: string;
  let recipient: string;
  let originalSettings: CompanySettingsRow;
  const tag = `q${Date.now()}`;
  const run = `e2e-quote-${tag}`;
  const createdAuthUserIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdOpportunityIds: string[] = [];
  const createdQuoteIds: string[] = [];

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

  function alias(suffix: string): string {
    const [local, domain] = config.getOrThrow<string>("SMTP_USER").split("@");
    return `${local}+${tag}-${suffix}@${domain}`;
  }

  async function createSalesUser(): Promise<string> {
    const email = alias("sales");
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password: `Pw-${tag}-Sales-9!`,
      email_confirm: true,
    });
    if (error) throw error;
    createdAuthUserIds.push(created.user.id);
    const { data: role } = await db.from("roles").select("id").eq("key", "SALES").single();
    await db.from("users").insert({
      id: created.user.id,
      email,
      first_name: "Awa",
      last_name: `Test${tag}`,
      role_id: role!.id,
    });
    return created.user.id;
  }

  function imapClient(): ImapFlow {
    return new ImapFlow({
      host: config.getOrThrow<string>("IMAP_HOST"),
      port: Number(config.getOrThrow<string>("IMAP_PORT")),
      secure: true,
      auth: { user: config.getOrThrow<string>("IMAP_USER"), pass: config.getOrThrow<string>("IMAP_PASSWORD") },
      logger: false,
    });
  }

  // Attend l'email réellement reçu dont le sujet contient `marker`, et
  // renvoie son texte et ses pièces jointes.
  async function receivedEmail(marker: string, expectedCount = 1) {
    const deadline = Date.now() + 60_000;
    for (;;) {
      const imap = imapClient();
      await imap.connect();
      const lock = await imap.getMailboxLock("INBOX");
      try {
        const uids = await imap.search({ subject: marker, to: recipient }, { uid: true });
        if (Array.isArray(uids) && uids.length >= expectedCount) {
          const message = await imap.fetchOne(String(uids[uids.length - 1]), { source: true }, { uid: true });
          if (message && message.source) return simpleParser(message.source);
        }
      } finally {
        lock.release();
        await imap.logout().catch(() => undefined);
      }
      if (Date.now() > deadline) throw new Error(`Email « ${marker} » non reçu`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  async function pdfText(path: string, token = adminToken): Promise<string> {
    const response = await http().get(path).set(as(token)).responseType("blob").expect(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    const buffer = response.body as Buffer;
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    return (await pdfParse(buffer)).text;
  }

  async function quoteEvents(quoteId: string) {
    await eventBus.whenIdle();
    const { data } = await db
      .from("events")
      .select("type, actor_type, payload")
      .eq("entity_type", "quote")
      .eq("entity_id", quoteId)
      .order("created_at", { ascending: true });
    return data ?? [];
  }

  async function opportunityStatus(id: string): Promise<string> {
    await eventBus.whenIdle();
    const { data } = await db.from("opportunities").select("status").eq("id", id).single();
    return data!.status;
  }

  async function createOpportunity(body: Record<string, unknown>): Promise<string> {
    const created = await http().post("/api/v1/opportunities").set(as(adminToken)).send(body).expect(201);
    createdOpportunityIds.push(created.body.id);
    return created.body.id as string;
  }

  async function createQuote(body: Record<string, unknown>): Promise<QuoteResponse> {
    const created = await http().post("/api/v1/quotes").set(as(adminToken)).send(body).expect(201);
    createdQuoteIds.push(created.body.id);
    await eventBus.whenIdle();
    return created.body as QuoteResponse;
  }

  const content = (overrides: Record<string, unknown> = {}) => ({
    title: `${run} — application de planification`,
    notes: "Acompte de 30 % à la commande.",
    currency: "CHF",
    validUntil: "2027-01-31",
    discountPercent: 5,
    taxRate: 8.1,
    items: ITEMS,
    ...overrides,
  });

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
    salesId = await createSalesUser();
    recipient = alias("client");

    const { data: settings } = await db.from("company_settings").select("*").eq("id", true).single();
    originalSettings = settings!;
    await db.from("company_settings").update({ legal_name: null }).eq("id", true);

    const client = await http()
      .post("/api/v1/clients")
      .set(as(adminToken))
      .send({ companyName: `${run} SA`, country: "Suisse", city: "Lausanne" })
      .expect(201);
    clientId = client.body.id;
    await http()
      .post(`/api/v1/clients/${clientId}/contacts`)
      .set(as(adminToken))
      .send({ firstName: "Claire", lastName: "Dubois", email: recipient, isPrimary: true })
      .expect(201);

    opportunityId = await createOpportunity({
      title: `${run} — application de planification`,
      clientId,
      estimatedValue: 14000,
      ownerUserId: salesId,
    });
  });

  afterAll(async () => {
    await eventBus.whenIdle();
    if (originalSettings) {
      const { id: _id, updated_at: _updatedAt, ...fields } = originalSettings;
      await db.from("company_settings").update(fields).eq("id", true);
    }
    const subjects = [...createdQuoteIds, ...createdOpportunityIds];
    if (subjects.length > 0) {
      await db.from("workflow_runs").delete().in("subject_id", subjects);
      await db.from("events").delete().in("entity_id", subjects);
    }
    // Les devis partent avec leur opportunité (cascade).
    if (createdOpportunityIds.length > 0) await db.from("opportunities").delete().in("id", createdOpportunityIds);
    if (createdRequestIds.length > 0) await db.from("requests").delete().in("id", createdRequestIds);
    if (clientId) await db.from("clients").delete().eq("id", clientId);
    for (const id of createdAuthUserIds) await db.auth.admin.deleteUser(id);
    const imap = imapClient();
    await imap.connect();
    const lock = await imap.getMailboxLock("INBOX");
    try {
      const uids = await imap.search({ to: tag }, { uid: true });
      if (Array.isArray(uids) && uids.length > 0) await imap.messageDelete(uids, { uid: true });
    } finally {
      lock.release();
      await imap.logout().catch(() => undefined);
    }
    await app.close();
  });

  describe("identité de l'entreprise", () => {
    it("sans raison sociale, aucun PDF ni envoi n'est possible", async () => {
      const quote = await createQuote({ opportunityId, title: `${run} — sans identité` });
      const refused = await http().get(`/api/v1/quotes/${quote.id}/pdf`).set(as(adminToken)).expect(400);
      expect(refused.body.message).toContain("identité de l'entreprise");
      await http()
        .post(`/api/v1/quotes/${quote.id}/send`)
        .set(as(adminToken))
        .send({ to: recipient })
        .expect(400);
    });

    it("réservée aux administrateurs, validée, lisible par qui consulte les devis", async () => {
      const settings = {
        legalName: `${run} Agence Sàrl`,
        address: "Rue du Test 12",
        postalCode: "1003",
        city: "Lausanne",
        country: "Suisse",
        vatNumber: "CHE-000.000.000 TVA",
        email: null,
        phone: null,
        website: null,
        iban: null,
        defaultTaxRate: 8.1,
        quoteValidityDays: 45,
        quoteTerms: "Devis valable sous réserve de disponibilité de l'équipe.",
      };
      await http().put("/api/v1/company-settings").set(as(viewerToken)).send(settings).expect(403);
      await http()
        .put("/api/v1/company-settings")
        .set(as(adminToken))
        .send({ ...settings, defaultTaxRate: 150 })
        .expect(400);
      await http()
        .put("/api/v1/company-settings")
        .set(as(adminToken))
        .send({ ...settings, email: "pas-un-email" })
        .expect(400);

      const saved = await http().put("/api/v1/company-settings").set(as(adminToken)).send(settings).expect(200);
      expect(saved.body).toEqual(expect.objectContaining({ legalName: `${run} Agence Sàrl`, quoteValidityDays: 45 }));
      const read = await http().get("/api/v1/company-settings").set(as(viewerToken)).expect(200);
      expect(read.body.defaultTaxRate).toBe(8.1);
      await http().get("/api/v1/company-settings").expect(401);
    });
  });

  describe("cycle de vie d'un devis", () => {
    let quote: QuoteResponse;

    it("création : droits, validation, valeurs par défaut, opportunité à « Devis à préparer »", async () => {
      await http().get("/api/v1/quotes").expect(401);
      await http().post("/api/v1/quotes").set(as(viewerToken)).send({ opportunityId }).expect(403);
      await http()
        .post("/api/v1/quotes")
        .set(as(adminToken))
        .send({ opportunityId: "00000000-0000-4000-8000-000000000000" })
        .expect(400);
      // Un devis est toujours adressé à un client.
      const orphan = await createOpportunity({ title: `${run} — prospect sans fiche` });
      const refused = await http().post("/api/v1/quotes").set(as(adminToken)).send({ opportunityId: orphan }).expect(400);
      expect(refused.body.message).toContain("Rattachez d'abord un client");

      quote = await createQuote({ opportunityId });
      const expectedValidity = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(
        new Date(Date.now() + 45 * 86_400_000),
      );
      expect(quote.reference).toMatch(/^DEVIS-\d{4}-\d{4}$/);
      expect(quote).toEqual(
        expect.objectContaining({
          status: "DRAFT",
          title: `${run} — application de planification`,
          clientCompanyName: `${run} SA`,
          currency: "CHF",
          taxRate: 8.1,
          validUntil: expectedValidity,
          total: 0,
          items: [],
          versions: [],
          suggestedRecipient: recipient,
          createdByName: "Super Admin",
        }),
      );

      const events = await quoteEvents(quote.id);
      expect(events.map((e) => e.type)).toEqual(["QUOTE_CREATED"]);
      expect(await opportunityStatus(opportunityId)).toBe("PROPOSAL_REQUIRED");
    });

    it("contenu : totaux calculés par le serveur, lignes validées et remplacées en bloc", async () => {
      await http().put(`/api/v1/quotes/${quote.id}`).set(as(viewerToken)).send(content()).expect(403);
      await http()
        .put(`/api/v1/quotes/${quote.id}`)
        .set(as(adminToken))
        .send(content({ items: [{ ...ITEMS[0], description: "  " }] }))
        .expect(400);
      await http()
        .put(`/api/v1/quotes/${quote.id}`)
        .set(as(adminToken))
        .send(content({ items: [{ ...ITEMS[0], quantity: 0 }] }))
        .expect(400);
      // Un total fourni par le client n'est pas accepté.
      await http()
        .put(`/api/v1/quotes/${quote.id}`)
        .set(as(adminToken))
        .send(content({ items: [{ ...ITEMS[0], total: 1 }] }))
        .expect(400);
      await http().put(`/api/v1/quotes/${quote.id}`).set(as(adminToken)).send(content({ total: 1 })).expect(400);

      const saved = await http().put(`/api/v1/quotes/${quote.id}`).set(as(adminToken)).send(content()).expect(200);
      quote = saved.body as QuoteResponse;
      expect(quote.items.map((item) => item.total)).toEqual([12000, 899.99, 201]);
      expect(quote).toEqual(
        expect.objectContaining({ subtotal: 13100.99, discount: 655.05, taxAmount: 1008.12, total: 13454.06 }),
      );

      // Remplacement : pas d'accumulation de lignes.
      await http().put(`/api/v1/quotes/${quote.id}`).set(as(adminToken)).send(content()).expect(200);
      const { count } = await db
        .from("quote_items")
        .select("id", { count: "exact", head: true })
        .eq("quote_id", quote.id);
      expect(count).toBe(3);
      // Une sauvegarde refusée ne touche pas au contenu existant.
      const after = await http().get(`/api/v1/quotes/${quote.id}`).set(as(viewerToken)).expect(200);
      expect(after.body.total).toBe(13454.06);
    });

    it("PDF réel : références, mentions de l'entreprise, lignes et totaux", async () => {
      const text = await pdfText(`/api/v1/quotes/${quote.id}/pdf`, viewerToken);
      expect(text).toContain(quote.reference);
      expect(text).toContain(`${run} Agence Sàrl`);
      expect(text).toContain("CHE-000.000.000 TVA");
      expect(text).toContain(`${run} SA`);
      expect(text).toContain("Claire Dubois");
      expect(text).toContain("Conception et développement de l'application");
      expect(text).toContain("13 100.99");
      expect(text).toContain("-655.05");
      expect(text).toContain("TVA 8.1 %");
      expect(text).toContain("1 008.12");
      expect(text).toContain("13 454.06 CHF");
      expect(text).toContain("31.01.2027");
      expect(text).toContain("Acompte de 30 % à la commande.");
      expect(text).toContain("Devis valable sous réserve de disponibilité de l'équipe.");
      await http().get(`/api/v1/quotes/${quote.id}/pdf`).expect(401);
    });

    it("envoi : email réel reçu avec le PDF joint, version figée, opportunité à « Devis envoyé »", async () => {
      await http().post(`/api/v1/quotes/${quote.id}/send`).set(as(viewerToken)).send({ to: recipient }).expect(403);
      await http().post(`/api/v1/quotes/${quote.id}/send`).set(as(adminToken)).send({ to: "pas-un-email" }).expect(400);
      const empty = await createQuote({ opportunityId, title: `${run} — vide` });
      const refused = await http()
        .post(`/api/v1/quotes/${empty.id}/send`)
        .set(as(adminToken))
        .send({ to: recipient })
        .expect(400);
      expect(refused.body.message).toContain("au moins une ligne");

      const sent = await http()
        .post(`/api/v1/quotes/${quote.id}/send`)
        .set(as(adminToken))
        .send({ to: recipient, message: "Comme convenu lors de notre échange de mardi." })
        .expect(200);
      quote = sent.body as QuoteResponse;
      expect(quote.status).toBe("SENT");
      expect(quote.sentTo).toBe(recipient);
      expect(quote.sentAt).toBeTruthy();
      expect(quote.versions).toEqual([
        expect.objectContaining({ version: 1, total: 13454.06, currency: "CHF", sentTo: recipient, createdByName: "Super Admin" }),
      ]);

      const email = await receivedEmail(quote.reference);
      expect(email.subject).toBe(`Devis ${quote.reference} — ${run} — application de planification`);
      expect(email.text).toContain("Bonjour Claire,");
      expect(email.text).toContain("13 454.06 CHF TTC");
      expect(email.text).toContain("Comme convenu lors de notre échange de mardi.");
      expect(email.attachments).toHaveLength(1);
      expect(email.attachments[0]?.filename).toBe(`${quote.reference}.pdf`);
      expect(email.attachments[0]?.contentType).toBe("application/pdf");
      const attached = (await pdfParse(email.attachments[0]!.content)).text;
      expect(attached).toContain(quote.reference);
      expect(attached).toContain("13 454.06 CHF");

      const events = await quoteEvents(quote.id);
      expect(events.filter((e) => e.type === "QUOTE_SENT")).toHaveLength(1);
      expect(events.find((e) => e.type === "QUOTE_SENT")?.payload).toEqual(
        expect.objectContaining({ version: 1, sentTo: recipient, total: 13454.06 }),
      );
      expect(await opportunityStatus(opportunityId)).toBe("PROPOSAL_SENT");

      const { data: notified } = await db
        .from("notifications")
        .select("channel, title, link, related_entity_type")
        .eq("user_id", salesId)
        .eq("event_type", "QUOTE_SENT");
      expect(notified).toEqual([
        expect.objectContaining({ channel: "IN_APP", link: `/quotes/${quote.id}`, related_entity_type: "quote" }),
      ]);
      expect(notified?.[0]?.title).toContain(quote.reference);
    });

    it("un devis envoyé ne se modifie ni ne se renvoie : il faut le réviser", async () => {
      await http().put(`/api/v1/quotes/${quote.id}`).set(as(adminToken)).send(content({ discountPercent: 50 })).expect(409);
      await http().post(`/api/v1/quotes/${quote.id}/send`).set(as(adminToken)).send({ to: recipient }).expect(409);
      const unchanged = await http().get(`/api/v1/quotes/${quote.id}`).set(as(adminToken)).expect(200);
      expect(unchanged.body.total).toBe(13454.06);

      await http().post(`/api/v1/quotes/${quote.id}/revise`).set(as(viewerToken)).expect(403);
      const revised = await http().post(`/api/v1/quotes/${quote.id}/revise`).set(as(adminToken)).expect(200);
      expect(revised.body.status).toBe("DRAFT");
      expect((await quoteEvents(quote.id)).map((e) => e.type)).toContain("QUOTE_REVISED");
      // Réviser ne fait pas reculer l'opportunité.
      expect(await opportunityStatus(opportunityId)).toBe("PROPOSAL_SENT");
    });

    it("nouvelle version : l'historique garde l'ancienne à l'identique", async () => {
      await http()
        .put(`/api/v1/quotes/${quote.id}`)
        .set(as(adminToken))
        .send(content({ discountPercent: 10, notes: null }))
        .expect(200);
      const sent = await http()
        .post(`/api/v1/quotes/${quote.id}/send`)
        .set(as(adminToken))
        .send({ to: recipient })
        .expect(200);
      quote = sent.body as QuoteResponse;
      // 13 100.99 − 10 % = 11 790.89 ; TVA 8.1 % = 955.06.
      expect(quote.total).toBe(12745.95);
      expect(quote.versions.map((v) => [v.version, v.total])).toEqual([
        [2, 12745.95],
        [1, 13454.06],
      ]);

      const first = await pdfText(`/api/v1/quotes/${quote.id}/versions/1/pdf`, viewerToken);
      expect(first).toContain("Version : 1");
      expect(first).toContain("13 454.06 CHF");
      expect(first).toContain("Acompte de 30 % à la commande.");
      const second = await pdfText(`/api/v1/quotes/${quote.id}/versions/2/pdf`);
      expect(second).toContain("Version : 2");
      expect(second).toContain("12 745.95 CHF");
      expect(second).not.toContain("Acompte de 30 %");
      await http().get(`/api/v1/quotes/${quote.id}/versions/9/pdf`).set(as(adminToken)).expect(404);

      const email = await receivedEmail(quote.reference, 2);
      expect((await pdfParse(email.attachments[0]!.content)).text).toContain("12 745.95 CHF");
    });

    it("refus enregistré : motif tracé, opportunité en négociation, responsable notifié", async () => {
      await http().post(`/api/v1/quotes/${quote.id}/reject`).set(as(viewerToken)).send({}).expect(403);
      const rejected = await http()
        .post(`/api/v1/quotes/${quote.id}/reject`)
        .set(as(adminToken))
        .send({ reason: "Budget revu à la baisse" })
        .expect(200);
      expect(rejected.body).toEqual(
        expect.objectContaining({ status: "REJECTED", rejectionReason: "Budget revu à la baisse" }),
      );
      expect(rejected.body.rejectedAt).toBeTruthy();
      await http().post(`/api/v1/quotes/${quote.id}/accept`).set(as(adminToken)).expect(409);

      expect(await opportunityStatus(opportunityId)).toBe("NEGOTIATION");
      const { data: notified } = await db
        .from("notifications")
        .select("channel, body")
        .eq("user_id", salesId)
        .eq("event_type", "QUOTE_REJECTED");
      expect(notified).toHaveLength(1);
      expect(notified?.[0]?.body).toContain("Budget revu à la baisse");
    });

    it("acceptation enregistrée : opportunité gagnée, notification in-app et email, plus rien n'est modifiable", async () => {
      await http().post(`/api/v1/quotes/${quote.id}/revise`).set(as(adminToken)).expect(200);
      await http()
        .put(`/api/v1/quotes/${quote.id}`)
        .set(as(adminToken))
        .send(content({ discountPercent: 15, notes: null }))
        .expect(200);
      await http().post(`/api/v1/quotes/${quote.id}/send`).set(as(adminToken)).send({ to: recipient }).expect(200);
      await eventBus.whenIdle();

      const accepted = await http().post(`/api/v1/quotes/${quote.id}/accept`).set(as(adminToken)).expect(200);
      quote = accepted.body as QuoteResponse;
      expect(quote.status).toBe("ACCEPTED");
      expect(quote.acceptedAt).toBeTruthy();
      expect(quote.rejectionReason).toBeNull();
      expect(quote.versions).toHaveLength(3);

      expect(await opportunityStatus(opportunityId)).toBe("WON");
      const { data: notified } = await db
        .from("notifications")
        .select("channel")
        .eq("user_id", salesId)
        .eq("event_type", "QUOTE_ACCEPTED");
      expect(notified?.map((n) => n.channel).sort()).toEqual(["EMAIL", "IN_APP"]);

      await http().post(`/api/v1/quotes/${quote.id}/accept`).set(as(adminToken)).expect(409);
      await http().post(`/api/v1/quotes/${quote.id}/reject`).set(as(adminToken)).send({}).expect(409);
      await http().post(`/api/v1/quotes/${quote.id}/revise`).set(as(adminToken)).expect(409);
      await http().put(`/api/v1/quotes/${quote.id}`).set(as(adminToken)).send(content()).expect(409);

      const timeline = await http().get(`/api/v1/quotes/${quote.id}/timeline`).set(as(viewerToken)).expect(200);
      const types = (timeline.body as TimelineEventResponse[])
        .map((e) => e.type)
        .filter((type) => type !== "TEAM_NOTIFIED");
      expect(types).toEqual([
        "QUOTE_CREATED",
        "QUOTE_SENT",
        "QUOTE_REVISED",
        "QUOTE_SENT",
        "QUOTE_REJECTED",
        "QUOTE_REVISED",
        "QUOTE_SENT",
        "QUOTE_ACCEPTED",
      ]);
    });
  });

  it("liste : filtres, recherche, et devis expiré déduit de la date de validité", async () => {
    const expired = await createQuote({ opportunityId, title: `${run} — expiré` });
    // État posé directement en base : un devis envoyé il y a longtemps.
    await db.from("quotes").update({ status: "SENT", valid_until: "2026-01-01" }).eq("id", expired.id);

    const read = await http().get(`/api/v1/quotes/${expired.id}`).set(as(adminToken)).expect(200);
    expect(read.body.status).toBe("EXPIRED");

    const mine = await http().get("/api/v1/quotes").query({ opportunityId }).set(as(viewerToken)).expect(200);
    expect(mine.body.meta.total).toBe(createdQuoteIds.length);
    const byStatus = async (status: string) =>
      (await http().get("/api/v1/quotes").query({ opportunityId, status }).set(as(adminToken)).expect(200)).body.data.map(
        (q: { title: string }) => q.title,
      );
    expect(await byStatus("EXPIRED")).toEqual([`${run} — expiré`]);
    expect(await byStatus("SENT")).toEqual([]);
    expect(await byStatus("ACCEPTED")).toEqual([`${run} — application de planification`]);
    expect((await byStatus("DRAFT")).sort()).toEqual([`${run} — sans identité`, `${run} — vide`]);

    const byReference = await http().get("/api/v1/quotes").query({ search: expired.reference }).set(as(adminToken)).expect(200);
    expect(byReference.body.data.map((q: { id: string }) => q.id)).toEqual([expired.id]);
    const byClient = await http().get("/api/v1/quotes").query({ clientId, search: "sans identité" }).set(as(adminToken)).expect(200);
    expect(byClient.body.meta.total).toBe(1);
    await http().get("/api/v1/quotes/00000000-0000-4000-8000-000000000000").set(as(adminToken)).expect(404);
  });

  it("devis d'une demande : visible dans la timeline de la demande, dont le statut suit", async () => {
    const created = await http()
      .post("/api/v1/requests")
      .set(as(adminToken))
      .send({ subject: `${run} — demande avec devis`, originalMessage: "Besoin d'un site vitrine.", clientId })
      .expect(201);
    createdRequestIds.push(created.body.id);
    const linkedOpportunity = await createOpportunity({ requestId: created.body.id });
    const quote = await createQuote({ opportunityId: linkedOpportunity });
    expect(quote.requestId).toBe(created.body.id);

    // Devis créé → opportunité « Devis à préparer » → demande « Devis à préparer ».
    await eventBus.whenIdle();
    const { data: row } = await db.from("requests").select("status").eq("id", created.body.id).single();
    expect(row?.status).toBe("QUOTE_PENDING");

    const timeline = await http().get(`/api/v1/requests/${created.body.id}/timeline`).set(as(adminToken)).expect(200);
    const types = (timeline.body as TimelineEventResponse[]).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["OPPORTUNITY_CREATED", "QUOTE_CREATED", "OPPORTUNITY_STAGE_CHANGED"]));
    expect(types.indexOf("QUOTE_CREATED")).toBeLessThan(types.lastIndexOf("OPPORTUNITY_STAGE_CHANGED"));
  });
});
