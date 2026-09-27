"use client";

import type { FormFieldResponse } from "@kps/types";
import { Input, Label, Select, Textarea } from "@kps/ui";
import { FIELD_INPUT_TYPE } from "@/lib/qualification-form-logic";

// Rendu d'un champ de formulaire dynamique selon son type (section 30) —
// partagé entre le runner authentifié (admin) et la page publique
// (/qualification/[token]) : même moteur, deux sources de données.
export function QualificationField({
  field,
  value,
  disabled,
  onChange,
  onCommit,
}: {
  field: FormFieldResponse;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
  onCommit: (value: unknown) => void;
}) {
  const id = `qf-${field.id}`;

  if (field.type === "FILE") {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <p className="text-sm text-muted-foreground">
          Le téléversement de fichiers n&apos;est pas encore disponible.
        </p>
      </div>
    );
  }

  if (field.type === "TEXTAREA") {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <Textarea
          id={id}
          disabled={disabled}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onCommit(e.target.value.trim() === "" ? null : e.target.value)}
        />
      </div>
    );
  }

  if (field.type === "SELECT") {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <Select
          id={id}
          disabled={disabled}
          value={(value as string) ?? ""}
          onChange={(e) => {
            onChange(e.target.value);
            onCommit(e.target.value === "" ? null : e.target.value);
          }}
        >
          <option value="">Sélectionner...</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
    );
  }

  if (field.type === "RADIO") {
    return (
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{field.label}</legend>
        {field.options?.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={id}
              disabled={disabled}
              checked={value === o.value}
              onChange={() => {
                onChange(o.value);
                onCommit(o.value);
              }}
              className="size-4 border-input"
            />
            {o.label}
          </label>
        ))}
      </fieldset>
    );
  }

  if (field.type === "MULTI_SELECT" || field.type === "CHECKBOX") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{field.label}</legend>
        {field.options?.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={disabled}
              checked={selected.includes(o.value)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...selected, o.value]
                  : selected.filter((v) => v !== o.value);
                onChange(next);
                onCommit(next.length === 0 ? null : next);
              }}
              className="size-4 rounded border-input"
            />
            {o.label}
          </label>
        ))}
      </fieldset>
    );
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      <Input
        id={id}
        type={FIELD_INPUT_TYPE[field.type] ?? "text"}
        disabled={disabled}
        value={(value as string | number) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") {
            onCommit(null);
          } else if (FIELD_INPUT_TYPE[field.type] === "number") {
            onCommit(Number(raw));
          } else {
            onCommit(raw);
          }
        }}
      />
    </div>
  );
}
