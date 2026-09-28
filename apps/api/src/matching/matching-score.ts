import type { MatchingExplanation } from "@kps/types";

// Score de matching explicable (section 48), sur 100 :
//   compétences requises   70  (possédée : 60 % du poids, + 40 % selon le niveau)
//   expérience similaire   10  (projets déjà affectés sur le même service)
//   disponibilité          15
//   langue du prospect      5
// Calcul déterministe : le même profil donne toujours le même score, et
// chaque point gagné ou perdu apparaît dans l'explication. L'IA intervient
// en amont, pour déterminer les compétences requises.

export const WEIGHTS = { skills: 70, experience: 10, availability: 15, language: 5 } as const;

export interface CandidateProfile {
  skills: Map<string, { level: number; years: number | null }>;
  availability: "AVAILABLE" | "BUSY" | "UNAVAILABLE" | null;
  languages: string[];
  similarProjects: number;
}

export interface MatchingCriteria {
  requiredSkills: string[];
  requestLanguage: string | null;
  serviceName: string | null;
}

const SIMILAR_PROJECTS_CAP = 3;

export function scoreCandidate(
  profile: CandidateProfile,
  criteria: MatchingCriteria,
): { score: number; explanation: MatchingExplanation } {
  const positives: string[] = [];
  const negatives: string[] = [];

  let skills: number;
  if (criteria.requiredSkills.length === 0) {
    skills = WEIGHTS.skills / 2;
    negatives.push("aucune compétence requise identifiée pour ce projet");
  } else {
    const perSkill = criteria.requiredSkills.map((name) => {
      const owned = profile.skills.get(name);
      if (!owned) {
        negatives.push(name);
        return 0;
      }
      const years = owned.years ? `, ${owned.years} an${owned.years > 1 ? "s" : ""}` : "";
      positives.push(`${name} (niveau ${owned.level}/5${years})`);
      return 0.6 + 0.4 * (owned.level / 5);
    });
    skills = (perSkill.reduce((a, b) => a + b, 0) / perSkill.length) * WEIGHTS.skills;
  }

  const similar = Math.min(profile.similarProjects, SIMILAR_PROJECTS_CAP);
  const experience = (similar / SIMILAR_PROJECTS_CAP) * WEIGHTS.experience;
  if (profile.similarProjects > 0) {
    positives.push(
      `expérience similaire (${profile.similarProjects} projet${profile.similarProjects > 1 ? "s" : ""}${
        criteria.serviceName ? ` ${criteria.serviceName}` : ""
      })`,
    );
  }

  let availability: number;
  switch (profile.availability) {
    case "AVAILABLE":
      availability = WEIGHTS.availability;
      positives.push("disponible");
      break;
    case "BUSY":
      availability = WEIGHTS.availability * 0.4;
      negatives.push("disponibilité limitée");
      break;
    case "UNAVAILABLE":
      availability = 0;
      negatives.push("indisponible");
      break;
    default:
      availability = WEIGHTS.availability * 0.5;
      negatives.push("disponibilité non renseignée");
  }

  let language: number;
  if (!criteria.requestLanguage) {
    language = WEIGHTS.language;
  } else if (profile.languages.includes(criteria.requestLanguage)) {
    language = WEIGHTS.language;
    positives.push(`parle la langue du prospect (${criteria.requestLanguage})`);
  } else if (profile.languages.length === 0) {
    language = WEIGHTS.language / 2;
    negatives.push("langues parlées non renseignées");
  } else {
    language = 0;
    negatives.push(`ne parle pas la langue du prospect (${criteria.requestLanguage})`);
  }

  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    score: Math.round(skills + experience + availability + language),
    explanation: {
      positives,
      negatives,
      requiredSkills: criteria.requiredSkills,
      factors: {
        skills: round(skills),
        experience: round(experience),
        availability: round(availability),
        language: round(language),
      },
    },
  };
}
