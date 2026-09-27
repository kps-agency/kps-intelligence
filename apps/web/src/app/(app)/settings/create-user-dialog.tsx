"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ROLE_LABELS } from "@kps/shared";
import { UserRole } from "@kps/types";
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
  Select,
} from "@kps/ui";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api-client";
import { useCreateUser } from "@/lib/queries/users";

const schema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est requis."),
  lastName: z.string().trim().min(1, "Le nom est requis."),
  email: z.string().trim().email("Adresse email invalide."),
  roleKey: z.nativeEnum(UserRole),
  phone: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_VALUES: FormValues = {
  firstName: "",
  lastName: "",
  email: "",
  roleKey: UserRole.TEAM_MEMBER,
  phone: "",
};

// Le dialogue possède son déclencheur (DialogTrigger) : c'est ce qui permet
// à Radix de rendre le focus au bouton quand on le ferme (Échap, Annuler,
// succès). Avec un bouton externe et un état `open` contrôlé, le focus
// retombait sur <body> — vérifié par le test navigateur.
export function CreateUserDialog({
  assignableRoles,
  onCreated,
}: {
  assignableRoles: UserRole[];
  onCreated: (email: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const createUser = useCreateUser();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset(DEFAULT_VALUES);
      createUser.reset();
    }
    setOpen(next);
  }

  function onSubmit(values: FormValues) {
    createUser.mutate(
      {
        email: values.email,
        firstName: values.firstName,
        lastName: values.lastName,
        roleKey: values.roleKey,
        phone: values.phone ? values.phone : undefined,
      },
      {
        onSuccess: (created) => {
          handleOpenChange(false);
          onCreated(created.email);
        },
      },
    );
  }

  const serverError =
    createUser.error instanceof ApiError ? createUser.error : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="shrink-0">
          <UserPlus aria-hidden="true" />
          Nouvel utilisateur
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvel utilisateur</DialogTitle>
          <DialogDescription>
            Crée le compte et son profil. L&apos;utilisateur définira son mot de
            passe via « Mot de passe oublié » sur la page de connexion.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="grid gap-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                autoComplete="off"
                aria-invalid={errors.firstName ? true : undefined}
                aria-describedby={errors.firstName ? "firstName-error" : undefined}
                {...register("firstName")}
              />
              {errors.firstName && (
                <p id="firstName-error" className="text-sm text-destructive">
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                autoComplete="off"
                aria-invalid={errors.lastName ? true : undefined}
                aria-describedby={errors.lastName ? "lastName-error" : undefined}
                {...register("lastName")}
              />
              {errors.lastName && (
                <p id="lastName-error" className="text-sm text-destructive">
                  {errors.lastName.message}
                </p>
              )}
            </div>
          </div>

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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="roleKey">Rôle</Label>
              <Select id="roleKey" {...register("roleKey")}>
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="phone">Téléphone (optionnel)</Label>
              <Input id="phone" type="tel" autoComplete="off" {...register("phone")} />
            </div>
          </div>

          {serverError && (
            <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">{serverError.message}</p>
              {serverError.requestId && (
                <p className="mt-1 text-xs">Référence : {serverError.requestId}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? "Création..." : "Créer l'utilisateur"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
