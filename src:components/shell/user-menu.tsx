"use client";

import Link from "next/link";
import { LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/app/status-badge";
import { initials } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/viewer";
import { useViewer } from "./viewer-context";

export function UserMenu() {
  const viewer = useViewer();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5">
          <Avatar className="size-7">
            {viewer.avatarUrl ? <AvatarImage src={viewer.avatarUrl} alt={viewer.name} /> : null}
            <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary">{initials(viewer.name)}</AvatarFallback>
          </Avatar>
          <span className="hidden flex-col items-start leading-tight lg:flex">
            <span className="text-sm font-medium">{viewer.name}</span>
            <StatusBadge value={viewer.role} label={ROLE_LABEL[viewer.role]} className="h-4 px-1.5 text-[10px]" />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="font-medium">{viewer.name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{viewer.email}</span>
          <span className="mt-1 flex items-center gap-1.5">
            <StatusBadge value={viewer.role} label={ROLE_LABEL[viewer.role]} />
            {viewer.canVerify ? <StatusBadge value="verified" label="Verifier" /> : null}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserIcon />
            My profile & notifications
          </Link>
        </DropdownMenuItem>
        {viewer.role === "super_admin" ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <SettingsIcon />
              Setup
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild variant="destructive">
          <form action="/api/auth/logout" method="post" className="contents">
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOutIcon />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
