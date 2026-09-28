"use client";

import { cn } from "@kps/ui";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useUnreadNotificationsCount } from "@/lib/queries/notifications";

// En-tête (section 42) : « 🔔 12 », lien vers le centre de notifications.
export function NotificationBell() {
  const unread = useUnreadNotificationsCount();
  const count = unread.data?.count ?? 0;
  // Tant que le compteur n'est pas chargé, ne rien affirmer : « aucune non
  // lue » serait faux pendant le chargement.
  const label = !unread.data
    ? "Notifications"
    : count === 0
      ? "Notifications, aucune non lue"
      : `Notifications, ${count} non lue${count > 1 ? "s" : ""}`;

  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="relative inline-flex size-10 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Bell aria-hidden="true" className="size-5" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-white",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
