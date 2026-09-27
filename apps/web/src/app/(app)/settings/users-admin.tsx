"use client";

import { ROLE_LABELS } from "@kps/shared";
import { UserRole, type UserProfileResponse } from "@kps/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type BadgeProps,
} from "@kps/ui";
import { useState } from "react";
import { useCurrentUser } from "@/components/current-user-context";
import { ApiError } from "@/lib/api-client";
import { useUpdateUserRole, useUsers } from "@/lib/queries/users";
import { CreateUserDialog } from "./create-user-dialog";

const STATUS_DISPLAY: Record<
  UserProfileResponse["status"],
  { label: string; variant: BadgeProps["variant"] }
> = {
  ACTIVE: { label: "Actif", variant: "success" },
  INVITED: { label: "Invité", variant: "warning" },
  INACTIVE: { label: "Inactif", variant: "secondary" },
  SUSPENDED: { label: "Suspendu", variant: "destructive" },
};

const dateFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium" });

type Notice = { kind: "success" | "error"; text: string; requestId?: string | null };

export function UsersAdmin() {
  const currentUser = useCurrentUser();
  const canManage = currentUser.permissions.includes("users.manage");
  const isSuperAdmin = currentUser.roleKey === UserRole.SUPER_ADMIN;

  // Seul un SUPER_ADMIN peut attribuer le rôle SUPER_ADMIN (règle
  // appliquée par l'API ; l'interface n'en propose simplement pas plus).
  const assignableRoles = Object.values(UserRole).filter(
    (role) => isSuperAdmin || role !== UserRole.SUPER_ADMIN,
  );

  const users = useUsers();
  const updateRole = useUpdateUserRole();
  const [notice, setNotice] = useState<Notice | null>(null);

  function handleRoleChange(user: UserProfileResponse, roleKey: UserRole) {
    setNotice(null);
    updateRole.mutate(
      { id: user.id, roleKey },
      {
        onSuccess: () =>
          setNotice({
            kind: "success",
            text: `Rôle de ${user.firstName} ${user.lastName} : ${ROLE_LABELS[roleKey]}.`,
          }),
        onError: (error) =>
          setNotice({
            kind: "error",
            text: error.message,
            requestId: error instanceof ApiError ? error.requestId : null,
          }),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Utilisateurs</CardTitle>
          <CardDescription>
            Comptes ayant accès à la plateforme et leur rôle.
          </CardDescription>
        </div>
        {canManage && (
          <CreateUserDialog
            assignableRoles={assignableRoles}
            onCreated={(email) =>
              setNotice({
                kind: "success",
                text: `Utilisateur ${email} créé. Il peut définir son mot de passe via « Mot de passe oublié ».`,
              })
            }
          />
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div role="status" aria-live="polite">
          {notice?.kind === "success" && (
            <p className="rounded-md bg-success/10 p-3 text-sm text-success">
              {notice.text}
            </p>
          )}
        </div>
        {notice?.kind === "error" && (
          <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium">{notice.text}</p>
            {notice.requestId && (
              <p className="mt-1 text-xs">Référence : {notice.requestId}</p>
            )}
          </div>
        )}

        {users.isPending && (
          <div role="status" aria-label="Chargement des utilisateurs" className="flex flex-col gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        )}

        {users.isError && (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-medium">
              Impossible de charger les utilisateurs : {users.error.message}
            </p>
            {users.error instanceof ApiError && users.error.requestId && (
              <p className="text-xs">Référence : {users.error.requestId}</p>
            )}
            <Button variant="outline" size="sm" onClick={() => void users.refetch()}>
              Réessayer
            </Button>
          </div>
        )}

        {users.isSuccess && users.data.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun utilisateur.</p>
        )}

        {users.isSuccess && users.data.length > 0 && (
          <Table aria-label="Liste des utilisateurs">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Utilisateur</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead className="hidden md:table-cell">Statut</TableHead>
                <TableHead className="hidden md:table-cell">Créé le</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data.map((user) => {
                const fullName = `${user.firstName} ${user.lastName}`;
                const isSelf = user.id === currentUser.id;
                const targetIsProtected =
                  user.roleKey === UserRole.SUPER_ADMIN && !isSuperAdmin;
                const canEditRole = canManage && !isSelf && !targetIsProtected;
                const isUpdating =
                  updateRole.isPending && updateRole.variables?.id === user.id;
                const status = STATUS_DISPLAY[user.status];

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <p className="font-medium">
                        {fullName}
                        {isSelf && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (vous)
                          </span>
                        )}
                      </p>
                      <p className="break-all text-muted-foreground">
                        {user.email}
                      </p>
                      {/* Le statut a sa propre colonne dès `md` ; en dessous, on le
                          garde visible sous le nom plutôt que de le cacher. */}
                      <Badge variant={status.variant} className="mt-1 md:hidden">
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {canEditRole ? (
                        <Select
                          aria-label={`Rôle de ${fullName}`}
                          value={user.roleKey}
                          disabled={isUpdating}
                          onChange={(event) =>
                            handleRoleChange(user, event.target.value as UserRole)
                          }
                          className="h-9 min-w-36 md:min-w-48"
                        >
                          {assignableRoles.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        ROLE_LABELS[user.roleKey]
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                      {dateFormatter.format(new Date(user.createdAt))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

    </Card>
  );
}
