"use client";

import { FORM_STATUS_LABELS } from "@kps/shared";
import {
  Badge,
  Card,
  CardContent,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kps/ui";
import Link from "next/link";
import { useForms } from "@/lib/queries/forms";
import { FORM_STATUS_VARIANT } from "@/lib/form-display";
import { CreateFormDialog } from "./create-form-dialog";

export function FormsList({ canManage }: { canManage: boolean }) {
  const forms = useForms();

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex justify-end">{canManage && <CreateFormDialog />}</div>

        {forms.isPending && (
          <div role="status" aria-label="Chargement des formulaires" className="flex flex-col gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        )}

        {forms.isError && (
          <p role="alert" className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            Impossible de charger les formulaires : {forms.error.message}
          </p>
        )}

        {forms.isSuccess && forms.data.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {"Aucun formulaire pour l'instant."}
          </p>
        )}

        {forms.isSuccess && forms.data.length > 0 && (
          <Table aria-label="Liste des formulaires">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nom</TableHead>
                <TableHead className="hidden sm:table-cell">Service</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="hidden md:table-cell">Étapes / Champs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.data.map((form) => (
                <TableRow key={form.id}>
                  <TableCell>
                    <Link
                      href={`/forms/${form.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {form.name}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {form.serviceName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={FORM_STATUS_VARIANT[form.status]}>
                      {FORM_STATUS_LABELS[form.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {form.stepCount} étape{form.stepCount > 1 ? "s" : ""} · {form.fieldCount} champ
                    {form.fieldCount > 1 ? "s" : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
