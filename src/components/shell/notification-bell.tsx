"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellIcon, CheckCheckIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { markNotificationsReadAction } from "@/actions/tasks";
import { fmtRelative } from "@/lib/format";
import { EmptyState } from "@/components/app/empty-state";

export type NotificationRow = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: Date | null; createdAt: Date };

export function NotificationBell({ rows, unread }: { rows: NotificationRow[]; unread: number }) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const router = useRouter();

  const markAll = () =>
    start(async () => {
      await markNotificationsReadAction({});
      router.refresh();
    });
  const openOne = (n: NotificationRow) =>
    start(async () => {
      if (!n.readAt) await markNotificationsReadAction({ ids: [n.id] });
      setOpen(false);
      if (n.link) router.push(n.link);
      else router.refresh();
    });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
          <BellIcon />
          {unread > 0 ? <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{unread > 9 ? "9+" : unread}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="xs" onClick={markAll} disabled={pending || unread === 0}>
              <CheckCheckIcon data-icon="inline-start" />
              Mark all read
            </Button>
            <Button variant="ghost" size="xs" asChild>
              <Link href="/profile#notifications" onClick={() => setOpen(false)}>
                Preferences
              </Link>
            </Button>
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {rows.length === 0 ? (
            <EmptyState compact icon={BellIcon} title="You're all caught up" description="Task assignments, failed messages and approvals show up here." className="rounded-none border-0" />
          ) : (
            <ul className="divide-y">
              {rows.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => openOne(n)} className={cn("flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-muted", !n.readAt && "bg-primary-soft/40")}>
                    <span className="flex w-full items-center gap-2">
                      {!n.readAt ? <span className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
                      <span className="truncate text-sm font-medium">{n.title}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{fmtRelative(n.createdAt)}</span>
                    </span>
                    {n.body ? <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
