"use client";

import { Badge, Card, CardContent, Input, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@kps/ui";
import { Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { PaginationControls } from "@/components/pagination-controls";
import { useContacts } from "@/lib/queries/contacts";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const LIMIT = 20;

export function ContactsList() {
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput);

  const contacts = useContacts({ page, limit: LIMIT, search: search || undefined });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <Input
          type="search"
          placeholder="Rechercher un prénom, un nom, un email..."
          aria-label="Rechercher un contact"
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            setPage(1);
          }}
          className="sm:max-w-md"
        />

        {contacts.isPending && (
          <div role="status" aria-label="Chargement des contacts" className="flex flex-col gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        )}

        {contacts.isError && (
          <p role="alert" className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            Impossible de charger les contacts : {contacts.error.message}
            {contacts.error instanceof ApiError && contacts.error.requestId && (
              <span className="mt-1 block text-xs">
                Référence : {contacts.error.requestId}
              </span>
            )}
          </p>
        )}

        {contacts.isSuccess && contacts.data.data.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {search ? "Aucun contact ne correspond à cette recherche." : "Aucun contact pour l'instant."}
          </p>
        )}

        {contacts.isSuccess && contacts.data.data.length > 0 && (
          <>
            <Table aria-label="Liste des contacts">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Contact</TableHead>
                  <TableHead>Société</TableHead>
                  <TableHead className="hidden md:table-cell">Coordonnées</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.data.data.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {contact.firstName} {contact.lastName}
                        </p>
                        {contact.isPrimary && (
                          <Star
                            className="size-3.5 text-muted-foreground"
                            aria-label="Contact principal"
                          />
                        )}
                      </div>
                      {contact.position && (
                        <p className="text-muted-foreground">{contact.position}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {contact.clientCompanyName ? (
                        <Link
                          href={`/clients/${contact.clientId}`}
                          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {contact.clientCompanyName}
                        </Link>
                      ) : (
                        <Badge variant="outline">Client supprimé</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {[contact.email, contact.phone].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationControls meta={contacts.data.meta} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
