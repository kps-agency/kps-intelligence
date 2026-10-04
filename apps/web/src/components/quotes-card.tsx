"use client";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@kps/ui";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHasPermission } from "@/components/current-user-context";
import { ApiError } from "@/lib/api-client";
import { useCreateQuote, useQuotes } from "@/lib/queries/quotes";
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_VARIANT, formatQuoteAmount } from "@/lib/quote-display";

// Devis d'une opportunité (avec création) ou d'un client (section 49).
export function QuotesCard({
  opportunityId,
  clientId,
  canCreate = false,
}: {
  opportunityId?: string;
  clientId?: string;
  // Une opportunité sans client ne peut pas encore recevoir de devis.
  canCreate?: boolean;
}) {
  const router = useRouter();
  const canRead = useHasPermission("quotes.read");
  const canManage = useHasPermission("quotes.manage");
  const quotes = useQuotes({ page: 1, limit: 50, opportunityId, clientId }, canRead);
  const create = useCreateQuote();

  if (!canRead) return null;
  const error = create.error instanceof ApiError ? create.error : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <CardTitle as="h2" className="flex items-center gap-2">
          <FileText aria-hidden="true" className="size-4" />
          Devis
        </CardTitle>
        {opportunityId && canManage && canCreate && (
          <Button
            variant="outline"
            size="sm"
            disabled={create.isPending}
            onClick={() =>
              create.mutate({ opportunityId }, { onSuccess: (quote) => router.push(`/quotes/${quote.id}`) })
            }
            className="shrink-0"
          >
            <Plus aria-hidden="true" />
            {create.isPending ? "Création..." : "Créer un devis"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {quotes.isPending && <Skeleton className="h-5 w-2/3" />}
        {quotes.isError && (
          <p role="alert" className="text-destructive">
            Impossible de charger les devis.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">
            {error.message}
          </p>
        )}
        {opportunityId && canManage && !canCreate && (
          <p className="text-muted-foreground">
            Rattachez un client à l&apos;opportunité pour pouvoir créer un devis.
          </p>
        )}
        {quotes.data &&
          (quotes.data.data.length === 0 ? (
            <p className="text-muted-foreground">Aucun devis pour l&apos;instant.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {quotes.data.data.map((quote) => (
                <li key={quote.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link
                      href={`/quotes/${quote.id}`}
                      className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {quote.reference}
                    </Link>
                    <span className="break-words">{quote.title}</span>
                    <Badge variant={QUOTE_STATUS_VARIANT[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</Badge>
                  </span>
                  <span className="text-muted-foreground">
                    {formatQuoteAmount(quote.total, quote.currency)} TTC
                  </span>
                </li>
              ))}
            </ul>
          ))}
      </CardContent>
    </Card>
  );
}
