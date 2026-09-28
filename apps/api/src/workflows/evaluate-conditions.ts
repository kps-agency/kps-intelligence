import type { WorkflowCondition } from "@kps/types";

export type WorkflowContext = Record<string, string | number | boolean | null | undefined>;

// Toutes les conditions doivent être vraies (ET logique). Une valeur
// absente du contexte ne satisfait aucune comparaison — seulement
// `notExists`.
export function evaluateConditions(
  conditions: WorkflowCondition[],
  context: WorkflowContext,
): boolean {
  return conditions.every((condition) => evaluate(condition, context[condition.field]));
}

function evaluate(
  condition: WorkflowCondition,
  actual: string | number | boolean | null | undefined,
): boolean {
  const present = actual !== null && actual !== undefined;
  const expected = condition.value;
  switch (condition.operator) {
    case "exists":
      return present;
    case "notExists":
      return !present;
    case "eq":
      return present && actual === expected;
    case "neq":
      return present && actual !== expected;
    case "in":
      return present && Array.isArray(expected) && expected.some((v) => v === actual);
    case "notIn":
      return present && Array.isArray(expected) && !expected.some((v) => v === actual);
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
  }
}
