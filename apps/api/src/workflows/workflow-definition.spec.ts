import type { WorkflowStep } from "@kps/types";
import { evaluateConditions } from "./evaluate-conditions";
import { validateWorkflowDefinition } from "./workflow-definition";

const reminder: WorkflowStep = {
  delayMinutes: 2880,
  conditions: [{ field: "session.status", operator: "eq", value: "SENT" }],
  action: { type: "SEND_QUALIFICATION_REMINDER", params: { channel: "EMAIL" } },
};

describe("validateWorkflowDefinition", () => {
  it("accepte une définition conforme au vocabulaire", () => {
    expect(
      validateWorkflowDefinition({
        conditions: [
          { field: "event.payload.confidence", operator: "gte", value: 0.6 },
          { field: "request.source", operator: "in", value: ["EMAIL", "WHATSAPP"] },
          { field: "request.isAssigned", operator: "eq", value: false },
        ],
        steps: [reminder],
        cancelOn: ["FORM_COMPLETED"],
      }),
    ).toEqual([]);
  });

  it("refuse un champ, un opérateur ou un type de valeur hors vocabulaire", () => {
    const errors = validateWorkflowDefinition({
      conditions: [
        { field: "request.password", operator: "eq", value: "x" },
        { field: "request.status", operator: "gte", value: 1 },
        { field: "request.aiConfidence", operator: "eq", value: "élevée" },
        { field: "request.status", operator: "exists", value: "x" },
      ],
      steps: [reminder],
      cancelOn: [],
    });
    expect(errors).toHaveLength(4);
  });

  it("refuse une action inconnue, un paramètre invalide ou un délai hors bornes", () => {
    const errors = validateWorkflowDefinition({
      conditions: [],
      steps: [
        { ...reminder, action: { type: "DELETE_EVERYTHING", params: {} } },
        { ...reminder, action: { type: "SEND_QUALIFICATION_REMINDER", params: { channel: "SMS" } } },
        { ...reminder, action: { type: "SEND_QUALIFICATION_REMINDER", params: { channel: "EMAIL", extra: 1 } } },
        { ...reminder, delayMinutes: -5 },
      ],
      cancelOn: ["NOT_AN_EVENT"],
    });
    expect(errors).toHaveLength(5);
  });

  it("exige au moins une étape", () => {
    expect(validateWorkflowDefinition({ conditions: [], steps: [], cancelOn: [] })).toEqual([
      "Au moins une étape est requise.",
    ]);
  });
});

describe("evaluateConditions", () => {
  const context = {
    "event.payload.confidence": 0.72,
    "request.source": "EMAIL",
    "request.hasReplyChannel": true,
    "session.status": null,
  };

  it("ET logique sur toutes les conditions", () => {
    expect(
      evaluateConditions(
        [
          { field: "event.payload.confidence", operator: "gte", value: 0.6 },
          { field: "request.source", operator: "in", value: ["EMAIL", "WHATSAPP"] },
          { field: "request.hasReplyChannel", operator: "eq", value: true },
        ],
        context,
      ),
    ).toBe(true);
    expect(
      evaluateConditions(
        [
          { field: "event.payload.confidence", operator: "gte", value: 0.8 },
          { field: "request.source", operator: "eq", value: "EMAIL" },
        ],
        context,
      ),
    ).toBe(false);
  });

  it("une valeur absente ne satisfait que notExists", () => {
    expect(evaluateConditions([{ field: "session.status", operator: "neq", value: "SENT" }], context)).toBe(false);
    expect(evaluateConditions([{ field: "session.status", operator: "notIn", value: ["SENT"] }], context)).toBe(false);
    expect(evaluateConditions([{ field: "session.status", operator: "notExists" }], context)).toBe(true);
  });

  it("aucune condition = toujours vrai", () => {
    expect(evaluateConditions([], context)).toBe(true);
  });
});
