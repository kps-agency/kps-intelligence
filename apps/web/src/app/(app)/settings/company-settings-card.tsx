"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { CompanySettingsResponse } from "@kps/types";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Skeleton, Textarea } from "@kps/ui";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api-client";
import { useCompanySettings, useUpdateCompanySettings } from "@/lib/queries/quotes";

const optionalText = z.string().trim();

const schema = z.object({
  legalName: optionalText,
  address: optionalText,
  postalCode: optionalText,
  city: optionalText,
  country: optionalText,
  vatNumber: optionalText,
  email: optionalText.refine((value) => value === "" || z.string().email().safeParse(value).success, {
    message: "Adresse email invalide.",
  }),
  phone: optionalText,
  website: optionalText,
  iban: optionalText,
  defaultTaxRate: z
    .string()
    .trim()
    .refine((value) => value !== "" && Number(value) >= 0 && Number(value) <= 100, {
      message: "Taux entre 0 et 100.",
    }),
  quoteValidityDays: z
    .string()
    .trim()
    .refine((value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 365, {
      message: "Entre 1 et 365 jours.",
    }),
  quoteTerms: optionalText,
});

type FormValues = z.infer<typeof schema>;

function toFormValues(settings: CompanySettingsResponse): FormValues {
  return {
    legalName: settings.legalName ?? "",
    address: settings.address ?? "",
    postalCode: settings.postalCode ?? "",
    city: settings.city ?? "",
    country: settings.country ?? "",
    vatNumber: settings.vatNumber ?? "",
    email: settings.email ?? "",
    phone: settings.phone ?? "",
    website: settings.website ?? "",
    iban: settings.iban ?? "",
    defaultTaxRate: String(settings.defaultTaxRate),
    quoteValidityDays: String(settings.quoteValidityDays),
    quoteTerms: settings.quoteTerms ?? "",
  };
}

const TEXT_FIELDS: { name: keyof FormValues; label: string; autoComplete?: string }[] = [
  { name: "legalName", label: "Raison sociale", autoComplete: "organization" },
  { name: "vatNumber", label: "Numéro de TVA" },
  { name: "address", label: "Adresse", autoComplete: "street-address" },
  { name: "postalCode", label: "Code postal", autoComplete: "postal-code" },
  { name: "city", label: "Ville", autoComplete: "address-level2" },
  { name: "country", label: "Pays", autoComplete: "country-name" },
  { name: "email", label: "Email", autoComplete: "email" },
  { name: "phone", label: "Téléphone", autoComplete: "tel" },
  { name: "website", label: "Site web", autoComplete: "url" },
  { name: "iban", label: "IBAN" },
];

// Identité de l'entreprise : les mentions qui figurent sur chaque devis.
export function CompanySettingsCard({ canManage }: { canManage: boolean }) {
  const settings = useCompanySettings();
  const update = useUpdateCompanySettings();
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (settings.data) reset(toFormValues(settings.data));
  }, [settings.data, reset]);

  function onSubmit(values: FormValues) {
    setSaved(false);
    update.mutate(
      {
        legalName: values.legalName || null,
        address: values.address || null,
        postalCode: values.postalCode || null,
        city: values.city || null,
        country: values.country || null,
        vatNumber: values.vatNumber || null,
        email: values.email || null,
        phone: values.phone || null,
        website: values.website || null,
        iban: values.iban || null,
        defaultTaxRate: Number(values.defaultTaxRate),
        quoteValidityDays: Number(values.quoteValidityDays),
        quoteTerms: values.quoteTerms || null,
      },
      { onSuccess: () => setSaved(true) },
    );
  }

  const serverError = update.error instanceof ApiError ? update.error : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Entreprise</CardTitle>
        <CardDescription>
          Mentions qui figurent sur les devis. Sans raison sociale, aucun devis ne peut être généré ni envoyé.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {settings.isPending && <Skeleton className="h-40 w-full" />}
        {settings.isError && (
          <p role="alert" className="text-sm text-destructive">
            Impossible de charger les paramètres de l&apos;entreprise.
          </p>
        )}
        {settings.data && (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
            <fieldset disabled={!canManage} className="grid gap-4">
              <legend className="sr-only">Identité de l&apos;entreprise</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {TEXT_FIELDS.map((field) => (
                  <div key={field.name} className="grid gap-1.5">
                    <Label htmlFor={`company-${field.name}`}>{field.label}</Label>
                    <Input
                      id={`company-${field.name}`}
                      autoComplete={field.autoComplete ?? "off"}
                      aria-invalid={errors[field.name] ? true : undefined}
                      aria-describedby={errors[field.name] ? `company-${field.name}-error` : undefined}
                      {...register(field.name)}
                    />
                    {errors[field.name] && (
                      <p id={`company-${field.name}-error`} className="text-sm text-destructive">
                        {errors[field.name]?.message}
                      </p>
                    )}
                  </div>
                ))}
                <div className="grid gap-1.5">
                  <Label htmlFor="company-defaultTaxRate">Taux de TVA par défaut (%)</Label>
                  <Input
                    id="company-defaultTaxRate"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.01"
                    aria-invalid={errors.defaultTaxRate ? true : undefined}
                    aria-describedby={errors.defaultTaxRate ? "company-defaultTaxRate-error" : undefined}
                    {...register("defaultTaxRate")}
                  />
                  {errors.defaultTaxRate && (
                    <p id="company-defaultTaxRate-error" className="text-sm text-destructive">
                      {errors.defaultTaxRate.message}
                    </p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="company-quoteValidityDays">Validité d&apos;un devis (jours)</Label>
                  <Input
                    id="company-quoteValidityDays"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={365}
                    step={1}
                    aria-invalid={errors.quoteValidityDays ? true : undefined}
                    aria-describedby={errors.quoteValidityDays ? "company-quoteValidityDays-error" : undefined}
                    {...register("quoteValidityDays")}
                  />
                  {errors.quoteValidityDays && (
                    <p id="company-quoteValidityDays-error" className="text-sm text-destructive">
                      {errors.quoteValidityDays.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="company-quoteTerms">Conditions affichées en bas des devis</Label>
                <Textarea id="company-quoteTerms" rows={3} {...register("quoteTerms")} />
              </div>
            </fieldset>

            {serverError && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {serverError.message}
              </p>
            )}
            {canManage ? (
              <div className="flex items-center justify-end gap-3">
                <p role="status" className="text-sm text-muted-foreground">
                  {saved && !isDirty ? "Paramètres enregistrés." : ""}
                </p>
                <Button type="submit" disabled={update.isPending || !isDirty}>
                  {update.isPending ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Modification réservée aux administrateurs.</p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
