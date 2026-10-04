import { EventType } from "@kps/types";
import type {
  WorkflowCondition,
  WorkflowConditionOperator,
  WorkflowStep,
} from "@kps/types";

// Vocabulaire des workflows (section 46 : « Quand X arrive, SI Y, alors
// Z ») : seuls ces champs, opérateurs et actions sont acceptés. Une
// définition stockée en base ne peut donc jamais exécuter autre chose que
// ce que le code sait réellement faire.

export type FieldType = "string" | "number" | "boolean";

export const CONDITION_FIELDS: Record<string, { label: string; type: FieldType }> = {
  "event.payload.confidence": { label: "Confiance de l'IA (événement)", type: "number" },
  "event.payload.serviceSlug": { label: "Service identifié (événement)", type: "string" },
  "event.payload.channel": { label: "Canal (événement)", type: "string" },
  "request.source": { label: "Source de la demande", type: "string" },
  "request.status": { label: "Statut de la demande", type: "string" },
  "request.detectedServiceSlug": { label: "Service détecté", type: "string" },
  "request.aiConfidence": { label: "Confiance de l'IA (demande)", type: "number" },
  "request.hasReplyChannel": { label: "Prospect joignable (email/WhatsApp)", type: "boolean" },
  "request.isAssigned": { label: "Demande assignée", type: "boolean" },
  "session.status": { label: "Statut du lien de qualification", type: "string" },
};

const OPERATORS: Record<WorkflowConditionOperator, "scalar" | "list" | "none" | "numeric"> = {
  eq: "scalar",
  neq: "scalar",
  in: "list",
  notIn: "list",
  gt: "numeric",
  gte: "numeric",
  lt: "numeric",
  lte: "numeric",
  exists: "none",
  notExists: "none",
};

export const ACTION_TYPES: Record<
  string,
  { label: string; params: Record<string, readonly string[]> }
> = {
  REQUIRE_QUALIFICATION: { label: "Rendre la qualification requise", params: {} },
  SEND_QUALIFICATION_LINK: { label: "Envoyer le formulaire au prospect", params: {} },
  SEND_QUALIFICATION_REMINDER: {
    label: "Relancer le prospect",
    params: { channel: ["EMAIL", "WHATSAPP"] },
  },
  ANALYZE_QUALIFICATION: { label: "Analyser les réponses avec Claude", params: {} },
  START_MATCHING: { label: "Calculer le matching équipe", params: {} },
  CREATE_OPPORTUNITY: { label: "Créer l'opportunité de la demande", params: {} },
  SET_OPPORTUNITY_STAGE: {
    label: "Faire avancer l'opportunité du devis",
    params: { stage: ["PROPOSAL_REQUIRED", "PROPOSAL_SENT", "NEGOTIATION", "WON"] },
  },
  SYNC_REQUEST_STATUS: {
    label: "Aligner le statut de la demande sur l'étape de l'opportunité",
    params: {},
  },
};

export const MAX_STEPS = 10;
// 60 jours : au-delà, un lien de qualification a de toute façon expiré.
export const MAX_DELAY_MINUTES = 60 * 24 * 60;
const EVENT_TYPES = new Set<string>(Object.values(EventType));

function validateCondition(condition: WorkflowCondition, where: string): string[] {
  const field = CONDITION_FIELDS[condition.field];
  if (!field) return [`${where} : champ inconnu « ${condition.field} ».`];
  const kind = OPERATORS[condition.operator];
  if (!kind) return [`${where} : opérateur inconnu « ${condition.operator} ».`];

  const value = condition.value;
  switch (kind) {
    case "none":
      return value === undefined ? [] : [`${where} : « ${condition.operator} » ne prend pas de valeur.`];
    case "numeric":
      if (field.type !== "number") return [`${where} : « ${condition.operator} » exige un champ numérique.`];
      return typeof value === "number" && Number.isFinite(value) ? [] : [`${where} : valeur numérique attendue.`];
    case "list":
      return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === field.type)
        ? []
        : [`${where} : liste de valeurs (${field.type}) attendue.`];
    case "scalar":
      return typeof value === field.type ? [] : [`${where} : valeur de type ${field.type} attendue.`];
  }
}

export function validateWorkflowDefinition(definition: {
  conditions: WorkflowCondition[];
  steps: WorkflowStep[];
  cancelOn: string[];
}): string[] {
  const errors: string[] = [];
  definition.conditions.forEach((c, i) =>
    errors.push(...validateCondition(c, `Condition ${i + 1}`)),
  );

  if (definition.steps.length === 0) errors.push("Au moins une étape est requise.");
  if (definition.steps.length > MAX_STEPS) errors.push(`Au plus ${MAX_STEPS} étapes.`);
  definition.steps.forEach((step, i) => {
    const where = `Étape ${i + 1}`;
    if (
      typeof step.delayMinutes !== "number" ||
      !Number.isFinite(step.delayMinutes) ||
      step.delayMinutes < 0 ||
      step.delayMinutes > MAX_DELAY_MINUTES
    ) {
      errors.push(`${where} : délai entre 0 et ${MAX_DELAY_MINUTES} minutes attendu.`);
    }
    step.conditions.forEach((c, j) =>
      errors.push(...validateCondition(c, `${where}, condition ${j + 1}`)),
    );
    const action = ACTION_TYPES[step.action.type];
    if (!action) {
      errors.push(`${where} : action inconnue « ${step.action.type} ».`);
      return;
    }
    const params = step.action.params ?? {};
    for (const [name, allowed] of Object.entries(action.params)) {
      if (!allowed.includes(String(params[name]))) {
        errors.push(`${where} : paramètre « ${name} » attendu parmi ${allowed.join(", ")}.`);
      }
    }
    for (const name of Object.keys(params)) {
      if (!(name in action.params)) errors.push(`${where} : paramètre inconnu « ${name} ».`);
    }
  });

  for (const type of definition.cancelOn) {
    if (!EVENT_TYPES.has(type)) errors.push(`Événement d'annulation inconnu « ${type} ».`);
  }
  return errors;
}
