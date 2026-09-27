"use client";

import { CLIENT_STATUS_LABELS } from "@kps/shared";
import { ClientStatus } from "@kps/types";
import {
  Badge,
  Card,
  CardContent,
  Input,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kps/ui";
import Link from "next/link";
import { useState } from "react";
import { PaginationControls } from "@/components/pagination-controls";
import { CLIENT_STATUS_VARIANT } from "@/lib/client-status-display";
import { ApiError } from "@/lib/api-client";
import { useClients } from "@/lib/queries/clients";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { CreateClientDialog } from "./create-client-dialog";

const LIMIT = 20;

export function ClientsList({ canManage }: { canManage: boolean }) {
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<ClientStatus | "">("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput);

  const clients = useClients({
    page,
    limit: LIMIT,
    search: search || undefined,
    status: status || undefined,
  });

  function handleSearchChange(value: string) {
    setSearchInput(value);
    setPage(1);
  }

  function handleStatusChange(value: ClientStatus | "") {
    setStatus(value);
    setPage(1);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:max-w-md sm:flex-row">
            <Input
              type="search"
              placeholder="Rechercher une société, un email, une ville..."
              aria-label="Rechercher un client"
              value={searchInput}
              onChange={(event) => handleSearchChange(event.target.value)}
            />
            <Select
              aria-label="Filtrer par statut"
              value={status}
              onChange={(event) => handleStatusChange(event.target.value as ClientStatus | "")}
              className="sm:w-48"
            >
              <option value="">Tous les statuts</option>
              {Object.values(ClientStatus).map((value) => (
                <option key={value} value={value}>
                  {CLIENT_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          {canManage && <CreateClientDialog />}
        </div>

        {clients.isPending && (
          <div role="status" aria-label="Chargement des clients" className="flex flex-col gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        )}

        {clients.isError && (
          <p role="alert" className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            Impossible de charger les clients : {clients.error.message}
            {clients.error instanceof ApiError && clients.error.requestId && (
              <span className="mt-1 block text-xs">
                Référence : {clients.error.requestId}
              </span>
            )}
          </p>
        )}

        {clients.isSuccess && clients.data.data.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {search || status
              ? "Aucun client ne correspond à ces critères."
              : "Aucun client pour l'instant."}
          </p>
        )}

        {clients.isSuccess && clients.data.data.length > 0 && (
          <>
            <Table aria-label="Liste des clients">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Société</TableHead>
                  <TableHead className="hidden sm:table-cell">Localisation</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden md:table-cell">Contacts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.data.data.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <Link
                        href={`/clients/${client.id}`}
                        className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {client.companyName}
                      </Link>
                      {client.email && (
                        <p className="text-muted-foreground">{client.email}</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {[client.city, client.country].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={CLIENT_STATUS_VARIANT[client.status]}>
                        {CLIENT_STATUS_LABELS[client.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {client.contactsCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationControls meta={clients.data.meta} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
