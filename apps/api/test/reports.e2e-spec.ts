// Tests d'intégration des rapports (Phase 21, section 56) : l'API complète
// contre la VRAIE base Supabase de dev. Les chiffres « sur la période »
// sont vérifiés sur une fenêtre passée isolée (mars 2019), peuplée pour le
// test puis nettoyée ; les chiffres d'état courant sont recoupés avec des
// requêtes indépendantes sur la même base. Aucun mock.
//
// Lancer : pnpm --filter @kps/api test:e2e

process.env.LOG_LEVEL = "silent";
process.env.RATE_LIMIT_MAX = "5000";

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import type { Database, ReportOverviewResponse } from "@kps/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { SupabaseService } from "../src/supabase/supabase.service";

const FROM = "2019-03-01";
const TO = "2019-03-10";

describe("Rapports (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let adminToken: string;
  let viewerToken: string;
  let memberToken: string;
  let serviceName: string;
  const tag = `r${Date.now()}`;
  const run = `e2e-report-${tag}`;
  const requestIds: string[] = [];
  const createdAuthUserIds: string[] = [];
  let clientId: string;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const overview = (token: string, from: string, to: string) =>
    http().get("/api/v1/reports/overview").query({ from, to }).set(as(token));

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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    config = app.get(ConfigService);
    db = app.get(SupabaseService).getClient();
    adminToken = await signIn(
      config.getOrThrow<string>("E2E_ADMIN_EMAIL"),
      config.getOrThrow<string>("E2E_ADMIN_PASSWORD"),
    );
    viewerToken = await signIn(
      config.getOrThrow<string>("E2E_VIEWER_EMAIL"),
      config.getOrThrow<string>("E2E_VIEWER_PASSWORD"),
    );
    const [local, domain] = config.getOrThrow<string>("SMTP_USER").split("@");
    const email = `${local}+${tag}-member@${domain}`;
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password: `Pw-${tag}-Member-9!`,
      email_confirm: true,
    });
    if (error) throw error;
    createdAuthUserIds.push(created.user.id);
    const { data: role } = await db.from("roles").select("id").eq("key", "TEAM_MEMBER").single();
    await db.from("users").insert({ id: created.user.id, email, first_name: "Amadou", last_name: `Test${tag}`, role_id: role!.id });
    memberToken = await signIn(email, `Pw-${tag}-Member-9!`);

    // La fenêtre de test doit être vide : sinon les chiffres attendus ne valent rien.
    const before = (await overview(adminToken, FROM, TO).expect(200)).body as ReportOverviewResponse;
    expect(before.kpis.requestsInPeriod).toBe(0);

    const { data: service } = await db.from("services").select("id, name").eq("slug", "WEBSITE").single();
    serviceName = service!.name;

    // Données posées directement en base, datées dans la fenêtre : six
    // demandes, dont une à 23 h 30 et une à 00 h 30 heure de Zurich.
    const rows = [
      { at: "2019-03-01T10:00:00Z", source: "EMAIL", country: "Suisse", service: service!.id },
      { at: "2019-03-01T15:00:00Z", source: "EMAIL", country: "Suisse", service: service!.id },
      { at: "2019-03-03T09:00:00Z", source: "WEBSITE", country: "France", service: null },
      { at: "2019-03-03T22:30:00Z", source: "WHATSAPP", country: "  ", service: null }, // 23 h 30 le 3
      { at: "2019-03-04T23:30:00Z", source: "EMAIL", country: null, service: null }, // 00 h 30 le 5
      { at: "2019-03-10T10:00:00Z", source: "MANUAL", country: null, service: null },
    ] as const;
    for (const [index, row] of rows.entries()) {
      const { data, error: insertError } = await db
        .from("requests")
        .insert({
          subject: `${run} — demande ${index + 1}`,
          source: row.source,
          country: row.country,
          detected_service_id: row.service,
          status: "CLOSED",
          created_at: row.at,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      requestIds.push(data.id);
    }

    // Qualifiées : la 1 après 2 h (requalifiée plus tard : seule la première
    // compte) et la 3 après 10 h.
    const qualified = (requestId: string, at: string) => ({
      type: "REQUEST_QUALIFIED" as const,
      entity_type: "request",
      entity_id: requestId,
      request_id: requestId,
      actor_type: "SYSTEM" as const,
      created_at: at,
    });
    const { error: eventsError } = await db.from("events").insert([
      qualified(requestIds[0]!, "2019-03-01T12:00:00Z"),
      qualified(requestIds[0]!, "2019-03-06T12:00:00Z"),
      qualified(requestIds[2]!, "2019-03-03T19:00:00Z"),
    ]);
    if (eventsError) throw eventsError;

    const { error: opportunitiesError } = await db.from("opportunities").insert([
      { request_id: requestIds[0]!, title: `${run} — gagnée`, status: "WON" },
      { request_id: requestIds[2]!, title: `${run} — en négociation`, status: "NEGOTIATION" },
    ]);
    if (opportunitiesError) throw opportunitiesError;

    const { data: client, error: clientError } = await db
      .from("clients")
      .insert({ company_name: `${run} SA`, status: "PROSPECT", created_at: "2019-03-02T08:00:00Z" })
      .select("id")
      .single();
    if (clientError) throw clientError;
    clientId = client.id;
  });

  afterAll(async () => {
    // Événements et opportunités partent avec leur demande (cascade).
    if (requestIds.length > 0) await db.from("requests").delete().in("id", requestIds);
    if (clientId) await db.from("clients").delete().eq("id", clientId);
    for (const id of createdAuthUserIds) await db.auth.admin.deleteUser(id);
    await app.close();
  });

  it("droits et validation de la période", async () => {
    await http().get("/api/v1/reports/overview").query({ from: FROM, to: TO }).expect(401);
    // Un collaborateur n'a pas accès aux rapports.
    await overview(memberToken, FROM, TO).expect(403);
    await overview(viewerToken, FROM, TO).expect(200);
    await overview(adminToken, TO, FROM).expect(400);
    await overview(adminToken, "2019-01-01", "2020-06-01").expect(400);
    await overview(adminToken, "mars", TO).expect(400);
    await http().get("/api/v1/reports/overview").set(as(adminToken)).expect(400);
  });

  it("chiffres de la période : volumes, répartitions, conversion, délais", async () => {
    const report = (await overview(adminToken, FROM, TO).expect(200)).body as ReportOverviewResponse;

    expect(report.from).toBe(FROM);
    expect(report.to).toBe(TO);
    expect(report.kpis).toEqual(
      expect.objectContaining({
        requestsInPeriod: 6,
        newProspects: 1,
        qualifiedInPeriod: 2,
        // 2 qualifiées sur 6.
        qualificationRate: 0.3333,
        // (2 h + 10 h) / 2 — la requalification tardive de la 1 ne compte pas.
        avgHoursToQualify: 6,
      }),
    );

    // Un point par jour, y compris les jours sans demande ; découpage au
    // fuseau de Zurich (23 h 30 reste le 3, 00 h 30 passe au 5).
    expect(report.requestsByDay.map((d) => d.count)).toEqual([2, 0, 2, 0, 1, 0, 0, 0, 0, 1]);
    expect(report.requestsByDay[0]?.date).toBe("2019-03-01");
    expect(report.requestsByDay[9]?.date).toBe("2019-03-10");

    expect(report.requestsByService).toEqual([
      { label: "Non identifié", count: 4 },
      { label: serviceName, count: 2 },
    ]);
    expect(report.requestsBySource).toEqual([
      { label: "EMAIL", count: 3 },
      { label: "MANUAL", count: 1 },
      { label: "WEBSITE", count: 1 },
      { label: "WHATSAPP", count: 1 },
    ]);
    // Pays vide ou fait d'espaces = non renseigné.
    expect(report.requestsByCountry).toEqual([
      { label: "Non renseigné", count: 3 },
      { label: "Suisse", count: 2 },
      { label: "France", count: 1 },
    ]);
    expect(report.funnel).toEqual({ requests: 6, qualified: 2, opportunities: 2, won: 1 });
  });

  it("les bornes de la période sont incluses, et elles seules", async () => {
    const report = (await overview(viewerToken, "2019-03-02", "2019-03-04").expect(200)).body as ReportOverviewResponse;
    expect(report.kpis.requestsInPeriod).toBe(2);
    expect(report.requestsByDay).toEqual([
      { date: "2019-03-02", count: 0 },
      { date: "2019-03-03", count: 2 },
      { date: "2019-03-04", count: 0 },
    ]);
    expect(report.kpis.qualifiedInPeriod).toBe(1);
    expect(report.kpis.avgHoursToQualify).toBe(10);
    expect(report.kpis.newProspects).toBe(1);
    expect(report.funnel).toEqual({ requests: 2, qualified: 1, opportunities: 1, won: 0 });

    const single = (await overview(adminToken, "2019-03-05", "2019-03-05").expect(200)).body as ReportOverviewResponse;
    expect(single.requestsByDay).toEqual([{ date: "2019-03-05", count: 1 }]);
    const empty = (await overview(adminToken, "2018-03-01", "2018-03-02").expect(200)).body as ReportOverviewResponse;
    expect(empty.kpis).toEqual(
      expect.objectContaining({ requestsInPeriod: 0, qualificationRate: null, avgHoursToQualify: null }),
    );
    expect(empty.requestsByService).toEqual([]);
  });

  it("état courant : recoupé avec des requêtes indépendantes sur la base", async () => {
    const count = async (table: "requests" | "opportunities" | "missions", column: string, values: string[]) => {
      const { count: n } = await db.from(table).select("id", { count: "exact", head: true }).in(column, values);
      return n ?? 0;
    };
    const [toQualify, wonOrLost, allOpportunities, activeMissions, report] = await Promise.all([
      count("requests", "status", [
        "NEW", "RECEIVED", "AI_ANALYZING", "ANALYZED", "FORM_PENDING", "FORM_SENT",
        "WAITING_CLIENT", "RESPONSE_RECEIVED", "QUALIFYING",
      ]),
      count("opportunities", "status", ["WON", "LOST"]),
      db.from("opportunities").select("id", { count: "exact", head: true }).then((r) => r.count ?? 0),
      count("missions", "status", ["IN_PROGRESS", "BLOCKED"]),
      overview(adminToken, FROM, TO).expect(200).then((r) => r.body as ReportOverviewResponse),
    ]);

    expect(report.kpis.toQualify).toBe(toQualify);
    expect(report.kpis.openOpportunities).toBe(allOpportunities - wonOrLost);
    expect(report.kpis.activeMissions).toBe(activeMissions);
    // Les deux opportunités du test figurent dans la répartition du pipeline.
    const stage = (label: string) => report.opportunitiesByStage.find((s) => s.label === label)?.count ?? 0;
    expect(stage("WON")).toBeGreaterThanOrEqual(1);
    expect(stage("NEGOTIATION")).toBeGreaterThanOrEqual(1);
    expect(report.opportunitiesByStage.reduce((sum, s) => sum + s.count, 0)).toBe(allOpportunities);
    const { count: missions } = await db.from("missions").select("id", { count: "exact", head: true });
    expect(report.missionsByStatus.reduce((sum, s) => sum + s.count, 0)).toBe(missions ?? 0);
  });
});
