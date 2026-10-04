"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { computeQuoteTotals } from "@kps/shared";
import type { QuoteResponse } from "@kps/types";
import { Button, Input, Label, Select, Textarea } from "@kps/ui";
import { Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api-client";
import { useUpdateQuote } from "@/lib/queries/quotes";
import { formatQuoteAmount } from "@/lib/quote-display";
import { QuoteTotalsTable } from "./quote-totals-table";

const CURRENCIES = ["CHF", "EUR", "CAD", "USD", "XOF"];

const amount = (max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max, {
      message,
    });
const percent = amount(100, "Entre 0 et 100.");

const schema = z.object({
  title: z.string().trim().min(1, "Le titre est requis.").max(200),
  notes: z.string().trim().max(3000),
  currency: z.string(),
  validUntil: z.string(),
  discountPercent: percent,
  taxRate: percent,
  items: z.array(
    z.object({
      description: z.string().trim().min(1, "Désignation requise.").max(1000),
      quantity: z
        .string()
        .trim()
        .refine((value) => Number(value) > 0 && Number(value) <= 99_999.99, { message: "Quantité > 0." }),
      unitPrice: amount(9_999_999.99, "Prix invalide."),
      discountPercent: percent,
    }),
  ),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_LINE = { description: "", quantity: "1", unitPrice: "0", discountPercent: "0" };
const round2 = (value: string) => Math.round(Number(value) * 100) / 100;

function toFormValues(quote: QuoteResponse): FormValues {
  return {
    title: quote.title,
    notes: quote.notes ?? "",
    currency: quote.currency,
    validUntil: quote.validUntil ?? "",
    discountPercent: String(quote.discountPercent),
    taxRate: String(quote.taxRate),
    items: quote.items.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      discountPercent: String(item.discountPercent),
    })),
  };
}

