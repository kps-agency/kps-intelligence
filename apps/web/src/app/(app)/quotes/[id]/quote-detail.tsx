"use client";

import { DocumentEntityType, QuoteStatus, type QuoteResponse } from "@kps/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@kps/ui";
import { Check, Download, PencilLine, Send, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DocumentsCard } from "@/components/documents-card";
import { TimelineCard } from "@/components/timeline-card";
import { ApiError, apiDownload } from "@/lib/api-client";
import {
  useAcceptQuote,
  useQuote,
  useQuoteTimeline,
  useRejectQuote,
  useReviseQuote,
  useSendQuote,
} from "@/lib/queries/quotes";
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_VARIANT, formatQuoteAmount } from "@/lib/quote-display";
import { QuoteEditor } from "./quote-editor";
import { QuoteTotalsTable } from "./quote-totals-table";

const dateFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium" });
const dateTimeFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium", timeStyle: "short" });
const numberFormatter = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 2 });

function usePdfDownload() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function download(path: string, filename: string) {
    setError(null);
    setPending(true);
    try {
      await apiDownload(path, filename);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Téléchargement impossible.");
    } finally {
      setPending(false);
    }
  }
  return { download, error, pending };
}

function SendDialog({ quote, open, onClose }: { quote: QuoteResponse; open: boolean; onClose: () => void }) {
  const send = useSendQuote(quote.id);
  const [to, setTo] = useState(quote.suggestedRecipient ?? "");
  const [message, setMessage] = useState("");
  const error = send.error instanceof ApiError ? send.error : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          send.reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Envoyer le devis</DialogTitle>
          <DialogDescription>
            {quote.reference} — {formatQuoteAmount(quote.total, quote.currency)} TTC. Le PDF part en pièce jointe ; le
            devis ne sera plus modifiable sans révision.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            send.mutate({ to: to.trim(), message: message.trim() || null }, { onSuccess: onClose });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="send-to">Destinataire</Label>
            <Input
              id="send-to"
              type="email"
              required
              autoComplete="off"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="send-message">Message personnel (facultatif)</Label>
            <Textarea
              id="send-message"
              rows={4}
              maxLength={2000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={send.isPending || to.trim() === ""}>
              <Send aria-hidden="true" />
              {send.isPending ? "Envoi..." : "Envoyer au client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ quote, open, onClose }: { quote: QuoteResponse; open: boolean; onClose: () => void }) {
  const reject = useRejectQuote(quote.id);
  const [reason, setReason] = useState("");
  const error = reject.error instanceof ApiError ? reject.error : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Devis refusé par le client</DialogTitle>
          <DialogDescription>
            {quote.reference} sera marqué comme refusé et l&apos;opportunité passera en négociation.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            reject.mutate({ reason: reason.trim() || null }, { onSuccess: onClose });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="reject-reason">Motif (facultatif)</Label>
            <Textarea
              id="reject-reason"
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="destructive" disabled={reject.isPending}>
              Enregistrer le refus
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReadOnlyContent({ quote }: { quote: QuoteResponse }) {
  return (
    <div className="grid gap-5 text-sm">
      {quote.items.length === 0 ? (
        <p className="text-muted-foreground">Ce devis n&apos;a aucune ligne.</p>
      ) : (
        <Table aria-label="Lignes du devis">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Désignation</TableHead>
              <TableHead className="text-right">Qté</TableHead>
              <TableHead className="text-right">Prix unitaire</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Remise</TableHead>
              <TableHead className="text-right">Montant</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quote.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="whitespace-pre-wrap break-words">{item.description}</TableCell>
                <TableCell className="text-right">{numberFormatter.format(item.quantity)}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {formatQuoteAmount(item.unitPrice, quote.currency)}
                </TableCell>
                <TableCell className="hidden text-right sm:table-cell">
                  {item.discountPercent > 0 ? `${numberFormatter.format(item.discountPercent)} %` : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {formatQuoteAmount(item.total, quote.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          {quote.notes && (
            <>
              <p className="text-muted-foreground">Remarques</p>
              <p className="whitespace-pre-wrap">{quote.notes}</p>
            </>
          )}
        </div>
        <QuoteTotalsTable
          caption="Totaux"
          currency={quote.currency}
          discountPercent={quote.discountPercent}
          taxRate={quote.taxRate}
          totals={quote}
        />
      </div>
    </div>
  );
}

export function QuoteDetail({ quoteId, canManage }: { quoteId: string; canManage: boolean }) {
  const quote = useQuote(quoteId);
  const timeline = useQuoteTimeline(quoteId);
  const revise = useReviseQuote(quoteId);
  const accept = useAcceptQuote(quoteId);
  const pdf = usePdfDownload();
  const [dirty, setDirty] = useState(false);
  const [sending, setSending] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  if (quote.isPending) {
    return (
      <div role="status" aria-label="Chargement du devis" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (quote.isError) {
    const notFound = quote.error instanceof ApiError && quote.error.statusCode === 404;
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-2 pt-6 text-sm">
          <p role="alert" className="text-destructive">
            {notFound ? "Ce devis n'existe pas." : `Erreur : ${quote.error.message}`}
          </p>
          <Link href="/quotes" className="text-primary underline-offset-4 hover:underline">
            Retour à la liste des devis
          </Link>
        </CardContent>
      </Card>
    );
  }

  const data = quote.data;
  const isDraft = data.status === QuoteStatus.DRAFT;
  const awaitingAnswer = data.status === QuoteStatus.SENT || data.status === QuoteStatus.EXPIRED;
  const canRevise = awaitingAnswer || data.status === QuoteStatus.REJECTED;
  const actionError = [revise.error, accept.error].find((e) => e instanceof ApiError) as ApiError | undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/quotes" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Devis
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{data.reference}</h1>
          <Badge variant={QUOTE_STATUS_VARIANT[data.status]}>{QUOTE_STATUS_LABELS[data.status]}</Badge>
        </div>
        <p className="break-words text-muted-foreground">{data.title}</p>
        <p className="text-sm">
          <Link href={`/clients/${data.clientId}`} className="text-primary underline-offset-4 hover:underline">
            {data.clientCompanyName}
          </Link>
          {" · "}
          <Link
            href={`/opportunities/${data.opportunityId}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            Opportunité
          </Link>
          {data.requestId && (
            <>
              {" · "}
              <Link href={`/requests/${data.requestId}`} className="text-primary underline-offset-4 hover:underline">
                Demande d&apos;origine
              </Link>
            </>
          )}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 text-sm">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={pdf.pending}
              onClick={() => pdf.download(`/quotes/${data.id}/pdf`, `${data.reference}.pdf`)}
            >
              <Download aria-hidden="true" />
              {isDraft ? "Aperçu PDF" : "Télécharger le PDF"}
            </Button>
            {canManage && isDraft && (
              <Button disabled={dirty || data.items.length === 0} onClick={() => setSending(true)}>
                <Send aria-hidden="true" />
                Envoyer au client
              </Button>
            )}
            {canManage && awaitingAnswer && (
              <>
                <Button disabled={accept.isPending} onClick={() => accept.mutate()}>
                  <Check aria-hidden="true" />
                  Accepté par le client
                </Button>
                <Button variant="outline" onClick={() => setRejecting(true)}>
                  <X aria-hidden="true" />
                  Refusé par le client
                </Button>
              </>
            )}
            {canManage && canRevise && (
              <Button variant="outline" disabled={revise.isPending} onClick={() => revise.mutate()}>
                <PencilLine aria-hidden="true" />
                Réviser (nouvelle version)
              </Button>
            )}
          </div>
          {canManage && isDraft && (dirty || data.items.length === 0) && (
            <p className="text-muted-foreground">
              {dirty
                ? "Enregistrez le brouillon avant de l'envoyer."
                : "Ajoutez au moins une ligne pour pouvoir envoyer le devis."}
            </p>
          )}
          {data.sentAt && !isDraft && (
            <p className="text-muted-foreground">
              Envoyé le {dateTimeFormatter.format(new Date(data.sentAt))} à {data.sentTo}
              {data.validUntil && ` — valable jusqu'au ${dateFormatter.format(new Date(data.validUntil))}`}
              {data.acceptedAt && ` — accepté le ${dateTimeFormatter.format(new Date(data.acceptedAt))}`}
              {data.rejectedAt && ` — refusé le ${dateTimeFormatter.format(new Date(data.rejectedAt))}`}
              {data.rejectionReason && ` (${data.rejectionReason})`}
            </p>
          )}
          {(pdf.error || actionError) && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">
              {pdf.error ?? actionError?.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Contenu</CardTitle>
        </CardHeader>
        <CardContent>
          {canManage && isDraft ? <QuoteEditor quote={data} onDirtyChange={setDirty} /> : <ReadOnlyContent quote={data} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Versions envoyées</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {data.versions.length === 0 ? (
            <p className="text-muted-foreground">Ce devis n&apos;a pas encore été envoyé.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.versions.map((version) => (
                <li key={version.version} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">Version {version.version}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {formatQuoteAmount(version.total, version.currency)} TTC, envoyée le{" "}
                      {dateTimeFormatter.format(new Date(version.createdAt))}
                      {version.sentTo && ` à ${version.sentTo}`}
                      {version.createdByName && ` par ${version.createdByName}`}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pdf.pending}
                    onClick={() =>
                      pdf.download(
                        `/quotes/${data.id}/versions/${version.version}/pdf`,
                        `${data.reference}-v${version.version}.pdf`,
                      )
                    }
                  >
                    <Download aria-hidden="true" />
                    PDF <span className="sr-only">de la version {version.version}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <DocumentsCard entityType={DocumentEntityType.QUOTE} entityId={data.id} />
      <TimelineCard timeline={timeline} />

      {sending && <SendDialog quote={data} open onClose={() => setSending(false)} />}
      {rejecting && <RejectDialog quote={data} open onClose={() => setRejecting(false)} />}
    </div>
  );
}
