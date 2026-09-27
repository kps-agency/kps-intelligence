"use client";

import { ROLE_LABELS } from "@kps/shared";
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kps/ui";
import { ChevronDown, LogOut } from "lucide-react";
import { useCurrentUser } from "@/components/current-user-context";
import { useSignOut } from "@/lib/use-sign-out";

export function UserMenu() {
  const user = useCurrentUser();
  const signOut = useSignOut();
  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Menu utilisateur de ${fullName}`}
        className="flex items-center gap-2 rounded-md p-1 pr-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar firstName={user.firstName} lastName={user.lastName} />
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight">{fullName}</span>
          <span className="block text-xs leading-tight text-muted-foreground">
            {ROLE_LABELS[user.roleKey]}
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block">{fullName}</span>
          <span className="block text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden="true" />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
