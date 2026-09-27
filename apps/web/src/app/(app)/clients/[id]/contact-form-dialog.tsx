"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ContactResponse } from "@kps/types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from "@kps/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api-client";
import { useCreateContact, useUpdateContact } from "@/lib/queries/contacts";

const schema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est requis."),
  lastName: z.string().trim().min(1, "Le nom est requis."),
  email: z.string().trim().email("Adresse email invalide.").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  position: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

function toFormValues(contact?: ContactResponse): FormValues {
  return {
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    position: contact?.position ?? "",
  };
}

export function ContactFormDialog({
  clientId,
  contact,
  trigger,
}: {
  clientId: string;
  // Absent = création ; fourni = édition de ce contact.
  contact?: ContactResponse;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const createContact = useCreateContact(clientId);
  const updateContact = useUpdateContact();
  const mutation = contact ? updateContact : createContact;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(contact),
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset(toFormValues(contact));
      mutation.reset();
    }
    setOpen(next);
  }

  function onSubmit(values: FormValues) {
    const request = {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email || undefined,
      phone: values.phone || undefined,
      position: values.position || undefined,
    };

    if (contact) {
      updateContact.mutate(
        { id: contact.id, request },
        { onSuccess: () => handleOpenChange(false) },
      );
    } else {
      createContact.mutate(request, { onSuccess: () => handleOpenChange(false) });
    }
  }

  const serverError = mutation.error instanceof ApiError ? mutation.error : null;
  const idPrefix = contact ? `contact-${contact.id}` : "contact-new";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contact ? "Modifier le contact" : "Nouveau contact"}</DialogTitle>
          {!contact && (
            <DialogDescription>
              Le premier contact d&apos;un client devient automatiquement le
              contact principal.
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${idPrefix}-firstName`}>Prénom</Label>
              <Input
                id={`${idPrefix}-firstName`}
                aria-invalid={errors.firstName ? true : undefined}
                aria-describedby={errors.firstName ? `${idPrefix}-firstName-error` : undefined}
                {...register("firstName")}
              />
              {errors.firstName && (
                <p id={`${idPrefix}-firstName-error`} className="text-sm text-destructive">
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${idPrefix}-lastName`}>Nom</Label>
              <Input
                id={`${idPrefix}-lastName`}
                aria-invalid={errors.lastName ? true : undefined}
                aria-describedby={errors.lastName ? `${idPrefix}-lastName-error` : undefined}
                {...register("lastName")}
              />
              {errors.lastName && (
                <p id={`${idPrefix}-lastName-error`} className="text-sm text-destructive">
                  {errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-position`}>Fonction</Label>
            <Input id={`${idPrefix}-position`} {...register("position")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${idPrefix}-email`}>Email</Label>
              <Input
                id={`${idPrefix}-email`}
                type="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? `${idPrefix}-email-error` : undefined}
                {...register("email")}
              />
              {errors.email && (
                <p id={`${idPrefix}-email-error`} className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${idPrefix}-phone`}>Téléphone</Label>
              <Input id={`${idPrefix}-phone`} type="tel" {...register("phone")} />
            </div>
          </div>

          {serverError && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Enregistrement..." : contact ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
