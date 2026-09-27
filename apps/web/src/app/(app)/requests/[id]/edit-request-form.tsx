"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PRIORITY_LABELS, REQUEST_STATUS_LABELS } from "@kps/shared";
import { PriorityLevel, RequestStatus, type RequestResponse } from "@kps/types";
import { Button, Input, Label, Select, Textarea } from "@kps/ui";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api-client";
import { useClients } from "@/lib/queries/clients";
import { useContactsByClient } from "@/lib/queries/contacts";
import { useUpdateRequest } from "@/lib/queries/requests";

const NONE = "__none__";
const CLIENT_PICKER_LIMIT = 100;

const schema = z.object({
  subject: z.string().trim().min(1, "Le sujet est requis."),
  originalMessage: z.string().trim().optional(),
  language: z.string().trim().optional(),
  country: z.string().trim().optional(),
  status: z.nativeEnum(RequestStatus),
  priority: z.nativeEnum(PriorityLevel).optional().or(z.literal("")),
  urgency: z.nativeEnum(PriorityLevel).optional().or(z.literal("")),
  clientId: z.string(),
  contactId: z.string(),
});

type FormValues = z.infer<typeof schema>;

function toFormValues(req: RequestResponse): FormValues {
  return {
    subject: req.subject,
    originalMessage: req.originalMessage ?? "",
    language: req.language ?? "",
    country: req.country ?? "",
    status: req.status,
    priority: req.priority ?? "",
    urgency: req.urgency ?? "",
    clientId: req.clientId ?? NONE,
    contactId: req.contactId ?? NONE,
  };
}

export function EditRequestForm({
  request,
  onDone,
}: {
  request: RequestResponse;
  onDone: () => void;
}) {
  const updateRequest = useUpdateRequest(request.id);
  const clients = useClients({ page: 1, limit: CLIENT_PICKER_LIMIT });
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(request),
  });

  useEffect(() => reset(toFormValues(request)), [request, reset]);

  const selectedClientId = watch("clientId");
  const effectiveClientId = selectedClientId === NONE ? "" : selectedClientId;
  const contacts = useContactsByClient(effectiveClientId);

  function onSubmit(values: FormValues) {
    updateRequest.mutate(
      {
        subject: values.subject,
        originalMessage: values.originalMessage || null,
        language: values.language || null,
        country: values.country || null,
        status: values.status,
        priority: values.priority || undefined,
        urgency: values.urgency || undefined,
        clientId: values.clientId === NONE ? null : values.clientId,
        contactId: values.contactId === NONE ? null : values.contactId,
      },
      { onSuccess: onDone },
    );
  }

  const serverError =
    updateRequest.error instanceof ApiError ? updateRequest.error : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="edit-req-subject">Sujet</Label>
        <Input
          id="edit-req-subject"
          aria-invalid={errors.subject ? true : undefined}
          aria-describedby={errors.subject ? "edit-req-subject-error" : undefined}
          {...register("subject")}
        />
        {errors.subject && (
          <p id="edit-req-subject-error" className="text-sm text-destructive">
            {errors.subject.message}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="edit-req-message">Message</Label>
        <Textarea id="edit-req-message" {...register("originalMessage")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="edit-req-status">Statut</Label>
          <Select id="edit-req-status" {...register("status")}>
            {Object.values(RequestStatus).map((value) => (
              <option key={value} value={value}>
                {REQUEST_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edit-req-priority">Priorité</Label>
          <Select id="edit-req-priority" {...register("priority")}>
            <option value="">Non définie</option>
            {Object.values(PriorityLevel).map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edit-req-urgency">Urgence</Label>
          <Select id="edit-req-urgency" {...register("urgency")}>
            <option value="">Non définie</option>
            {Object.values(PriorityLevel).map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="edit-req-country">Pays</Label>
          <Input id="edit-req-country" {...register("country")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edit-req-language">Langue</Label>
          <Input id="edit-req-language" placeholder="fr" {...register("language")} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="edit-req-clientId">Client</Label>
          <Select
            id="edit-req-clientId"
            {...register("clientId", { onChange: () => setValue("contactId", NONE) })}
          >
            <option value={NONE}>Aucun</option>
            {clients.data?.data.map((client) => (
              <option key={client.id} value={client.id}>
                {client.companyName}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edit-req-contactId">Contact</Label>
          <Select
            id="edit-req-contactId"
            disabled={selectedClientId === NONE}
            {...register("contactId")}
          >
            <option value={NONE}>Aucun</option>
            {contacts.data?.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.firstName} {contact.lastName}
              </option>
            ))}
          </Select>
        </div>
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
        <Button type="submit" disabled={updateRequest.isPending || !isDirty}>
          {updateRequest.isPending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
