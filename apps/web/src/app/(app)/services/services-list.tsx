"use client";

import { SERVICE_STATUS_LABELS } from "@kps/shared";
import {
  Badge,
  Button,
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
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useServices } from "@/lib/queries/services";
import { SERVICE_STATUS_VARIANT } from "@/lib/service-display";
import { EditServiceDialog } from "./edit-service-dialog";

export function ServicesList({ canManage }: { canManage: boolean }) {
  const services = useServices();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingService = services.data?.find((s) => s.id === editingId) ?? null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        {services.isPending && (
          <div role="status" aria-label="Chargement des services" className="flex flex-col gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        )}

        {services.isError && (
          <p role="alert" className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            Impossible de charger les services : {services.error.message}
          </p>
        )}

        {services.isSuccess && (
          <Table aria-label="Catalogue de services">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Service</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="hidden md:table-cell">Formulaire de qualification</TableHead>
                {canManage && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.data.map((service) => (
                <TableRow key={service.id}>
                  <TableCell>
                    <p className="font-medium">{service.name}</p>
                    {service.description && (
                      <p className="max-w-md truncate text-xs text-muted-foreground">
                        {service.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={SERVICE_STATUS_VARIANT[service.status]}>
                      {SERVICE_STATUS_LABELS[service.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {service.qualificationFormId ? (
                      <Link
                        href={`/forms/${service.qualificationFormId}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {service.qualificationFormName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Aucun</span>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Configurer ${service.name}`}
                        onClick={() => setEditingId(service.id)}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {editingService && (
        <EditServiceDialog service={editingService} onClose={() => setEditingId(null)} />
      )}
    </Card>
  );
}
