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
import { useCreateForm } from "@/lib/queries/forms";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const schema = z.object({
  name: z.string().trim().min(1, "Le nom est requis."),
  slug: z
    .string()
    .trim()
    .min(1, "Le slug est requis.")
    .regex(SLUG_PATTERN, "Minuscules, chiffres et tirets uniquement."),
  description: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateFormDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const createForm = useCreateForm();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
      createForm.reset();
    }
    setOpen(next);
  }

  function onSubmit(values: FormValues) {
    createForm.mutate(
      { name: values.name, slug: values.slug, description: values.description || undefined },
      {
        onSuccess: (created) => {
          handleOpenChange(false);
          router.push(`/forms/${created.id}`);
        },
      },
    );
  }

  const serverError = createForm.error instanceof ApiError ? createForm.error : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="shrink-0">
          <Plus aria-hidden="true" />
          Nouveau formulaire
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau formulaire</DialogTitle>
          <DialogDescription>
            Un formulaire commence vide (brouillon) — ajoutez ses étapes et champs ensuite.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="form-name">Nom</Label>
            <Input id="form-name" autoComplete="off" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="form-slug">Slug</Label>
            <Input id="form-slug" autoComplete="off" placeholder="mon-formulaire" {...register("slug")} />
            {errors.slug && <p className="text-sm text-destructive">{errors.slug.message}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="form-description">Description</Label>
            <Textarea id="form-description" {...register("description")} />
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
            <Button type="submit" disabled={createForm.isPending}>
              {createForm.isPending ? "Création..." : "Créer le formulaire"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
