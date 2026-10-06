// Tests d'intégration de l'équipe et du matching (Phase 16, sections 40,
// 45, 47, 48) : l'application complète contre la VRAIE base Supabase de
// dev, de vrais appels à Claude (analyse des réponses, compétences
// requises), le vrai Workflow Engine et de vraies notifications. Aucun
// mock. Les collaborateurs sont de vrais comptes créés pour le test (alias
// « + » de la boîte de test), supprimés à la fin.
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
import request from "supertest";
import type {
  Database,
  QualificationAnalysisResult,
  RequestMatchingResponse,
  SkillResponse,
  TeamMemberDetailResponse,
} from "@kps/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { EventBus } from "../src/events/event-bus.service";
import { SupabaseService } from "../src/supabase/supabase.service";

interface Member {
  id: string;
  token: string;
  name: string;
}

describe("Équipe et matching (intégration réelle)", () => {
  let app: INestApplication;
  let db: SupabaseClient<Database>;
  let config: ConfigService;
  let eventBus: EventBus;
  let adminToken: string;
  let viewerToken: string;
  let adminId: string;
  const tag = `m${Date.now()}`;
  const run = `e2e-match-${tag}`;
  const createdAuthUserIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdSkillIds: string[] = [];
  let testFormId: string;
  let skills: SkillResponse[];
  let amadou: Member;
  let fatou: Member;
  let moussa: Member;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const skillId = (name: string) => skills.find((s) => s.name === name)!.id;

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

  async function createMember(firstName: string): Promise<Member> {
    const [local, domain] = config.getOrThrow<string>("SMTP_USER").split("@");
    const email = `${local}+${tag}-${firstName.toLowerCase()}@${domain}`;
    const password = `Pw-${tag}-${firstName}-9!`;
    const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    createdAuthUserIds.push(created.user.id);
    const { data: role } = await db.from("roles").select("id").eq("key", "TEAM_MEMBER").single();
    await db.from("users").insert({
      id: created.user.id,
      email,
      first_name: firstName,
      last_name: `Test${tag}`,
      role_id: role!.id,
    });
    return { id: created.user.id, token: await signIn(email, password), name: `${firstName} Test${tag}` };
  }

  async function events(requestId: string) {
    await eventBus.whenIdle();
    const { data } = await db
      .from("events")
      .select("type, actor_type, payload")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });
    return data ?? [];
  }

  async function requestStatus(requestId: string): Promise<string> {
    const { data } = await db.from("requests").select("status").eq("id", requestId).single();
    return data!.status;
  }

  // Demande manuelle + formulaire complété par le prospect sur la page
  // publique : déclenche FORM_COMPLETED, donc la chaîne de workflows.
  async function completedQualification(
    subject: string,
    message: string,
    answers: { description: string; technologies: string; budget: string },
  ): Promise<string> {
    const created = await http()
      .post("/api/v1/requests")
      .set(as(adminToken))
      .send({ subject: `${run} — ${subject}`, originalMessage: message, language: "fr" })
      .expect(201);
    createdRequestIds.push(created.body.id);
    const session = await http()
      .post(`/api/v1/requests/${created.body.id}/qualification-sessions`)
      .set(as(adminToken))
      .send({ formId: testFormId })
      .expect(201);
    const token = (session.body.qualificationUrl as string).split("/qualification/")[1]!;
    for (const [key, value] of Object.entries(answers)) {
      await http().put(`/api/v1/public/qualification/${token}/responses/${key}`).send({ value }).expect(200);
    }
    await http().post(`/api/v1/public/qualification/${token}/submit`).send({ consent: true }).expect(201);
    await eventBus.whenIdle();
    return created.body.id as string;
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
    skills = (await http().get("/api/v1/skills").set(as(adminToken)).expect(200)).body;

    amadou = await createMember("Amadou");
    fatou = await createMember("Fatou");
    moussa = await createMember("Moussa");

    const form = await http()
      .post("/api/v1/forms")
      .set(as(adminToken))
      .send({ name: `${run}-form`, slug: `${run}-form` })
      .expect(201);
    testFormId = form.body.id;
    const step = await http()
      .post(`/api/v1/forms/${testFormId}/steps`)
      .set(as(adminToken))
      .send({ title: "Projet" })
      .expect(201);
    for (const field of [
      { key: "description", label: "Décrivez votre projet", type: "TEXTAREA", required: true },
      { key: "technologies", label: "Technologies souhaitées ou existantes", type: "TEXT" },
      { key: "budget", label: "Budget et délai", type: "TEXT" },
    ]) {
      await http()
        .post(`/api/v1/forms/${testFormId}/steps/${step.body.id}/fields`)
        .set(as(adminToken))
        .send(field)
        .expect(201);
    }
    await http().patch(`/api/v1/forms/${testFormId}`).set(as(adminToken)).send({ status: "PUBLISHED" }).expect(200);
  });

  afterAll(async () => {
    await eventBus.whenIdle();
    if (createdRequestIds.length > 0) await db.from("requests").delete().in("id", createdRequestIds);
    if (testFormId) await db.from("forms").delete().eq("id", testFormId);
    for (const id of createdAuthUserIds) await db.auth.admin.deleteUser(id);
    if (createdSkillIds.length > 0) await db.from("skills").delete().in("id", createdSkillIds);
    const imap = new ImapFlow({
      host: config.getOrThrow<string>("IMAP_HOST"),
      port: Number(config.getOrThrow<string>("IMAP_PORT")),
      secure: true,
      auth: { user: config.getOrThrow<string>("IMAP_USER"), pass: config.getOrThrow<string>("IMAP_PASSWORD") },
      logger: false,
    });
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

  describe("profils de l'équipe (section 47)", () => {
    it("chacun renseigne son propre profil ; un admin peut modifier celui des autres", async () => {
      // Amadou : son propre profil.
      await http()
        .put(`/api/v1/team/${amadou.id}/skills`)
        .set(as(amadou.token))
        .send({
          skills: [
            { skillId: skillId("Next.js"), proficiencyLevel: 5, yearsExperience: 6 },
            { skillId: skillId("NestJS"), proficiencyLevel: 4, yearsExperience: 3 },
            { skillId: skillId("PostgreSQL"), proficiencyLevel: 4, yearsExperience: 4 },
            { skillId: skillId("TypeScript"), proficiencyLevel: 5, yearsExperience: 6 },
          ],
        })
        .expect(200);
      await http()
        .put(`/api/v1/team/${amadou.id}/availability`)
        .set(as(amadou.token))
        .send({ status: "AVAILABLE", capacityHoursPerWeek: 30, availableFrom: null, notes: null })
        .expect(200);
      await http()
        .put(`/api/v1/team/${amadou.id}/profile`)
        .set(as(amadou.token))
        .send({ languages: ["fr", "en", "wo"], country: "Sénégal", timezone: "Africa/Dakar", expertise: "Applications métier" })
        .expect(200);

      // Fatou ne peut pas modifier le profil d'Amadou.
      await http()
        .put(`/api/v1/team/${amadou.id}/availability`)
        .set(as(fatou.token))
        .send({ status: "UNAVAILABLE", capacityHoursPerWeek: null, availableFrom: null, notes: null })
        .expect(403);

      // Un admin (team.manage) renseigne Fatou et Moussa.
      await http()
        .put(`/api/v1/team/${fatou.id}/skills`)
        .set(as(adminToken))
        .send({
          skills: [
            { skillId: skillId("Next.js"), proficiencyLevel: 4, yearsExperience: 3 },
            { skillId: skillId("NestJS"), proficiencyLevel: 3, yearsExperience: 2 },
            { skillId: skillId("TypeScript"), proficiencyLevel: 4, yearsExperience: 3 },
          ],
        })
        .expect(200);
      await http()
        .put(`/api/v1/team/${fatou.id}/availability`)
        .set(as(adminToken))
        .send({ status: "BUSY", capacityHoursPerWeek: 8, availableFrom: null, notes: "Sur une mission jusqu'à fin du mois" })
        .expect(200);
      await http()
        .put(`/api/v1/team/${fatou.id}/profile`)
        .set(as(adminToken))
        .send({ languages: ["fr"], country: "Sénégal", timezone: "Africa/Dakar", expertise: null })
        .expect(200);
      await http()
        .put(`/api/v1/team/${moussa.id}/skills`)
        .set(as(adminToken))
        .send({
          skills: [
            { skillId: skillId("WordPress"), proficiencyLevel: 5, yearsExperience: 8 },
            { skillId: skillId("SEO technique"), proficiencyLevel: 4, yearsExperience: 5 },
          ],
        })
        .expect(200);
      const moussaProfile = await http()
        .put(`/api/v1/team/${moussa.id}/availability`)
        .set(as(adminToken))
        .send({ status: "AVAILABLE", capacityHoursPerWeek: 35, availableFrom: null, notes: null })
        .expect(200);
      expect((moussaProfile.body as TeamMemberDetailResponse).skills.map((s) => s.name)).toEqual([
        "WordPress",
        "SEO technique",
      ]);

      const detail = await http().get(`/api/v1/team/${amadou.id}`).set(as(viewerToken)).expect(200);
      const profile = detail.body as TeamMemberDetailResponse;
      expect(profile.languages).toEqual(["fr", "en", "wo"]);
      expect(profile.availability?.status).toBe("AVAILABLE");
      expect(profile.skills[0]).toEqual(expect.objectContaining({ name: "Next.js", proficiencyLevel: 5, yearsExperience: 6 }));
    });

    it("validation : compétence inconnue 404, niveau hors bornes 400, langue invalide 400", async () => {
      await http()
        .put(`/api/v1/team/${amadou.id}/skills`)
        .set(as(amadou.token))
        .send({ skills: [{ skillId: "00000000-0000-4000-8000-000000000000", proficiencyLevel: 3, yearsExperience: null }] })
        .expect(404);
      await http()
        .put(`/api/v1/team/${amadou.id}/skills`)
        .set(as(amadou.token))
        .send({ skills: [{ skillId: skillId("React"), proficiencyLevel: 9, yearsExperience: null }] })
        .expect(400);
      await http()
        .put(`/api/v1/team/${amadou.id}/profile`)
        .set(as(amadou.token))
        .send({ languages: ["français"], country: null, timezone: "Europe/Zurich", expertise: null })
        .expect(400);
      // Le profil d'Amadou n'a pas été altéré par ces tentatives.
      const detail = await http().get(`/api/v1/team/${amadou.id}`).set(as(adminToken)).expect(200);
      expect(detail.body.skills).toHaveLength(4);
    });

    it("catalogue de compétences : lecture pour tous, ajout réservé à team.manage", async () => {
      await http().post("/api/v1/skills").set(as(amadou.token)).send({ name: `${run}-skill`, category: null }).expect(403);
      const created = await http()
        .post("/api/v1/skills")
        .set(as(adminToken))
        .send({ name: `${run}-skill`, category: "Test" })
        .expect(201);
      createdSkillIds.push(created.body.id);
      await http().post("/api/v1/skills").set(as(adminToken)).send({ name: `${run}-skill`, category: null }).expect(409);
      const list = await http().get("/api/v1/team").set(as(viewerToken)).expect(200);
      expect(list.body.map((m: { id: string }) => m.id)).toEqual(expect.arrayContaining([amadou.id, fatou.id, moussa.id]));
    });
  });

  describe("chaîne de la section 45 : formulaire complété → analyse Claude → qualifiée → matching", () => {
    let requestId: string;

    beforeAll(async () => {
      requestId = await completedQualification(
        "application métier de planification",
        "Bonjour, nous voulons une application web métier pour planifier les interventions de nos techniciens.",
        {
          description:
            "Application web interne pour 40 techniciens et 5 planificateurs : planning des interventions, " +
            "fiches client, suivi du stock de pièces, tableau de bord. Connexion par rôle, export PDF des rapports.",
          technologies:
            "Front en Next.js, API en NestJS, base PostgreSQL. Hébergement chez nous (Docker). Interface en français.",
          budget: "Budget validé de 60 000 CHF, mise en production souhaitée dans 5 mois.",
        },
      );
    });

    it("Claude analyse les réponses et qualifie la demande avec les compétences du catalogue", async () => {
      const { data: analysis } = await db
        .from("ai_analyses")
        .select("status, confidence, result, prompt_version")
        .eq("request_id", requestId)
        .eq("kind", "QUALIFICATION_ANALYSIS")
        .single();
      expect(analysis?.status).toBe("COMPLETED");
      expect(analysis?.prompt_version).toBe("qualification-analysis@1");
      const result = analysis!.result as unknown as QualificationAnalysisResult;
      expect(result.qualificationStatus).toBe("QUALIFIED");
      expect(result.requiredSkills.length).toBeGreaterThan(0);
      const catalogue = new Set(skills.map((s) => s.name));
      expect(result.requiredSkills.every((s) => catalogue.has(s))).toBe(true);
      expect(result.requiredSkills).toEqual(expect.arrayContaining(["Next.js", "NestJS", "PostgreSQL"]));

      const types = (await events(requestId)).map((e) => e.type);
      expect(types).toEqual(
        expect.arrayContaining([
          "FORM_COMPLETED",
          "QUALIFICATION_ANALYSIS_STARTED",
          "QUALIFICATION_ANALYSIS_COMPLETED",
          "REQUEST_QUALIFIED",
          "MATCHING_STARTED",
          "MATCHING_COMPLETED",
        ]),
      );
      const qualified = (await events(requestId)).find((e) => e.type === "REQUEST_QUALIFIED");
      expect(qualified?.actor_type).toBe("AI");
    });

    it("le matching classe les collaborateurs avec un score explicable", async () => {
      const response = await http().get(`/api/v1/requests/${requestId}/matching`).set(as(adminToken)).expect(200);
      const matching = response.body as RequestMatchingResponse;
      const ours = matching.candidates.filter((c) => [amadou.id, fatou.id, moussa.id].includes(c.userId));
      expect(ours.map((c) => c.userId)).toEqual([amadou.id, fatou.id, moussa.id]);

      const [a, f, m] = ours;
      expect(a!.score).toBeGreaterThan(f!.score);
      expect(f!.score).toBeGreaterThan(m!.score);
      expect(a!.explanation.positives).toEqual(expect.arrayContaining(["Next.js (niveau 5/5, 6 ans)", "disponible"]));
      expect(f!.explanation.negatives).toContain("disponibilité limitée");
      expect(m!.explanation.negatives).toEqual(expect.arrayContaining(["Next.js", "NestJS", "PostgreSQL"]));
      expect(await requestStatus(requestId)).toBe("MATCHING");
    });

    it("l'affectation est une décision humaine : notifiée au collaborateur, idempotente, réversible", async () => {
      // Un collaborateur sans matching.manage ne peut pas s'affecter.
      await http()
        .post(`/api/v1/requests/${requestId}/team-members`)
        .set(as(amadou.token))
        .send({ userId: amadou.id })
        .expect(403);

      await http().post(`/api/v1/requests/${requestId}/team-members`).set(as(adminToken)).send({ userId: amadou.id }).expect(201);
      const again = await http()
        .post(`/api/v1/requests/${requestId}/team-members`)
        .set(as(adminToken))
        .send({ userId: amadou.id })
        .expect(201);
      const matching = again.body as RequestMatchingResponse;
      expect(matching.teamMembers).toEqual([
        expect.objectContaining({ userId: amadou.id, assignedByName: "Super Admin" }),
      ]);
      expect(matching.candidates.find((c) => c.userId === amadou.id)?.assigned).toBe(true);
      expect(await requestStatus(requestId)).toBe("ASSIGNED");

      const all = await events(requestId);
      expect(all.filter((e) => e.type === "TEAM_MEMBER_ASSIGNED")).toHaveLength(1);

      const { data: notified } = await db
        .from("notifications")
        .select("channel, title")
        .eq("user_id", amadou.id)
        .eq("event_type", "TEAM_MEMBER_ASSIGNED");
      expect(notified?.map((n) => n.channel).sort()).toEqual(["EMAIL", "IN_APP"]);

      // Relancer le matching remplace la recommandation, pas l'affectation.
      await http().post(`/api/v1/requests/${requestId}/matching`).set(as(adminToken)).expect(201);
      const rerun = await http().get(`/api/v1/requests/${requestId}/matching`).set(as(adminToken)).expect(200);
      expect(rerun.body.teamMembers).toHaveLength(1);
      const { count } = await db
        .from("matching_results")
        .select("id", { count: "exact", head: true })
        .eq("request_id", requestId)
        .eq("user_id", amadou.id);
      expect(count).toBe(1);

      await http().delete(`/api/v1/requests/${requestId}/team-members/${amadou.id}`).set(as(adminToken)).expect(200);
      await http().delete(`/api/v1/requests/${requestId}/team-members/${amadou.id}`).set(as(adminToken)).expect(404);
      expect((await events(requestId)).some((e) => e.type === "TEAM_MEMBER_UNASSIGNED")).toBe(true);

      const history = await http().get(`/api/v1/team/${amadou.id}`).set(as(adminToken)).expect(200);
      expect(history.body.history).toEqual([]);
    });
  });

  it("réponses trop vagues : pas de qualification automatique, pas de matching", async () => {
    const requestId = await completedQualification("demande floue", "Bonjour, on aimerait peut-être quelque chose.", {
      description: "Je ne sais pas encore, à voir.",
      technologies: "Aucune idée.",
      budget: "Pas défini.",
    });
    const all = await events(requestId);
    const completed = all.find((e) => e.type === "QUALIFICATION_ANALYSIS_COMPLETED");
    expect(completed).toBeTruthy();
    expect(all.some((e) => e.type === "REQUEST_QUALIFIED")).toBe(false);
    expect(all.some((e) => e.type === "MATCHING_STARTED")).toBe(false);
    expect(["QUALIFYING", "UNQUALIFIED"]).toContain(await requestStatus(requestId));

    if ((completed!.payload as { needsReview?: boolean }).needsReview) {
      // Validation humaine : un responsable est notifié (repli : admin).
      const { data: review } = await db
        .from("notifications")
        .select("user_id")
        .eq("related_entity_id", requestId)
        .eq("event_type", "QUALIFICATION_ANALYSIS_COMPLETED");
      expect((review ?? []).length).toBeGreaterThan(0);
    }
  });

  it("qualification manuelle : le matching demande les compétences requises à Claude", async () => {
    const created = await http()
      .post("/api/v1/requests")
      .set(as(adminToken))
      .send({
        subject: `${run} — site WordPress et SEO`,
        originalMessage: "Refonte de notre site WordPress (30 pages) et amélioration du référencement naturel.",
        language: "fr",
      })
      .expect(201);
    createdRequestIds.push(created.body.id);
    await http().patch(`/api/v1/requests/${created.body.id}`).set(as(adminToken)).send({ status: "QUALIFIED" }).expect(200);
    await eventBus.whenIdle();

    const matching = (await http().get(`/api/v1/requests/${created.body.id}/matching`).set(as(adminToken)).expect(200))
      .body as RequestMatchingResponse;
    expect(matching.requiredSkills).toEqual(expect.arrayContaining(["WordPress"]));
    const ours = matching.candidates.filter((c) => [amadou.id, fatou.id, moussa.id].includes(c.userId));
    expect(ours[0]?.userId).toBe(moussa.id);
  });

  it("analyse manuelle refusée sans formulaire complété ; accès refusé sans permission", async () => {
    const created = await http()
      .post("/api/v1/requests")
      .set(as(adminToken))
      .send({ subject: `${run} — sans formulaire`, originalMessage: "Test." })
      .expect(201);
    createdRequestIds.push(created.body.id);
    await http().post(`/api/v1/requests/${created.body.id}/qualification-analysis`).set(as(adminToken)).expect(400);
    await http().post(`/api/v1/requests/${created.body.id}/matching`).set(as(viewerToken)).expect(403);
    await http().get(`/api/v1/requests/${created.body.id}/matching`).set(as(viewerToken)).expect(200);
    await http().get("/api/v1/team").expect(401);
    expect(adminId).toBeTruthy();
  });
});
