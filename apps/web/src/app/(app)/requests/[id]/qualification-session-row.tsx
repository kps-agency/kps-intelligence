"use client";

import { QualificationSessionStatus, type QualificationSessionResponse } from "@kps/types";
import { Badge, Button, ConfirmDialog } from "@kps/ui";
import { Check, Copy, Minus, RefreshCw, Send, ShieldOff, Timer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  useExtendQualificationSession,
  useMarkQualificationSessionSent,
  useRegenerateQualificationSession,
  useRevokeQualificationSession,
} from "@/lib/queries/qualification-sessions";

const dateTimeFormatter = new Intl.DateTimeFormat("fr-CH", {
  dateStyle: "medium",
  timeStyle: "short",
});

const STATUS_LABELS: Record<QualificationSessionResponse["status"], string> = {
  CREATED: "Créé",
  SENT: "Envoyé",
  OPENED: "Ouvert",
  IN_PROGRESS: "En cours",
  COMPLETED: "Complété",
  EXPIRED: "Expiré",
  CANCELLED: "Révoqué",
};

const TERMINAL: QualificationSessionResponse["status"][] = [
  QualificationSessionStatus.COMPLETED,
  QualificationSessionStatus.CANCELLED,
  QualificationSessionStatus.EXPIRED,
];

// Coche/tiret : reprend telle quelle la maquette de suivi de la section 38
// (Envoyé ✓ / Ouvert ✓ / Commencé ✓ / Progression 72% / Complété —).
function Tick({ done }: { done: boolean }) {
  return done ? (
    <Check aria-label="fait" className="size-4 text-success" />
  ) : (
    <Minus aria-label="pas encore" className="size-4 text-muted-foreground" />
  );
}

export function QualificationSessionRow({
  requestId,
  session,
  formName,
  freshUrl,
  onRegenerated,
}: {
  requestId: string;
  session: QualificationSessionResponse;
  formName: string;
  // URL brute juste après création/régénération (jamais récupérable
  // ensuite — seul ce rendu-ci la connaît).
  freshUrl?: string;
  onRegenerated: (url: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const markSent = useMarkQualificationSessionSent(requestId, session.id);
  const revoke = useRevokeQualificationSession(requestId, session.id);
  const extend = useExtendQualificationSession(requestId, session.id);
  const regenerate = useRegenerateQualificationSession(requestId, session.id);

  const isTerminal = TERMINAL.includes(session.status);
  const anyActionPending =
    markSent.isPending || revoke.isPending || extend.isPending || regenerate.isPending;

  async function copyLink() {
    if (!freshUrl) return;
    await navigator.clipboard.writeText(freshUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{formName}</span>
          <Badge variant={isTerminal ? (session.status === "COMPLETED" ? "success" : "outline") : "secondary"}>
            {STATUS_LABELS[session.status]}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          Expire le {dateTimeFormatter.format(new Date(session.expiresAt))}
        </span>
      </div>

      {/* Suivi de la section 38 — une simple liste d'états, pas des
          définitions : <dl> exige que <dt>/<dd> soient ses enfants directs
          (règle d'accessibilité "definition-list"), ce que la mise en page
          en grille avec icône empêcherait. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
        <div className="flex items-center gap-1.5">
          <Tick done={!!session.sentAt} />
          <span className="text-muted-foreground">Envoyé</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Tick done={!!session.openedAt} />
          <span className="text-muted-foreground">Ouvert</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Tick done={!!session.startedAt} />
          <span className="text-muted-foreground">Commencé</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Progression</span>
          <span className="font-medium">{session.progressPercent}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Tick done={!!session.completedAt} />
          <span className="text-muted-foreground">Complété</span>
        </div>
      </div>

      {freshUrl && !isTerminal && (
        <div className="flex flex-col gap-1 rounded-md bg-secondary p-2">
          <p className="break-all font-mono text-xs">{freshUrl}</p>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={copyLink}>
              <Copy aria-hidden="true" />
              {copied ? "Copié !" : "Copier le lien"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Ce lien ne sera plus affiché — copiez-le maintenant.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {session.status === "CREATED" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={anyActionPending}
            onClick={() => markSent.mutate(undefined)}
          >
            <Send aria-hidden="true" />
            Marquer comme envoyé
          </Button>
        )}
        {!isTerminal && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={anyActionPending}
            onClick={() => extend.mutate(undefined)}
          >
            <Timer aria-hidden="true" />
            Prolonger de 30 jours
          </Button>
        )}
        {session.status !== "COMPLETED" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={anyActionPending}
            onClick={() =>
              regenerate.mutate(undefined, {
                onSuccess: (created) => onRegenerated(created.qualificationUrl),
              })
            }
          >
            <RefreshCw aria-hidden="true" />
            Régénérer le lien
          </Button>
        )}
        {!isTerminal && (
          <ConfirmDialog
            trigger={
              <Button type="button" size="sm" variant="outline" disabled={anyActionPending}>
                <ShieldOff aria-hidden="true" />
                Révoquer
              </Button>
            }
            title="Révoquer ce lien de qualification ?"
            description="Le prospect ne pourra plus l'utiliser. Cette action est irréversible (régénérez un nouveau lien si besoin)."
            isConfirming={revoke.isPending}
            onConfirm={() => revoke.mutate(undefined)}
          />
        )}
        <Link
          href={`/requests/${requestId}/qualification/${session.id}`}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Continuer en interne
        </Link>
      </div>
    </div>
  );
}
