"use client";

import { Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Skeleton } from "@kps/ui";
import { Download, Pencil, Plus, ShieldOff, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { useHasPermission } from "@/components/current-user-context";
import { ApiError } from "@/lib/api-client";
import {
  useAnonymizeContact,
  useContactsByClient,
  useDeleteContact,
  useExportContactData,
  useUpdateContact,
} from "@/lib/queries/contacts";
import { ContactFormDialog } from "./contact-form-dialog";

export function ContactsPanel({
  clientId,
  canManage,
}: {
  clientId: string;
  canManage: boolean;
}) {
  const contacts = useContactsByClient(clientId);
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  // RGPD : export et effacement, réservés aux administrateurs.
  const canManagePrivacy = useHasPermission("privacy.manage");
  const exportData = useExportContactData();
  const anonymize = useAnonymizeContact();
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const onError = (fallback: string) => (error: unknown) =>
    setNotice({ kind: "error", text: error instanceof ApiError ? error.message : fallback });

  function handleExport(id: string, fullName: string) {
    setNotice(null);
    const fileName = `donnees-personnelles-${fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    exportData.mutate({ id, fileName }, { onError: onError("Échec de l'export.") });
  }

  function handleAnonymize(id: string) {
    setNotice(null);
    anonymize.mutate(id, {
      onError: onError("Échec de l'anonymisation."),
      onSuccess: (result) =>
        setNotice({
          kind: "success",
          text: `Données personnelles effacées : ${result.erased.requests} demande(s), ${result.erased.messages} message(s), ${result.erased.formResponses} réponse(s) de formulaire, ${result.erased.documents} document(s).${
            result.filesRemaining > 0 ? ` ${result.filesRemaining} fichier(s) restent à purger du stockage.` : ""
          }`,
        }),
    });
  }

  function handleSetPrimary(id: string) {
    setNotice(null);
    updateContact.mutate(
      { id, request: { isPrimary: true } },
      {
        onError: (error) =>
          setNotice({
            kind: "error",
            text: error instanceof ApiError ? error.message : "Échec de l'opération.",
          }),
      },
    );
  }

  function handleDelete(id: string) {
    setNotice(null);
    deleteContact.mutate(id, {
      onError: (error) =>
        setNotice({
          kind: "error",
          text: error instanceof ApiError ? error.message : "Échec de la suppression.",
        }),
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <CardTitle as="h2">Contacts</CardTitle>
        {canManage && (
          <ContactFormDialog
            clientId={clientId}
            trigger={
              <Button variant="outline" size="sm">
                <Plus aria-hidden="true" />
                Ajouter
              </Button>
            }
          />
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {notice && (
          <p
            role={notice.kind === "error" ? "alert" : "status"}
            className={
              notice.kind === "error"
                ? "rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                : "rounded-md bg-success/10 p-3 text-sm text-success"
            }
          >
            {notice.text}
          </p>
        )}

        {contacts.isPending && (
          <div role="status" aria-label="Chargement des contacts" className="flex flex-col gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        )}

        {contacts.isError && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Impossible de charger les contacts : {contacts.error.message}
          </p>
        )}

        {contacts.isSuccess && contacts.data.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Aucun contact pour l&apos;instant.
          </p>
        )}

        {contacts.isSuccess &&
          contacts.data.map((contact) => {
            const fullName = `${contact.firstName} ${contact.lastName}`;
            return (
              <div
                key={contact.id}
                className="flex items-start gap-3 rounded-md border p-3"
              >
                <Avatar firstName={contact.firstName} lastName={contact.lastName} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{fullName}</p>
                    {contact.isPrimary && (
                      <Badge variant="secondary">
                        <Star className="size-3" aria-hidden="true" />
                        Principal
                      </Badge>
                    )}
                    {contact.anonymizedAt && <Badge variant="outline">Données effacées</Badge>}
                  </div>
                  {contact.position && (
                    <p className="text-sm text-muted-foreground">{contact.position}</p>
                  )}
                  {contact.email && (
                    <p className="break-all text-sm text-muted-foreground">{contact.email}</p>
                  )}
                  {contact.phone && (
                    <p className="text-sm text-muted-foreground">{contact.phone}</p>
                  )}
                </div>

                {canManagePrivacy && !contact.anonymizedAt && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Exporter les données personnelles de ${fullName}`}
                      disabled={exportData.isPending}
                      onClick={() => handleExport(contact.id, fullName)}
                    >
                      <Download aria-hidden="true" />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Effacer les données personnelles de ${fullName}`}
                        >
                          <ShieldOff aria-hidden="true" />
                        </Button>
                      }
                      title="Effacer les données personnelles ?"
                      description={`Le nom, les coordonnées, les messages, les réponses aux formulaires et les documents de ${fullName} seront définitivement effacés, ainsi que le contenu de ses demandes. Les demandes, opportunités, devis et missions sont conservés. Cette action est irréversible.`}
                      confirmLabel="Effacer définitivement"
                      isConfirming={anonymize.isPending}
                      onConfirm={() => handleAnonymize(contact.id)}
                    />
                  </div>
                )}

                {canManage && !contact.anonymizedAt && (
                  <div className="flex shrink-0 gap-1">
                    {!contact.isPrimary && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Définir ${fullName} comme contact principal`}
                        disabled={updateContact.isPending}
                        onClick={() => handleSetPrimary(contact.id)}
                      >
                        <Star aria-hidden="true" />
                      </Button>
                    )}
                    <ContactFormDialog
                      clientId={clientId}
                      contact={contact}
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Modifier ${fullName}`}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                      }
                    />
                    <ConfirmDialog
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Supprimer ${fullName}`}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      }
                      title="Supprimer ce contact ?"
                      description={`${fullName} sera définitivement retiré de ce client. Cette action est irréversible.`}
                      confirmLabel="Supprimer"
                      isConfirming={deleteContact.isPending}
                      onConfirm={() => handleDelete(contact.id)}
                    />
                  </div>
                )}
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
