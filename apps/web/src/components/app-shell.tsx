"use client";

import type { CurrentUserResponse } from "@kps/types";
import { APP_NAME } from "@kps/shared";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@kps/ui";
import { Menu } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CurrentUserProvider } from "@/components/current-user-context";
import { NotificationBell } from "@/components/notification-bell";
import { SidebarNav } from "@/components/sidebar-nav";
import { UserMenu } from "@/components/user-menu";

function Brand() {
  return (
    <Link
      href="/dashboard"
      className="flex h-16 shrink-0 items-center border-b px-6 text-base font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {APP_NAME}
    </Link>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: CurrentUserResponse;
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <CurrentUserProvider user={user}>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Aller au contenu
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card md:flex">
        <Brand />
        <div className="min-h-0 flex-1">
          <SidebarNav />
        </div>
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="flex flex-col p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Menu principal de {APP_NAME}
          </SheetDescription>
          <Brand />
          <div className="min-h-0 flex-1">
            <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </SheetContent>

        <div className="md:pl-64">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card px-4 md:px-8">
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Ouvrir le menu de navigation"
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <div className="ml-auto flex items-center gap-2">
              <NotificationBell />
              <UserMenu />
            </div>
          </header>

          <main
            id="contenu"
            tabIndex={-1}
            className="mx-auto w-full max-w-6xl p-4 focus-visible:outline-none md:p-8"
          >
            {children}
          </main>
        </div>
      </Sheet>
    </CurrentUserProvider>
  );
}
