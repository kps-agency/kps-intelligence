"use client";

import { QuoteStatus } from "@kps/types";
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
import { useQuotes } from "@/lib/queries/quotes";
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_VARIANT, formatQuoteAmount } from "@/lib/quote-display";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const LIMIT = 20;
const dateFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium" });

export function QuotesList() {
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<QuoteStatus | "">("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput);

  const quotes = useQuotes({ page, limit: LIMIT, search: search || undefined, status: status || undefined });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex flex-col gap-3 sm:max-w-md sm:flex-row">
          <Input
            type="search"
            placeholder="Rechercher une référence, un titre..."
            aria-label="Rechercher un devis"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPage(1);
            }}
          />
          <Select
            aria-label="Filtrer par statut"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as QuoteStatus | "");
              setPage(1);
            }}
            className="sm:w-48"
          >
            <option value="">Tous les statuts</option>
            {Object.values(QuoteStatus).map((value) => (
              <option key={value} value={value}>
                {QUOTE_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>

        {quotes.isPending && (
          <div role="status" aria-label="Chargement des devis" className="flex flex-col gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        )}
        {quotes.isError && (
          <p role="alert" className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            Impossible de charger les devis : {quotes.error.message}
          </p>
        )}
        {quotes.isSuccess && quotes.data.data.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {search || status ? "Aucun devis ne correspond à ces critères." : "Aucun devis pour l'instant."}
          </p>
        )}

        {quotes.isSuccess && quotes.data.data.length > 0 && (
          <>
            <Table aria-label="Liste des devis">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Référence</TableHead>
                  <TableHead>Titre</TableHead>
                  <TableHead className="hidden sm:table-cell">Client</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Total TTC</TableHead>
                  <TableHead className="hidden md:table-cell">Créé le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.data.data.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      <Link
                        href={`/quotes/${quote.id}`}
                        className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {quote.reference}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-64 truncate">{quote.title}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {quote.clientCompanyName}
                    </TableCell>
                    <TableCell>
                      <Badge variant={QUOTE_STATUS_VARIANT[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {formatQuoteAmount(quote.total, quote.currency)}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                      {dateFormatter.format(new Date(quote.createdAt))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationControls meta={quotes.data.meta} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
