"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
  Textarea,
} from "@kps/ui";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api-client";
import { useCreateClient } from "@/lib/queries/clients";

const schema = z.object({
  companyName: z.string().trim().min(1, "Le nom de la société est requis."),
  country: z.string().trim().optional(),
  city: z.string().trim().optional(),
  email: z.string().trim().email("Adresse email invalide.").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  website: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_VALUES: FormValues = {
  companyName: "",
  country: "",
  city: "",
  email: "",
  phone: "",
  website: "",
  notes: "",
};

// Le déclencheur fait partie du dialogue (Radix rend le focus au clic qui
// l'a ouvert à la fermeture) — même schéma que CreateUserDialog (Phase 5),
// où un bouton externe avait cassé le retour de focus.
export function CreateClientDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const createClient = useCreateClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULT_VALUES });

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset(DEFAULT_VALUES);
      createClient.reset();
    }
    setOpen(next);
  }

  function onSubmit(values: FormValues) {
    createClient.mutate(
      {
        companyName: values.companyName,
        country: values.country || undefined,
        city: values.city || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
        website: values.website || undefined,
        notes: values.notes || undefined,
      },
      {
        onSuccess: (created) => {
          handleOpenChange(false);
          router.push(`/clients/${created.id}`);
        },
      },
    );
  }

  const serverError =
    createClient.error instanceof ApiError ? createClient.error : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="shrink-0">
          <Plus aria-hidden="true" />
          Nouveau client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau client</DialogTitle>
          <DialogDescription>
            Vous pourrez ajouter des contacts une fois le client créé.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="companyName">Société</Label>
            <Input
              id="companyName"
              autoComplete="off"
              aria-invalid={errors.companyName ? true : undefined}
              aria-describedby={errors.companyName ? "companyName-error" : undefined}
              {...register("companyName")}
            />
            {errors.companyName && (
              <p id="companyName-error" className="text-sm text-destructive">
                {errors.companyName.message}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="country">Pays</Label>
              <Input id="country" autoComplete="off" {...register("country")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="city">Ville</Label>
              <Input id="city" autoComplete="off" {...register("city")} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="off"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? "email-error" : undefined}
                {...register("email")}
              />
              {errors.email && (
                <p id="email-error" className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" type="tel" autoComplete="off" {...register("phone")} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="website">Site web</Label>
            <Input id="website" autoComplete="off" {...register("website")} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} />
          </div>

          {serverError && (
            <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">{serverError.message}</p>
              {serverError.details.length > 1 && (
                <ul className="mt-1 list-disc pl-4">
                  {serverError.details.slice(1).map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
              {serverError.requestId && (
                <p className="mt-1 text-xs">Référence : {serverError.requestId}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={createClient.isPending}>
              {createClient.isPending ? "Création..." : "Créer le client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
