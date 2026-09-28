import { scoreCandidate, type CandidateProfile } from "./matching-score";

const criteria = {
  requiredSkills: ["Next.js", "NestJS", "PostgreSQL"],
  requestLanguage: "fr",
  serviceName: "Applications métier",
};

function profile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    skills: new Map([
      ["Next.js", { level: 5, years: 6 }],
      ["NestJS", { level: 4, years: 3 }],
      ["PostgreSQL", { level: 4, years: 1 }],
    ]),
    availability: "AVAILABLE",
    languages: ["fr", "en"],
    similarProjects: 3,
    ...overrides,
  };
}

describe("scoreCandidate", () => {
  it("un profil complet, disponible et expérimenté approche 100", () => {
    const { score, explanation } = scoreCandidate(profile(), criteria);
    // (1 + 0,92 + 0,92) / 3 × 70 = 66,3 ; + 10 + 15 + 5 = 96.
    expect(score).toBe(96);
    expect(explanation.positives).toEqual([
      "Next.js (niveau 5/5, 6 ans)",
      "NestJS (niveau 4/5, 3 ans)",
      "PostgreSQL (niveau 4/5, 1 an)",
      "expérience similaire (3 projets Applications métier)",
      "disponible",
      "parle la langue du prospect (fr)",
    ]);
    expect(explanation.negatives).toEqual([]);
  });

  it("chaque compétence manquante et la disponibilité limitée sont expliquées en négatif", () => {
    const { score, explanation } = scoreCandidate(
      profile({
        skills: new Map([["Next.js", { level: 5, years: null }]]),
        availability: "BUSY",
        similarProjects: 0,
      }),
      criteria,
    );
    expect(explanation.negatives).toEqual(["NestJS", "PostgreSQL", "disponibilité limitée"]);
    expect(explanation.factors).toEqual({ skills: 23.3, experience: 0, availability: 6, language: 5 });
    expect(score).toBe(34);
  });

  it("classe mieux le profil le plus adapté", () => {
    const expert = scoreCandidate(profile(), criteria).score;
    const junior = scoreCandidate(
      profile({
        skills: new Map([
          ["Next.js", { level: 2, years: 1 }],
          ["NestJS", { level: 1, years: null }],
          ["PostgreSQL", { level: 2, years: null }],
        ]),
        similarProjects: 0,
      }),
      criteria,
    ).score;
    const unavailable = scoreCandidate(profile({ availability: "UNAVAILABLE" }), criteria).score;
    expect(expert).toBeGreaterThan(unavailable);
    expect(expert).toBeGreaterThan(junior);
  });

  it("langue : non parlée, non renseignée, ou demande sans langue", () => {
    expect(scoreCandidate(profile({ languages: ["en"] }), criteria).explanation.negatives).toContain(
      "ne parle pas la langue du prospect (fr)",
    );
    expect(scoreCandidate(profile({ languages: [] }), criteria).explanation.factors.language).toBe(2.5);
    expect(
      scoreCandidate(profile({ languages: [] }), { ...criteria, requestLanguage: null }).explanation.factors
        .language,
    ).toBe(5);
  });

  it("sans compétence requise identifiée, le score de compétences est neutre et signalé", () => {
    const { explanation } = scoreCandidate(profile(), { ...criteria, requiredSkills: [] });
    expect(explanation.factors.skills).toBe(35);
    expect(explanation.negatives).toContain("aucune compétence requise identifiée pour ce projet");
  });
});
