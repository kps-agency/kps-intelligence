"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PRIORITY_LABELS } from "@kps/shared";
import { PriorityLevel } from "@kps/types";
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
  Textarea,
} from "@kps/ui";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api-client";
import { useClients } from "@/lib/queries/clients";
import { useContactsByClient } from "@/lib/queries/contacts";
import { useCreateRequest } from "@/lib/queries/requests";

const schema = z.object({
  subject: z.string().trim().min(1, "Le sujet est requis."),
  originalMessage: z.string().trim().optional(),
  priority: z.nativeEnum(PriorityLevel).optional().or(z.literal("")),
  clientId: z.string().optional(),
  contactId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_VALUES: FormValues = {
  subject: "",
  originalMessage: "",
  priority: "",
  clientId: "",
  contactId: "",
};

// Cette liste (jusqu'à 100 clients) alimente un <select> simple. Au-delà,
// il faudra un vrai combobox avec recherche côté serveur — pas nécessaire
// tant que la base de clients reste modeste.
const CLIENT_PICKER_LIMIT = 100;

export function CreateRequestDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const createRequest = useCreateRequest();
  const clients = useClients({ page: 1, limit: CLIENT_PICKER_LIMIT });
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULT_VALUES });

  const selectedClientId = watch("clientId") ?? "";
  const contacts = useContactsByClient(selectedClientId);

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset(DEFAULT_VALUES);
      createRequest.reset();
    }
    setOpen(next);
  }

  function onSubmit(values: FormValues) {
    createRequest.mutate(
      {
        subject: values.subject,
        originalMessage: values.originalMessage || undefined,
        priority: values.priority || undefined,
        clientId: values.clientId || undefined,
        contactId: values.contactId || undefined,
      },
      {
        onSuccess: (created) => {
          handleOpenChange(false);
          router.push(`/requests/${created.id}`);
        },
      },
    );
  }

  const serverError =
    createRequest.error instanceof ApiError ? createRequest.error : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="shrink-0">
          <Plus aria-hidden="true" />
          Nouvelle demande
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle demande</DialogTitle>
          <DialogDescription>
            Saisie manuelle — les canaux email et WhatsApp créeront les
            demandes automatiquement dans une prochaine phase.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="subject">Sujet</Label>
            <Input
              id="subject"
              autoComplete="off"
              aria-invalid={errors.subject ? true : undefined}
              aria-describedby={errors.subject ? "subject-error" : undefined}
              {...register("subject")}
            />
            {errors.subject && (
              <p id="subject-error" className="text-sm text-destructive">
                {errors.subject.message}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="originalMessage">Message</Label>
            <Textarea id="originalMessage" {...register("originalMessage")} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="priority">Priorité</Label>
            <Select id="priority" {...register("priority")}>
              <option value="">Non définie</option>
              {Object.values(PriorityLevel).map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="clientId">Client (optionnel)</Label>
              <Select
                id="clientId"
                {...register("clientId", {
                  onChange: () => setValue("contactId", ""),
                })}
              >
                <option value="">Aucun</option>
                {clients.data?.data.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.companyName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="contactId">Contact (optionnel)</Label>
              <Select
                id="contactId"
                disabled={!selectedClientId}
                {...register("contactId")}
              >
                <option value="">Aucun</option>
                {selectedClientId &&
                  contacts.data?.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.firstName} {contact.lastName}
                    </option>
                  ))}
              </Select>
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
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={createRequest.isPending}>
              {createRequest.isPending ? "Création..." : "Créer la demande"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
