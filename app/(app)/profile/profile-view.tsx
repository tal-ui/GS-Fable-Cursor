"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellIcon, BookmarkIcon, LaptopIcon, ShieldCheckIcon, SmartphoneIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteFilterAction, markNotificationsReadAction } from "@/actions/tasks";
import { revokeOtherSessionsAction, updateNotificationPrefsAction, updateProfileAction } from "@/actions/profile";
import { ConfirmButton } from "@/components/app/confirm-button";
import { DetailSection, FieldGrid, FieldRow, SidePanel } from "@/components/app/detail-layout";
import { EmptyState } from "@/components/app/empty-state";
import { InlineField } from "@/components/app/inline-field";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { NotificationPrefs } from "@/db/schema";
import { fmtDateTime, fmtRelative, humanize, initials } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/viewer";

type ProfileUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "super_admin" | "standard" | "read_only";
  canVerify: boolean;
  jobTitle: string | null;
  phone: string | null;
  notificationPrefs: NotificationPrefs;
  lastLoginAt: Date | null;
  activatedAt: Date | null;
  createdAt: Date;
};

type SessionRow = { id: string; ip: string | null; userAgent: string | null; createdAt: Date; lastActiveAt: Date; expiresAt: Date; isCurrent: boolean };
type FilterRow = { id: string; entity: string; name: string; isDefault: boolean; filters: Record<string, string> };
type NotificationRow = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: Date | null; createdAt: Date };

const PREF_COPY: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: "inApp", label: "In-app notifications", hint: "Master switch. When off, nothing lands in the bell — you still see tasks in the work queue." },
  { key: "taskReminders", label: "Task assignments and reminders", hint: "When a task is assigned or reassigned to you, or a due date is approaching." },
  { key: "messageFailures", label: "Failed outreach", hint: "When a WhatsApp or email message you own fails and needs manual follow-up." },
  { key: "email", label: "Email digest", hint: "Daily summary of overdue tasks and stalled submissions sent to your work address." },
];

const ROLE_SCOPE: Record<ProfileUser["role"], string> = {
  super_admin: "Full access to every record, the Setup area, users, automations, integrations and logs.",
  standard: "Create and edit candidates, accounts, requisitions, submissions and placements you own or that are shared with you.",
  read_only: "View dashboards and records in your scope. Create, edit, delete, bulk actions and CSV export are disabled.",
};

function describeAgent(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: "Unknown device", mobile: false };
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return { label: [browser, os].filter(Boolean).join(" on "), mobile };
}

