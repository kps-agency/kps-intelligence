"use client";

import { cn } from "@kps/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/components/current-user-context";
import { visibleNavGroups, type NavGroup } from "@/lib/navigation";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { permissions } = useCurrentUser();
  const groups = visibleNavGroups(permissions);
  const scrollingGroups = groups.filter((group) => !group.pinned);
  const pinnedGroups = groups.filter((group) => group.pinned);

  function renderGroup(group: NavGroup) {
    return (
      <div key={group.label}>
        <h2 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {group.label}
        </h2>
        <ul className="flex flex-col gap-0.5">
          {group.items.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            if (!item.available) {
              return (
                <li key={item.href}>
                  <span
                    aria-disabled="true"
                    title={`Disponible en phase ${item.phase}`}
                    className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-1.5 text-sm text-muted-foreground"
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                    <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">
                      Bientôt
                    </span>
                    <span className="sr-only">
                      (bientôt disponible, phase {item.phase})
                    </span>
                  </span>
                </li>
              );
            }

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-accent",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // Un seul landmark <nav> : la zone du haut défile, la zone épinglée
  // (Administration) reste toujours visible en bas.
  return (
    <nav
      aria-label="Navigation principale"
      className="flex h-full min-h-0 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
        {scrollingGroups.map(renderGroup)}
      </div>
      {pinnedGroups.length > 0 && (
        <div className="flex flex-col gap-5 border-t px-3 py-3">
          {pinnedGroups.map(renderGroup)}
        </div>
      )}
    </nav>
  );
}
