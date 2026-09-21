"use client";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumbs } from "./breadcrumbs";
import { GlobalSearch } from "./global-search";
import { NotificationBell, type NotificationRow } from "./notification-bell";
import { UserMenu } from "./user-menu";

export function Topbar({ notifications, unread }: { notifications: NotificationRow[]; unread: number }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-5!" />
      <div className="min-w-0 flex-1 overflow-hidden">
        <Breadcrumbs />
      </div>
      <div className="flex items-center gap-1.5">
        <GlobalSearch />
        <NotificationBell rows={notifications} unread={unread} />
        <UserMenu />
      </div>
    </header>
  );
}