export function ProfileView({ user, sessions, filters, notifications, unread }: { user: ProfileUser; sessions: SessionRow[]; filters: FilterRow[]; notifications: NotificationRow[]; unread: number }) {
  const router = useRouter();
  const [prefs, setPrefs] = React.useState(user.notificationPrefs);
  const updateProfile = useAction(updateProfileAction, { silent: true });
  const updatePrefs = useAction(updateNotificationPrefsAction, { silent: true });
  const revoke = useAction(revokeOtherSessionsAction, { successMessage: (d) => (d.count === 0 ? "No other sessions to sign out" : `Signed out ${d.count} other session${d.count === 1 ? "" : "s"}`), onSuccess: () => router.refresh() });
  const removeFilter = useAction(deleteFilterAction, { successMessage: "Saved view removed", onSuccess: () => router.refresh() });
  const markRead = useAction(markNotificationsReadAction, { successMessage: "All notifications marked read", onSuccess: () => router.refresh() });

  const togglePref = async (key: keyof NotificationPrefs, checked: boolean) => {
    const previous = prefs;
    setPrefs((p) => ({ ...p, [key]: checked }));
    const result = await updatePrefs.run({ [key]: checked });
    if (result?.ok) toast.success(checked ? "Notifications on" : "Muted");
    else {
      setPrefs(previous);
      toast.error(result?.error ?? "Could not update your preferences.");
    }
  };

  const others = sessions.filter((s) => !s.isCurrent).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <DetailSection title="Contact details" description="Your name, email and photo come from Google sign-in and update automatically on your next login.">
          <div className="mb-5 flex items-center gap-4">
            <Avatar className="size-14">
              {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name} /> : null}
              <AvatarFallback className="bg-primary-soft text-lg font-semibold text-primary">{initials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{user.name}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge value={user.role} label={ROLE_LABEL[user.role]} />
                {user.canVerify ? <StatusBadge value="verified" label="Verifier" /> : null}
              </div>
            </div>
          </div>
          <FieldGrid>
            <InlineField label="Job title" value={user.jobTitle} placeholder="e.g. Senior Recruiter" onSave={(v) => updateProfile.run({ jobTitle: v === null ? null : String(v) })} />
            <InlineField label="Phone" value={user.phone} placeholder="+1 555 0100" hint="Shown to teammates on records you own." onSave={(v) => updateProfile.run({ phone: v === null ? null : String(v) })} />
          </FieldGrid>
        </DetailSection>

        <DetailSection id="notifications" title="Notification preferences" description="Mute what you don't need. Muting never hides work from the queue — it only controls what reaches the bell and your inbox.">
          <ul className="divide-y">
            {PREF_COPY.map((p) => {
              const disabled = p.key !== "inApp" && p.key !== "email" && !prefs.inApp;
              return (
                <li key={p.key} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.hint}</p>
                  </div>
                  <Switch checked={prefs[p.key]} disabled={disabled || updatePrefs.pending} onCheckedChange={(c) => togglePref(p.key, c)} aria-label={p.label} />
                </li>
              );
            })}
          </ul>
        </DetailSection>

        <DetailSection
          title="Recent notifications"
          count={notifications.length}
          actions={
            <Button variant="ghost" size="xs" onClick={() => markRead.run({})} disabled={markRead.pending || unread === 0}>
              Mark all read
            </Button>
          }
        >
          {notifications.length === 0 ? (
            <EmptyState compact icon={BellIcon} title="No notifications yet" description="Task assignments, failed messages and approvals will appear here and in the bell." />
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li key={n.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-primary"}`} />
                  <div className="min-w-0 flex-1">
                    {n.link ? (
                      <Link href={n.link} className="text-sm font-medium hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium">{n.title}</p>
                    )}
                    {n.body ? <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtRelative(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>

        <DetailSection title="Saved views" count={filters.length} description="Filter presets you saved on list pages. Default views are applied when you open a list without filters.">
          {filters.length === 0 ? (
            <EmptyState compact icon={BookmarkIcon} title="No saved views" description="Open any list, set filters, then choose “Save view” to keep them here." action={<Button asChild variant="outline" size="sm"><Link href="/candidates">Go to candidates</Link></Button>} />
          ) : (
            <ul className="divide-y">
              {filters.map((f) => {
                const params = new URLSearchParams();
                for (const [k, v] of Object.entries(f.filters)) params.set(`f_${k}`, v);
                const href = `/${f.entity}?${params.toString()}`;
                return (
                  <li key={f.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <Link href={href} className="text-sm font-medium hover:underline">
                        {f.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {humanize(f.entity)} · {Object.entries(f.filters).map(([k, v]) => `${humanize(k)}: ${v}`).join(", ") || "No filters"}
                      </p>
                    </div>
                    {f.isDefault ? <StatusBadge value="active" label="Default" /> : null}
                    <ConfirmButton title="Remove saved view?" description={`“${f.name}” will be removed from your ${humanize(f.entity).toLowerCase()} list. This only affects you.`} confirmLabel="Remove" variant="ghost" size="icon-sm" destructive onConfirm={() => removeFilter.run({ id: f.id, entity: f.entity })}>
                      <Trash2Icon />
                    </ConfirmButton>
                  </li>
                );
              })}
            </ul>
          )}
        </DetailSection>
      </div>

      <aside className="flex min-w-0 flex-col gap-5">
        <SidePanel title="Access">
          <dl className="space-y-3">
            <FieldRow label="Role">
              <div className="flex items-center gap-1.5">
                <StatusBadge value={user.role} label={ROLE_LABEL[user.role]} />
                {user.canVerify ? <StatusBadge value="verified" label="Verifier" /> : null}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{ROLE_SCOPE[user.role]}</p>
            </FieldRow>
            <FieldRow label="Evidence verification">{user.canVerify ? "You can accept evidence and mark skill claims verified." : "Not a designated verifier. Ask a Super Admin if you should review evidence."}</FieldRow>
            <FieldRow label="Member since">{fmtDateTime(user.activatedAt ?? user.createdAt)}</FieldRow>
            <FieldRow label="Last sign-in">{user.lastLoginAt ? fmtRelative(user.lastLoginAt) : "—"}</FieldRow>
          </dl>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" />
            Sign-in is Google only. Role and status changes are made by a Super Admin in Setup and are recorded in the audit log.
          </p>
        </SidePanel>

        <SidePanel
          title="Active sessions"
          action={
            <ConfirmButton title="Sign out other sessions?" description={`This signs out ${others} other device${others === 1 ? "" : "s"}. You stay signed in here.`} confirmLabel="Sign out others" variant="outline" size="xs" onConfirm={() => revoke.run({})} pending={revoke.pending} disabled={others === 0}>
              Sign out others
            </ConfirmButton>
          }
        >
          <ul className="divide-y">
            {sessions.map((s) => {
              const agent = describeAgent(s.userAgent);
              const Icon = agent.mobile ? SmartphoneIcon : LaptopIcon;
              return (
                <li key={s.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{agent.label}</span>
                      {s.isCurrent ? <StatusBadge value="active" label="This device" className="h-4 px-1.5 text-[10px]" /> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.ip ?? "IP unknown"} · active {fmtRelative(s.lastActiveAt)} · expires {fmtRelative(s.expiresAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Sessions expire after 8 hours without activity.</p>
        </SidePanel>
      </aside>
    </div>
  );
}
