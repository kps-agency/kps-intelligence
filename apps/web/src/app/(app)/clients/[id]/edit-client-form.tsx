"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CLIENT_STATUS_LABELS } from "@kps/shared";
import { ClientStatus, type ClientResponse } from "@kps/types";
import { Button, Input, Label, Select, Textarea } from "@kps/ui";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api-client";
import { useUpdateClient } from "@/lib/queries/clients";

const schema = z.object({
  companyName: z.string().trim().min(1, "Le nom de la société est requis."),
  status: z.nativeEnum(ClientStatus),
  country: z.string().trim().optional(),
  city: z.string().trim().optional(),
  email: z.string().trim().email("Adresse email invalide.").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  website: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

function toFormValues(client: ClientResponse): FormValues {
  return {
    companyName: client.companyName,
    status: client.status,
    country: client.country ?? "",
    city: client.city ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    website: client.website ?? "",
    notes: client.notes ?? "",
  };
}

export function EditClientForm({
  client,
  onDone,
}: {
  client: ClientResponse;
  onDone: () => void;
}) {
  const updateClient = useUpdateClient(client.id);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toFormValues(client) });

  // Le client peut avoir été rechargé (ex. bascule statut) pendant l'édition.
  useEffect(() => reset(toFormValues(client)), [client, reset]);

  function onSubmit(values: FormValues) {
    updateClient.mutate(
      {
        companyName: values.companyName,
        status: values.status,
        country: values.country || null,
        city: values.city || null,
        email: values.email || null,
        phone: values.phone || null,
        website: values.website || null,
        notes: values.notes || null,
      },
      { onSuccess: onDone },
    );
  }

  const serverError =
    updateClient.error instanceof ApiError ? updateClient.error : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="edit-companyName">Société</Label>
          <Input
            id="edit-companyName"
            aria-invalid={errors.companyName ? true : undefined}
            aria-describedby={errors.companyName ? "edit-companyName-error" : undefined}
            {...register("companyName")}
          />
          {errors.companyName && (
            <p id="edit-companyName-error" className="text-sm text-destructive">
              {errors.companyName.message}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edit-status">Statut</Label>
          <Select id="edit-status" {...register("status")}>
            {Object.values(ClientStatus).map((value) => (
              <option key={value} value={value}>
                {CLIENT_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="edit-country">Pays</Label>
          <Input id="edit-country" {...register("country")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edit-city">Ville</Label>
          <Input id="edit-city" {...register("city")} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="edit-email">Email</Label>
          <Input
            id="edit-email"
            type="email"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "edit-email-error" : undefined}
            {...register("email")}
          />
          {errors.email && (
            <p id="edit-email-error" className="text-sm text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edit-phone">Téléphone</Label>
          <Input id="edit-phone" type="tel" {...register("phone")} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="edit-website">Site web</Label>
        <Input id="edit-website" {...register("website")} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="edit-notes">Notes</Label>
        <Textarea id="edit-notes" {...register("notes")} />
      </div>

      {serverError && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {serverError.message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" disabled={updateClient.isPending || !isDirty}>
          {updateClient.isPending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
