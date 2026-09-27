"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FORM_FIELD_TYPE_LABELS, OPTION_BASED_FIELD_TYPES } from "@kps/shared";
import { FormFieldType, type FormFieldResponse, type FormResponse } from "@kps/types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Textarea,
} from "@kps/ui";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api-client";
import { useCreateField, useUpdateField } from "@/lib/queries/forms";

const NONE = "__none__";

// Une option par ligne, format "valeur|Libellé" (libellé optionnel — la
// valeur sert alors aussi de libellé). Volontairement simple plutôt qu'un
// éditeur ligne par ligne : un formulaire de qualification a rarement
// plus d'une poignée d'options par champ.
function parseOptions(text: string): { value: string; label: string }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, label] = line.split("|").map((s) => s.trim());
      return { value: value!, label: label || value! };
    });
}

function formatOptions(options: { value: string; label: string }[] | null): string {
  return (options ?? []).map((o) => (o.value === o.label ? o.value : `${o.value}|${o.label}`)).join("\n");
}

const schema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-zA-Z0-9]*$/, "camelCase requis (ex: budgetEstime)."),
  label: z.string().trim().min(1, "Le libellé est requis."),
  type: z.nativeEnum(FormFieldType),
  required: z.boolean(),
  optionsText: z.string().optional(),
  conditionField: z.string(),
  conditionEquals: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function FieldDialog({
  form,
  stepId,
  field,
  onClose,
}: {
  form: FormResponse;
  stepId: string;
  field?: FormFieldResponse;
  onClose: () => void;
}) {
  const createField = useCreateField(form.id, stepId);
  const updateField = useUpdateField(form.id, stepId, field?.id ?? "");
  const mutation = field ? updateField : createField;

  const otherFields = form.steps
    .flatMap((s) => s.fields)
    .filter((f) => f.id !== field?.id);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      key: field?.key ?? "",
      label: field?.label ?? "",
      type: field?.type ?? FormFieldType.TEXT,
      required: field?.required ?? false,
      optionsText: formatOptions(field?.options ?? null),
      conditionField: field?.conditionalLogic?.field ?? NONE,
      conditionEquals: field?.conditionalLogic?.equals ?? "",
    },
  });

  const type = watch("type");
  const needsOptions = OPTION_BASED_FIELD_TYPES.includes(type);
  const conditionField = watch("conditionField");

  function onSubmit(values: FormValues) {
    const conditionalLogic =
      values.conditionField !== NONE && values.conditionEquals
        ? { field: values.conditionField, equals: values.conditionEquals }
        : null;
    const options = needsOptions ? parseOptions(values.optionsText ?? "") : undefined;

    if (field) {
      // En édition, toujours envoyer explicitement `options` (même null) :
      // sinon un changement de type qui abandonne les options laisserait
      // les anciennes options en base, rejetées par la validation serveur
      // (le type cible n'en accepte plus).
      updateField.mutate(
        {
          key: values.key,
          label: values.label,
          type: values.type,
          required: values.required,
          options: options ?? null,
          conditionalLogic,
        },
        { onSuccess: onClose },
      );
    } else {
      createField.mutate(
        {
          key: values.key,
          label: values.label,
          type: values.type,
          required: values.required,
          options,
          conditionalLogic,
        },
        { onSuccess: onClose },
      );
    }
  }

  const serverError = mutation.error instanceof ApiError ? mutation.error : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{field ? "Modifier le champ" : "Ajouter un champ"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="field-label">Libellé (question posée)</Label>
              <Input id="field-label" {...register("label")} />
              {errors.label && (
                <p className="text-sm text-destructive">{errors.label.message}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="field-key">
                Clé {field && <span className="text-muted-foreground">(fixée à la création)</span>}
              </Label>
              <Input id="field-key" disabled={!!field} {...register("key")} />
              {errors.key && <p className="text-sm text-destructive">{errors.key.message}</p>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="field-type">Type</Label>
              <Select id="field-type" {...register("type")}>
                {Object.values(FormFieldType).map((value) => (
                  <option key={value} value={value}>
                    {FORM_FIELD_TYPE_LABELS[value]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-2.5">
              <input
                id="field-required"
                type="checkbox"
                className="size-4 rounded border-input"
                {...register("required")}
              />
              <Label htmlFor="field-required" className="font-normal">
                Réponse obligatoire
              </Label>
            </div>
          </div>

          {needsOptions && (
            <div className="grid gap-1.5">
              <Label htmlFor="field-options">{'Options (une par ligne, "valeur|Libellé")'}</Label>
              <Textarea
                id="field-options"
                rows={4}
                placeholder={"OUI|Oui\nNON|Non"}
                {...register("optionsText")}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="field-condition-field">
                N&apos;afficher que si (optionnel)
              </Label>
              <Select id="field-condition-field" {...register("conditionField")}>
                <option value={NONE}>Toujours affiché</option>
                {otherFields.map((f) => (
                  <option key={f.id} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="field-condition-equals">a pour réponse</Label>
              <Input
                id="field-condition-equals"
                disabled={conditionField === NONE}
                {...register("conditionEquals")}
              />
            </div>
          </div>

          {serverError && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
