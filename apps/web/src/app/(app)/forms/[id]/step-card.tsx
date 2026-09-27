"use client";

import { FORM_FIELD_TYPE_LABELS } from "@kps/shared";
import type { FormFieldResponse, FormResponse, FormStepResponse } from "@kps/types";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog } from "@kps/ui";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useDeleteField, useDeleteStep, useReorderFields, useReorderSteps } from "@/lib/queries/forms";
import { FieldDialog } from "./field-dialog";
import { StepTitleDialog } from "./step-title-dialog";

function FieldRow({
  form,
  step,
  field,
  isFirst,
  isLast,
  canManage,
}: {
  form: FormResponse;
  step: FormStepResponse;
  field: FormFieldResponse;
  isFirst: boolean;
  isLast: boolean;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const deleteField = useDeleteField(form.id, step.id);
  const reorderFields = useReorderFields(form.id, step.id);

  function move(direction: "up" | "down") {
    const ids = step.fields.map((f) => f.id);
    const idx = ids.indexOf(field.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ids.length) return;
    [ids[idx], ids[swapIdx]] = [ids[swapIdx]!, ids[idx]!];
    reorderFields.mutate(ids);
  }

  return (
    <div className="flex items-start justify-between gap-3 border-b py-3 last:border-b-0">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{field.label}</span>
          <Badge variant="outline">{FORM_FIELD_TYPE_LABELS[field.type]}</Badge>
          {field.required && <Badge variant="warning">Obligatoire</Badge>}
        </div>
        <p className="font-mono text-xs text-muted-foreground">{field.key}</p>
        {field.conditionalLogic && (
          <p className="text-xs text-muted-foreground">
            Affiché si <span className="font-medium">{field.conditionalLogic.field}</span> ={" "}
            <span className="font-medium">{field.conditionalLogic.equals}</span>
          </p>
        )}
      </div>

      {canManage && (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Monter le champ"
            disabled={isFirst || reorderFields.isPending}
            onClick={() => move("up")}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Descendre le champ"
            disabled={isLast || reorderFields.isPending}
            onClick={() => move("down")}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Modifier le champ" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" />
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon" aria-label="Supprimer le champ">
                <Trash2 aria-hidden="true" />
              </Button>
            }
            title="Supprimer ce champ ?"
            description={`« ${field.label} » sera définitivement supprimé, ainsi que les réponses déjà enregistrées pour ce champ.`}
            isConfirming={deleteField.isPending}
            onConfirm={() => deleteField.mutate(field.id)}
          />
        </div>
      )}

      {editing && (
        <FieldDialog form={form} stepId={step.id} field={field} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

export function StepCard({
  form,
  step,
  isFirst,
  isLast,
  canManage,
}: {
  form: FormResponse;
  step: FormStepResponse;
  isFirst: boolean;
  isLast: boolean;
  canManage: boolean;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [addingField, setAddingField] = useState(false);
  const deleteStep = useDeleteStep(form.id);
  const reorderSteps = useReorderSteps(form.id);

  function moveStep(direction: "up" | "down") {
    const ids = form.steps.map((s) => s.id);
    const idx = ids.indexOf(step.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ids.length) return;
    [ids[idx], ids[swapIdx]] = [ids[swapIdx]!, ids[idx]!];
    reorderSteps.mutate(ids);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle as="h2" className="text-base">
          {step.title}
        </CardTitle>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Monter l'étape"
              disabled={isFirst || reorderSteps.isPending}
              onClick={() => moveStep("up")}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Descendre l'étape"
              disabled={isLast || reorderSteps.isPending}
              onClick={() => moveStep("down")}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Renommer l'étape"
              onClick={() => setEditingTitle(true)}
            >
              <Pencil aria-hidden="true" />
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="icon" aria-label="Supprimer l'étape">
                  <Trash2 aria-hidden="true" />
                </Button>
              }
              title="Supprimer cette étape ?"
              description={`« ${step.title} » et ses ${step.fields.length} champ(s) seront définitivement supprimés.`}
              isConfirming={deleteStep.isPending}
              onConfirm={() => deleteStep.mutate(step.id)}
            />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {step.fields.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun champ dans cette étape.</p>
        )}
        {step.fields.map((field, index) => (
          <FieldRow
            key={field.id}
            form={form}
            step={step}
            field={field}
            isFirst={index === 0}
            isLast={index === step.fields.length - 1}
            canManage={canManage}
          />
        ))}

        {canManage && (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setAddingField(true)}>
            <Plus aria-hidden="true" />
            Ajouter un champ
          </Button>
        )}
      </CardContent>

      {editingTitle && (
        <StepTitleDialog formId={form.id} step={step} onClose={() => setEditingTitle(false)} />
      )}
      {addingField && (
        <FieldDialog form={form} stepId={step.id} onClose={() => setAddingField(false)} />
      )}
    </Card>
  );
}
