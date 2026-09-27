"use client";

import { REQUEST_STATUS_LABELS } from "@kps/shared";
import { RequestStatus } from "@kps/types";
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
import { ApiError } from "@/lib/api-client";
import { useRequests } from "@/lib/queries/requests";
import { REQUEST_STATUS_VARIANT } from "@/lib/request-display";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { CreateRequestDialog } from "./create-request-dialog";

const LIMIT = 20;
const dateTimeFormatter = new Intl.DateTimeFormat("fr-CH", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function RequestsList({ canManage }: { canManage: boolean }) {
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<RequestStatus | "">("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput);

  const requests = useRequests({
    page,
    limit: LIMIT,
    search: search || undefined,
    status: status || undefined,
  });

  function handleSearchChange(value: string) {
    setSearchInput(value);
    setPage(1);
  }

  function handleStatusChange(value: RequestStatus | "") {
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
              placeholder="Rechercher une référence, un sujet..."
              aria-label="Rechercher une demande"
              value={searchInput}
              onChange={(event) => handleSearchChange(event.target.value)}
            />
            <Select
              aria-label="Filtrer par statut"
              value={status}
              onChange={(event) => handleStatusChange(event.target.value as RequestStatus | "")}
              className="sm:w-56"
            >
              <option value="">Tous les statuts</option>
              {Object.values(RequestStatus).map((value) => (
                <option key={value} value={value}>
                  {REQUEST_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          {canManage && <CreateRequestDialog />}
        </div>

        {requests.isPending && (
          <div role="status" aria-label="Chargement des demandes" className="flex flex-col gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        )}

        {requests.isError && (
          <p role="alert" className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            Impossible de charger les demandes : {requests.error.message}
            {requests.error instanceof ApiError && requests.error.requestId && (
              <span className="mt-1 block text-xs">
                Référence : {requests.error.requestId}
              </span>
            )}
          </p>
        )}

        {requests.isSuccess && requests.data.data.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {search || status
              ? "Aucune demande ne correspond à ces critères."
              : "Aucune demande pour l'instant."}
          </p>
        )}

        {requests.isSuccess && requests.data.data.length > 0 && (
          <>
            <Table aria-label="Liste des demandes">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Référence</TableHead>
                  <TableHead>Sujet</TableHead>
                  <TableHead className="hidden sm:table-cell">Client</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden md:table-cell">Reçue le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.data.data.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      <Link
                        href={`/requests/${req.id}`}
                        className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {req.reference}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-64 truncate">{req.subject}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {req.clientCompanyName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={REQUEST_STATUS_VARIANT[req.status]}>
                        {REQUEST_STATUS_LABELS[req.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                      {dateTimeFormatter.format(new Date(req.createdAt))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationControls meta={requests.data.meta} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
