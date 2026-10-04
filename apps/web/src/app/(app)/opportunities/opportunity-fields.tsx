"use client";

import { Input, Label, Select, Textarea } from "@kps/ui";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { z } from "zod";
import { useClients } from "@/lib/queries/clients";
import { useOpportunityOwners } from "@/lib/queries/opportunities";
import { useServices } from "@/lib/queries/services";

export const NONE = "__none__";
// Même limite que les autres sélecteurs de client : un <select> simple
// suffit tant que la base de clients reste modeste.
const CLIENT_PICKER_LIMIT = 100;
const CURRENCIES = ["CHF", "EUR", "CAD", "USD", "XOF"];

// Champs communs à la création et à la modification d'une opportunité.
export const opportunityFieldsSchema = z.object({
  title: z.string().trim().min(1, "Le titre est requis.").max(200),
  description: z.string().trim().max(5000).optional(),
  clientId: z.string(),
  serviceId: z.string(),
  estimatedValue: z
    .string()
    .trim()
    .refine((value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0), {
      message: "Montant invalide.",
    }),
  currency: z.string(),
  // Modification uniquement : à la création, c'est celle de l'étape.
  probability: z
    .string()
    .trim()
    .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) <= 100), {
      message: "Entier entre 0 et 100.",
    }),
  ownerUserId: z.string(),
  expectedCloseDate: z.string(),
});

export type OpportunityFieldsValues = z.infer<typeof opportunityFieldsSchema>;

export function toAmount(value: string): number | null {
  return value.trim() === "" ? null : Math.round(Number(value) * 100) / 100;
}

export function OpportunityFields({
  idPrefix,
  register,
  errors,
  currencyAuto,
  withProbability = false,
}: {
  idPrefix: string;
  register: UseFormRegister<OpportunityFieldsValues>;
  errors: FieldErrors<OpportunityFieldsValues>;
  // À la création, la devise peut être déduite du pays du client.
  currencyAuto: boolean;
  withProbability?: boolean;
}) {
  const clients = useClients({ page: 1, limit: CLIENT_PICKER_LIMIT });
  const services = useServices();
  const owners = useOpportunityOwners();
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor={id("title")}>Titre</Label>
        <Input
          id={id("title")}
          autoComplete="off"
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? id("title-error") : undefined}
          {...register("title")}
        />
        {errors.title && (
          <p id={id("title-error")} className="text-sm text-destructive">
            {errors.title.message}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={id("clientId")}>Client</Label>
          <Select id={id("clientId")} {...register("clientId")}>
            <option value={NONE}>Aucun (prospect sans fiche)</option>
            {clients.data?.data.map((client) => (
              <option key={client.id} value={client.id}>
                {client.companyName}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("serviceId")}>Service</Label>
          <Select id={id("serviceId")} {...register("serviceId")}>
            <option value={NONE}>Non défini</option>
            {services.data?.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={id("estimatedValue")}>Valeur estimée</Label>
          <Input
            id={id("estimatedValue")}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            aria-invalid={errors.estimatedValue ? true : undefined}
            aria-describedby={errors.estimatedValue ? id("estimatedValue-error") : undefined}
            {...register("estimatedValue")}
          />
          {errors.estimatedValue && (
            <p id={id("estimatedValue-error")} className="text-sm text-destructive">
              {errors.estimatedValue.message}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("currency")}>Devise</Label>
          <Select id={id("currency")} {...register("currency")}>
            {currencyAuto && <option value={NONE}>Selon le pays du client</option>}
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={id("ownerUserId")}>Responsable</Label>
          <Select id={id("ownerUserId")} {...register("ownerUserId")}>
            <option value={NONE}>Personne (tous les commerciaux sont notifiés)</option>
            {owners.data?.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.fullName}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("expectedCloseDate")}>Clôture prévue</Label>
          <Input id={id("expectedCloseDate")} type="date" {...register("expectedCloseDate")} />
        </div>
      </div>

      {withProbability && (
        <div className="grid gap-1.5 sm:max-w-xs">
          <Label htmlFor={id("probability")}>Probabilité de gain (%)</Label>
          <Input
            id={id("probability")}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            aria-invalid={errors.probability ? true : undefined}
            aria-describedby={id("probability-hint")}
            {...register("probability")}
          />
          <p id={id("probability-hint")} className="text-xs text-muted-foreground">
            {errors.probability?.message ?? "Réinitialisée à la valeur de l'étape à chaque changement d'étape."}
          </p>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor={id("description")}>Description</Label>
        <Textarea id={id("description")} rows={4} {...register("description")} />
      </div>
    </>
  );
}
