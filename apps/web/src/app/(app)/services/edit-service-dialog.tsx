"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { SERVICE_STATUS_LABELS } from "@kps/shared";
import { ServiceStatus, type ServiceResponse } from "@kps/types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  Textarea,
} from "@kps/ui";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api-client";
import { useForms } from "@/lib/queries/forms";
import { useUpdateService } from "@/lib/queries/services";

const NONE = "__none__";

const schema = z.object({
  description: z.string().trim().optional(),
  status: z.nativeEnum(ServiceStatus),
  qualificationFormId: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function EditServiceDialog({
  service,
  onClose,
}: {
  service: ServiceResponse;
  onClose: () => void;
}) {
  const updateService = useUpdateService(service.id);
  const forms = useForms();
  const {
    register,
    handleSubmit,
    formState: { isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      description: service.description ?? "",
      status: service.status,
      qualificationFormId: service.qualificationFormId ?? NONE,
    },
  });

  function onSubmit(values: FormValues) {
    updateService.mutate(
      {
        description: values.description || null,
        status: values.status,
        qualificationFormId: values.qualificationFormId === NONE ? null : values.qualificationFormId,
      },
      { onSuccess: onClose },
    );
  }

  const serverError = updateService.error instanceof ApiError ? updateService.error : null;
  const publishedForms = (forms.data ?? []).filter((f) => f.status === "PUBLISHED");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurer « {service.name} »</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="service-description">Description</Label>
            <Textarea id="service-description" {...register("description")} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="service-status">Statut</Label>
            <Select id="service-status" {...register("status")}>
              {Object.values(ServiceStatus).map((value) => (
                <option key={value} value={value}>
                  {SERVICE_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="service-form">Formulaire de qualification</Label>
            <Select id="service-form" {...register("qualificationFormId")}>
              <option value={NONE}>Aucun</option>
              {publishedForms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.name}
                </option>
              ))}
            </Select>
          </div>

          {serverError && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={updateService.isPending || !isDirty}>
              {updateService.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
