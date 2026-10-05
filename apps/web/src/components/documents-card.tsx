"use client";

import { DOCUMENT_ALLOWED_TYPES, DOCUMENT_MAX_SIZE_BYTES } from "@kps/shared";
import type { DocumentEntityType, DocumentResponse } from "@kps/types";
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@kps/ui";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useHasPermission } from "@/components/current-user-context";
import { ApiError } from "@/lib/api-client";
import { useDeleteDocument, useDocuments, useDownloadDocument, useUploadDocument } from "@/lib/queries/documents";

const dateFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium" });
const ACCEPT = Object.values(DOCUMENT_ALLOWED_TYPES)
  .flat()
  .map((extension) => `.${extension}`)
  .join(",");
const MAX_MB = DOCUMENT_MAX_SIZE_BYTES / 1024 / 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

// Liste des documents d'un objet, avec dépôt, téléchargement (lien signé)
// et suppression. Utilisable seule (`DocumentsCard`) ou dans un dialogue.
export function DocumentsList({
  entityType,
  entityId,
  emptyLabel = "Aucun document pour l'instant.",
}: {
  entityType: DocumentEntityType;
  entityId: string;
  emptyLabel?: string;
}) {
  const canUpload = useHasPermission("documents.manage");
  const documents = useDocuments(entityType, entityId);
  const upload = useUploadDocument(entityType, entityId);
  const remove = useDeleteDocument(entityType, entityId);
  const download = useDownloadDocument();
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [localError, setLocalError] = useState<string | null>(null);

  const apiError = [upload.error, remove.error, download.error].find((e) => e instanceof ApiError) as
    | ApiError
    | undefined;
  const error = localError ?? apiError?.message ?? null;

  function handleFile(file: File | undefined) {
    setLocalError(null);
    upload.reset();
    if (!file) return;
    // Même limite que le serveur : évite d'envoyer 50 Mo pour rien.
    if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
      setLocalError(`Le fichier dépasse la taille maximale de ${MAX_MB} Mo.`);
    } else {
      upload.mutate(file);
    }
    if (input.current) input.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {documents.isPending && <Skeleton className="h-10" />}
      {documents.isError && (
        <p role="alert" className="text-destructive">
          Impossible de charger les documents.
        </p>
      )}
      {documents.data?.length === 0 && <p className="text-muted-foreground">{emptyLabel}</p>}
      {documents.data && documents.data.length > 0 && (
        <ul className="flex flex-col divide-y">
          {documents.data.map((document: DocumentResponse) => (
            <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="break-all font-medium">{document.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatSize(document.size)} · déposé le {dateFormatter.format(new Date(document.createdAt))}
                  {document.uploadedByName && ` par ${document.uploadedByName}`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={download.isPending}
                  onClick={() => download.mutate({ id: document.id, name: document.name })}
                >
                  <Download aria-hidden="true" />
                  Télécharger <span className="sr-only">{document.name}</span>
                </Button>
                {document.canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={remove.isPending}
                    aria-label={`Supprimer ${document.name}`}
                    onClick={() => remove.mutate(document.id)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">
          {error}
        </p>
      )}

      {canUpload && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          <Button type="button" variant="outline" size="sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
            <Upload aria-hidden="true" />
            {upload.isPending ? "Envoi..." : "Déposer un document"}
          </Button>
          <label htmlFor={inputId} className="text-xs text-muted-foreground">
            PDF, image, Word, Excel, PowerPoint, texte ou CSV — {MAX_MB} Mo au plus.
          </label>
        </div>
      )}
    </div>
  );
}

export function DocumentsCard({ entityType, entityId }: { entityType: DocumentEntityType; entityId: string }) {
  const canRead = useHasPermission("documents.read");
  if (!canRead) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Paperclip aria-hidden="true" className="size-4" />
          Documents
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DocumentsList entityType={entityType} entityId={entityId} />
      </CardContent>
    </Card>
  );
}