// Édition d'un brouillon. Les totaux affichés pendant la saisie sont un
// aperçu (même fonction de calcul que l'API) ; ceux qui font foi sont
// recalculés par le serveur à l'enregistrement.
export function QuoteEditor({
  quote,
  onDirtyChange,
}: {
  quote: QuoteResponse;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const updateQuote = useUpdateQuote(quote.id);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toFormValues(quote) });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  useEffect(() => reset(toFormValues(quote)), [quote, reset]);
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);

  const watched = useWatch({ control });
  const preview = computeQuoteTotals(
    (watched.items ?? []).map((item) => ({
      quantity: Number(item?.quantity) || 0,
      unitPrice: Number(item?.unitPrice) || 0,
      discountPercent: Number(item?.discountPercent) || 0,
    })),
    Number(watched.discountPercent) || 0,
    Number(watched.taxRate) || 0,
  );
  const currency = watched.currency ?? quote.currency;

  function onSubmit(values: FormValues) {
    updateQuote.mutate({
      title: values.title,
      notes: values.notes || null,
      currency: values.currency,
      validUntil: values.validUntil || null,
      discountPercent: round2(values.discountPercent),
      taxRate: round2(values.taxRate),
      items: values.items.map((item) => ({
        description: item.description,
        quantity: round2(item.quantity),
        unitPrice: round2(item.unitPrice),
        discountPercent: round2(item.discountPercent),
      })),
    });
  }

  const serverError = updateQuote.error instanceof ApiError ? updateQuote.error : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="quote-title">Titre</Label>
          <Input
            id="quote-title"
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? "quote-title-error" : undefined}
            {...register("title")}
          />
          {errors.title && (
            <p id="quote-title-error" className="text-sm text-destructive">
              {errors.title.message}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="quote-currency">Devise</Label>
          <Select id="quote-currency" {...register("currency")}>
            {[...new Set([quote.currency, ...CURRENCIES])].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="quote-validUntil">Valable jusqu&apos;au</Label>
          <Input id="quote-validUntil" type="date" {...register("validUntil")} />
        </div>
      </div>

      <section aria-labelledby="quote-lines-title" className="grid gap-3">
        <h3 id="quote-lines-title" className="text-sm font-semibold">
          Lignes
        </h3>
        {fields.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune ligne : ajoutez-en une pour chiffrer le devis.</p>
        )}
        <ol className="grid gap-3">
          {fields.map((field, index) => {
            const lineErrors = errors.items?.[index];
            const n = index + 1;
            return (
              <li key={field.id} className="grid gap-3 rounded-md border p-3 sm:grid-cols-12 sm:items-start">
                <div className="grid gap-1.5 sm:col-span-5">
                  <Label htmlFor={`line-${index}-description`}>Désignation {n}</Label>
                  <Textarea
                    id={`line-${index}-description`}
                    rows={2}
                    aria-invalid={lineErrors?.description ? true : undefined}
                    aria-describedby={lineErrors?.description ? `line-${index}-description-error` : undefined}
                    {...register(`items.${index}.description`)}
                  />
                  {lineErrors?.description && (
                    <p id={`line-${index}-description-error`} className="text-sm text-destructive">
                      {lineErrors.description.message}
                    </p>
                  )}
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor={`line-${index}-quantity`}>Quantité {n}</Label>
                  <Input
                    id={`line-${index}-quantity`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    aria-invalid={lineErrors?.quantity ? true : undefined}
                    aria-describedby={lineErrors?.quantity ? `line-${index}-quantity-error` : undefined}
                    {...register(`items.${index}.quantity`)}
                  />
                  {lineErrors?.quantity && (
                    <p id={`line-${index}-quantity-error`} className="text-sm text-destructive">
                      {lineErrors.quantity.message}
                    </p>
                  )}
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor={`line-${index}-unitPrice`}>Prix unitaire {n}</Label>
                  <Input
                    id={`line-${index}-unitPrice`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    aria-invalid={lineErrors?.unitPrice ? true : undefined}
                    aria-describedby={lineErrors?.unitPrice ? `line-${index}-unitPrice-error` : undefined}
                    {...register(`items.${index}.unitPrice`)}
                  />
                  {lineErrors?.unitPrice && (
                    <p id={`line-${index}-unitPrice-error`} className="text-sm text-destructive">
                      {lineErrors.unitPrice.message}
                    </p>
                  )}
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor={`line-${index}-discount`}>Remise {n} (%)</Label>
                  <Input
                    id={`line-${index}-discount`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.01"
                    aria-invalid={lineErrors?.discountPercent ? true : undefined}
                    aria-describedby={lineErrors?.discountPercent ? `line-${index}-discount-error` : undefined}
                    {...register(`items.${index}.discountPercent`)}
                  />
                  {lineErrors?.discountPercent && (
                    <p id={`line-${index}-discount-error`} className="text-sm text-destructive">
                      {lineErrors.discountPercent.message}
                    </p>
                  )}
                </div>
                <div className="flex items-end justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Supprimer la ligne ${n}`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground sm:col-span-12 sm:text-right">
                  Montant de la ligne {n} :{" "}
                  <span className="font-medium text-foreground">
                    {formatQuoteAmount(preview.lineTotals[index] ?? 0, currency)}
                  </span>
                </p>
              </li>
            );
          })}
        </ol>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => append(EMPTY_LINE)}>
            <Plus aria-hidden="true" />
            Ajouter une ligne
          </Button>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="quote-discount">Remise globale (%)</Label>
              <Input
                id="quote-discount"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.01"
                aria-invalid={errors.discountPercent ? true : undefined}
                aria-describedby={errors.discountPercent ? "quote-discount-error" : undefined}
                {...register("discountPercent")}
              />
              {errors.discountPercent && (
                <p id="quote-discount-error" className="text-sm text-destructive">
                  {errors.discountPercent.message}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="quote-taxRate">TVA (%)</Label>
              <Input
                id="quote-taxRate"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.01"
                aria-invalid={errors.taxRate ? true : undefined}
                aria-describedby={errors.taxRate ? "quote-taxRate-error" : undefined}
                {...register("taxRate")}
              />
              {errors.taxRate && (
                <p id="quote-taxRate-error" className="text-sm text-destructive">
                  {errors.taxRate.message}
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="quote-notes">Remarques (affichées sur le devis)</Label>
            <Textarea id="quote-notes" rows={3} {...register("notes")} />
          </div>
        </div>
        <QuoteTotalsTable
          caption={isDirty ? "Aperçu des totaux (non enregistré)" : "Totaux"}
          currency={currency}
          discountPercent={Number(watched.discountPercent) || 0}
          taxRate={Number(watched.taxRate) || 0}
          totals={preview}
        />
      </div>

      {serverError && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {serverError.details.length > 1 ? serverError.details.join(" ") : serverError.message}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <p role="status" className="text-sm text-muted-foreground">
          {isDirty ? "Modifications non enregistrées." : ""}
        </p>
        <Button type="submit" disabled={updateQuote.isPending || !isDirty}>
          {updateQuote.isPending ? "Enregistrement..." : "Enregistrer le brouillon"}
        </Button>
      </div>
    </form>
  );
}
