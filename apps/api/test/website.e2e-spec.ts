// Tests d'intégration du webhook des sites (formulaires akoraweb) : l'API
// complète contre la VRAIE base Supabase de dev, un vrai appel à Claude et
// un vrai envoi du lien de qualification par les workflows. Aucun mock :
// les requêtes sont signées exactement comme le fait le site
// (akoraweb/lib/kps.ts).
//
// Prérequis : .env complet et `docker compose up -d redis`.
// Lancer : pnpm --filter @kps/api test:e2e -- website

process.env.LOG_LEVEL = "silent";
process.env.RATE_LIMIT_MAX = "5000";
const SECRET = `e2e-website-secret-${Date.now()}`;
process.env.WEBSITE_WEBHOOK_SECRETS = `akoraweb:${SECRET}`;

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import request from "supertest";
import type { Database } from "@kps/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { EventBus } from "../src/events/event-bus.service";
import { SupabaseService } from "../src/supabase/supabase.service";
import { signWebsitePayload } from "../src/website/website-signature";

describe("Webhook des sites (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  const tag = `web${Date.now()}`;
  const createdRequestIds: string[] = [];
  const createdClientIds: string[] = [];

  const prospectEmail = (label: string) => {
    const [local, domain] = config.getOrThrow<string>("SMTP_USER").split("@");
    return `${local}+${tag}-${label}@${domain}`.toLowerCase();
  };

  function post(site: string, payload: unknown, options: { secret?: string; timestamp?: number } = {}) {
    const body = JSON.stringify(payload);
    const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
    return request(app.getHttpServer())
      .post(`/api/v1/webhooks/website/${site}`)
      .set("Content-Type", "application/json")
      .set("X-KPS-Timestamp", timestamp)
      .set("X-KPS-Signature", signWebsitePayload(body, timestamp, options.secret ?? SECRET))
      .send(body);
  }

  function quote(label: string, overrides: Record<string, unknown> = {}) {
    return {
      externalId: `${tag}-${label}`,
      formType: "quote",
      contact: { name: "Claire Martin", email: prospectEmail(label), phone: "+41 79 555 12 34" },
      subject: "Demande de devis — Création de site internet",
      message:
        "Bonjour, nous souhaitons créer le site vitrine de notre cabinet d'architectes à Genève : " +
        "6 pages, portfolio de projets, formulaire de contact, FR/EN.",
      fields: [
        { label: "Type de projet", value: "Création de site internet" },
        { label: "Budget", value: "3 500 € – 7 000 €" },
      ],
      locale: "fr",
      ...overrides,
    };
  }

  async function waitFor<T>(probe: () => Promise<T | null>, timeoutMs = 90_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await probe();
      if (value !== null) return value;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("Délai dépassé");
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    // rawBody : comme main.ts, sinon aucune signature ne peut être vérifiée.
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();

    config = app.get(ConfigService);
    db = app.get(SupabaseService).getClient();
  });

  afterAll(async () => {
    // L'analyse IA tourne en arrière-plan après la réponse du webhook :
    // supprimer une demande pendant son analyse ferait échouer celle-ci.
    for (const requestId of createdRequestIds) {
      await waitFor(async () => {
        const { data } = await db.from("ai_analyses").select("id").eq("request_id", requestId).limit(1);
        return data && data.length > 0 ? data : null;
      }).catch(() => undefined);
    }
    await app.get(EventBus).whenIdle();
    if (createdRequestIds.length > 0) {
      await db.from("conversations").delete().in("request_id", createdRequestIds);
      await db.from("requests").delete().in("id", createdRequestIds);
    }
    if (createdClientIds.length > 0) await db.from("clients").delete().in("id", createdClientIds);
    const imap = new ImapFlow({
      host: config.getOrThrow<string>("IMAP_HOST"),
      port: Number(config.getOrThrow<string>("IMAP_PORT")),
      secure: true,
      auth: {
        user: config.getOrThrow<string>("IMAP_USER"),
        pass: config.getOrThrow<string>("IMAP_PASSWORD"),
      },
      logger: false,
    });
    await imap.connect();
    const lock = await imap.getMailboxLock("INBOX");
    try {
      const uids = await imap.search({ to: tag }, { uid: true });
      if (Array.isArray(uids) && uids.length > 0) await imap.messageDelete(uids, { uid: true });
    } finally {
      lock.release();
      await imap.logout();
    }
    await app.close();
  });

  it("crée une demande WEBSITE, l'analyse et envoie le lien de qualification par email", async () => {
    const response = await post("akoraweb", quote("full")).expect(200);
    expect(response.body.alreadyExisted).toBe(false);
    expect(response.body.reference).toEqual(expect.any(String));
    const requestId = response.body.requestId as string;
    createdRequestIds.push(requestId);

    const { data: row } = await db.from("requests").select("*").eq("id", requestId).single();
    expect(row?.source).toBe("WEBSITE");
    expect(row?.channel).toBe("akoraweb");
    expect(row?.language).toBe("fr");
    expect(row?.website_submission_id).toBe(`akoraweb:quote:${tag}-full`);
    expect(row?.original_message).toContain("cabinet d'architectes");
    expect(row?.original_message).toContain("Budget : 3 500 € – 7 000 €");
    expect(row?.original_message).toContain(`Email : ${prospectEmail("full")}`);

    // Le prospect est joignable par email : conversation EMAIL à son nom.
    const { data: conversation } = await db
      .from("conversations")
      .select("id, channel, conversation_messages(direction, from_address, from_name)")
      .eq("request_id", requestId)
      .single();
    expect(conversation?.channel).toBe("EMAIL");
    expect(conversation?.conversation_messages).toEqual([
      { direction: "INBOUND", from_address: prospectEmail("full"), from_name: "Claire Martin" },
    ]);

    // Analyse en arrière-plan puis workflows existants : lien envoyé.
    const session = await waitFor(async () => {
      const { data } = await db
        .from("qualification_sessions")
        .select("id, status")
        .eq("request_id", requestId)
        .eq("status", "SENT")
        .maybeSingle();
      return data;
    });
    expect(session.status).toBe("SENT");
    const { data: outbound } = await db
      .from("conversation_messages")
      .select("to_address")
      .eq("conversation_id", conversation!.id)
      .eq("direction", "OUTBOUND");
    expect(outbound).toEqual([{ to_address: prospectEmail("full") }]);
  }, 120_000);

  it("une soumission renvoyée ne crée jamais une seconde demande", async () => {
    const first = await post("akoraweb", quote("replay")).expect(200);
    createdRequestIds.push(first.body.requestId);
    const second = await post("akoraweb", quote("replay")).expect(200);

    expect(second.body).toEqual({ ...first.body, alreadyExisted: true });
    const { count } = await db
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("website_submission_id", `akoraweb:quote:${tag}-replay`);
    expect(count).toBe(1);
  });

  it("rattache la demande au contact existant qui a cette adresse email", async () => {
    const { data: client } = await db
      .from("clients")
      .insert({ company_name: `${tag} Architectes SA` })
      .select("id")
      .single();
    createdClientIds.push(client!.id);
    const { data: contact } = await db
      .from("contacts")
      .insert({
        client_id: client!.id,
        first_name: "Claire",
        last_name: "Martin",
        email: prospectEmail("known").toUpperCase(),
      })
      .select("id")
      .single();

    const response = await post("akoraweb", quote("known")).expect(200);
    createdRequestIds.push(response.body.requestId);

    const { data: row } = await db
      .from("requests")
      .select("client_id, contact_id")
      .eq("id", response.body.requestId)
      .single();
    expect(row).toEqual({ client_id: client!.id, contact_id: contact!.id });
  });

  it("refuse une signature invalide, périmée ou un site non configuré, sans rien créer", async () => {
    await post("akoraweb", quote("forged"), { secret: "mauvais-secret" }).expect(401);
    await post("akoraweb", quote("stale"), { timestamp: Math.floor(Date.now() / 1000) - 3600 }).expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/webhooks/website/akoraweb")
      .send(quote("unsigned"))
      .expect(401);
    await post("inconnu", quote("unknown-site")).expect(503);

    const { count } = await db
      .from("requests")
      .select("id", { count: "exact", head: true })
      .in("website_submission_id", [
        `akoraweb:quote:${tag}-forged`,
        `akoraweb:quote:${tag}-stale`,
        `akoraweb:quote:${tag}-unsigned`,
        `inconnu:quote:${tag}-unknown-site`,
      ]);
    expect(count).toBe(0);
  });

  it("rejette une soumission signée mais invalide (400)", async () => {
    await post("akoraweb", quote("bad-email", { contact: { name: "X", email: "pas-un-email" } })).expect(400);
    await post("akoraweb", quote("bad-id", { externalId: "a b/c" })).expect(400);
    await post("akoraweb", { ...quote("extra"), admin: true }).expect(400);
  });
});
