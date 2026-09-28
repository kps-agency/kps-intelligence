"use client";

import { PRIORITY_LABELS } from "@kps/shared";
import { PriorityLevel, type NotificationResponse } from "@kps/types";
import { Badge, Button, Card, CardContent, Input, Select, Skeleton, cn } from "@kps/ui";
import { CheckCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PaginationControls } from "@/components/pagination-controls";
import { ApiError } from "@/lib/api-client";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type ListNotificationsParams,
} from "@/lib/queries/notifications";
import { PRIORITY_VARIANT } from "@/lib/request-display";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { NotificationPreferencesDialog } from "./notification-preferences-dialog";

const LIMIT = 20;
const dateTimeFormatter = new Intl.DateTimeFormat("fr-CH", {
  dateStyle: "medium",
  timeStyle: "short",
});

const TABS: { value: ListNotificationsParams["status"]; label: string }[] = [
  { value: "unread", label: "Non lues" },
  { value: "read", label: "Lues" },
  { value: "all", label: "Toutes" },
];

function NotificationItem({ notification }: { notification: NotificationResponse }) {
  const markRead = useMarkNotificationRead();

  const content = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {!notification.isRead && (
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" />
        )}
        <p className={cn("text-sm", notification.isRead ? "font-normal" : "font-semibold")}>
          {notification.title}
          {!notification.isRead && <span className="sr-only"> (non lue)</span>}
        </p>
        {notification.priority !== "MEDIUM" && (
          <Badge variant={PRIORITY_VARIANT[notification.priority]}>
            {PRIORITY_LABELS[notification.priority]}
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{notification.body}</p>
      <p className="text-xs text-muted-foreground">
        <time dateTime={notification.createdAt}>
          {dateTimeFormatter.format(new Date(notification.createdAt))}
        </time>
      </p>
    </>
  );

  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        {notification.link ? (
          // Ouvrir la ressource la marque comme lue.
          <Link
            href={notification.link}
            onClick={() => {
              if (!notification.isRead) markRead.mutate(notification.id);
            }}
            className="flex flex-col gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_p:first-of-type]:hover:underline"
          >
            {content}
          </Link>
        ) : (
          content
        )}
      </div>
      {!notification.isRead && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          disabled={markRead.isPending}
          onClick={() => markRead.mutate(notification.id)}
        >
          Marquer comme lue
        </Button>
      )}
    </li>
  );
}

export function NotificationsCenter() {
  const [status, setStatus] = useState<ListNotificationsParams["status"]>("unread");
  const [priority, setPriority] = useState<PriorityLevel | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput);

  const notifications = useNotifications({
    page,
    limit: LIMIT,
    status,
    priority: priority || undefined,
    search: search || undefined,
  });
  const markAll = useMarkAllNotificationsRead();
  const markAllError = markAll.error instanceof ApiError ? markAll.error : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label="Filtrer par état" className="flex gap-1 rounded-md bg-muted p-1">
            {TABS.map((tab) => (
              <Button
                key={tab.value}
                type="button"
                size="sm"
                variant={status === tab.value ? "default" : "ghost"}
                aria-pressed={status === tab.value}
                onClick={() => {
                  setStatus(tab.value);
                  setPage(1);
                }}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="search"
              placeholder="Rechercher..."
              aria-label="Rechercher une notification"
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setPage(1);
              }}
              className="sm:w-56"
            />
            <Select
              aria-label="Filtrer par priorité"
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value as PriorityLevel | "");
                setPage(1);
              }}
              className="sm:w-44"
            >
              <option value="">Toutes priorités</option>
              {Object.values(PriorityLevel).map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <CheckCheck aria-hidden="true" />
              Tout marquer comme lu
            </Button>
            <NotificationPreferencesDialog />
          </div>
        </div>

        {markAllError && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {markAllError.message}
          </p>
        )}

        {notifications.isPending && (
          <div role="status" aria-label="Chargement des notifications" className="flex flex-col gap-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {notifications.isError && (
          <p role="alert" className="text-sm text-destructive">
            Impossible de charger les notifications.
          </p>
        )}

        {notifications.data && notifications.data.data.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {status === "unread" ? "Aucune notification non lue." : "Aucune notification."}
          </p>
        )}

        {notifications.data && notifications.data.data.length > 0 && (
          <>
            <ul className="flex flex-col divide-y">
              {notifications.data.data.map((notification) => (
                <NotificationItem key={notification.id} notification={notification} />
              ))}
            </ul>
            <PaginationControls meta={notifications.data.meta} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
