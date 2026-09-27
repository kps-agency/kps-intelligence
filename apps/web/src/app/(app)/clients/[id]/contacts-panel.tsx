"use client";

import { Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Skeleton } from "@kps/ui";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { useContactsByClient, useDeleteContact, useUpdateContact } from "@/lib/queries/contacts";
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
  const [notice, setNotice] = useState<{ kind: "error"; text: string } | null>(null);

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
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
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

                {canManage && (
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
