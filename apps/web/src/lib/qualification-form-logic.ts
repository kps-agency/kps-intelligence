import type { FormFieldResponse, FormFieldType } from "@kps/types";

export function isFieldVisible(
  field: FormFieldResponse,
  values: Record<string, unknown>,
): boolean {
  if (!field.conditionalLogic) return true;
  return values[field.conditionalLogic.field] === field.conditionalLogic.equals;
}

export function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function missingRequiredLabels(
  fields: FormFieldResponse[],
  values: Record<string, unknown>,
): string[] {
  return fields.filter((f) => f.required && isEmptyValue(values[f.key])).map((f) => f.label);
}

export const FIELD_INPUT_TYPE: Partial<Record<FormFieldType, string>> = {
  EMAIL: "email",
  PHONE: "tel",
  URL: "url",
  NUMBER: "number",
  CURRENCY: "number",
  RANGE: "number",
  DATE: "date",
};
