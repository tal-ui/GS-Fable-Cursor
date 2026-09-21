"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ShieldCheckIcon, UserPlusIcon, UserSquare2Icon } from "lucide-react";
import { cn } from "cn";
import { inviteUserAction, updateUserAction } from "@/actions/admin";
import { ConfirmButton } from "@/components/app/confirm-button";
import { EmptyState } from "@/components/app/empty-state";
import { Form, FormRow, SelectField, SubmitButton, SwitchField, TextField, useZodForm } from "@/components/app/form";
import { KpiCard } from "@/components/app/kpi-card";
import { SlideOver } from "@/components/app/slide-over";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { useQueryFlag } from "@/components/app/use-query-flag";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { inviteUserSchema } from "@/lib/schemas/admin";
import { fmtRelative, initials } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/viewer";

type Role = "super_admin" | "standard" | "read_only";
type Status = "pending" | "active" | "deactivated";
type Row = { id: string; name: string; email: string; avatarUrl: string | null; role: Role; status: Status; canVerify: boolean; jobTitle: string | null; lastLoginAt: Date | null; activatedAt: Date | null; createdAt: Date; hasGoogle: boolean };

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "super_admin", label: "Super Admin", hint: "Everything, including Setup" },
  { value: "standard", label: "Standard", hint: "Create and edit records in scope" },
  { value: "read_only", label: "Read Only", hint: "View only, no export" },
];

export function UsersView({ rows, currentUserId, initialStatus, openInvite }: { rows: Row[]; currentUserId: string; initialStatus: string; openInvite: boolean }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"all" | Status>((["pending", "active", "deactivated"] as string[]).includes(initialStatus) ? (initialStatus as Status) : "all");
  const [q, setQ] = React.useState("");
  const [inviteOpen, setInviteOpen] = useQueryFlag("new", openInvite);
  const update = useAction(updateUserAction, { successMessage: "User updated", onSuccess: () => router.refresh() });

  const counts = { pending: rows.filter((r) => r.status === "pending").length, active: rows.filter((r) => r.status === "active").length, deactivated: rows.filter((r) => r.status === "deactivated").length };
  const admins = rows.filter((r) => r.role === "super_admin" && r.status === "active").length;
  const verifiers = rows.filter((r) => r.canVerify && r.status === "active").length;

  const visible = rows
    .filter((r) => tab === "all" || r.status === tab)
    .filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.email.toLowerCase().includes(q.toLowerCase()) || (r.jobTitle ?? "").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.status === "pending" ? -1 : b.status === "pending" ? 1 : a.name.localeCompare(b.name)));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Pending activation" value={counts.pending} hint={counts.pending ? "Signed in with Google, waiting for you" : "Nobody waiting"} icon={UserSquare2Icon} />
        <KpiCard label="Active users" value={counts.active} hint={`${counts.deactivated} deactivated`} />
        <KpiCard label="Super Admins" value={admins} hint={admins <= 1 ? "Keep at least one — the last one cannot be demoted" : "Full access to Setup"} icon={ShieldCheckIcon} />
        <KpiCard label="Verifiers" value={verifiers} hint="Can mark skill claims verified" />
      </div>

      <div className="surface">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, title…" className="h-9 w-64" />
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
              <TabsTrigger value="pending">Pending {counts.pending ? `(${counts.pending})` : ""}</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="deactivated">Deactivated</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button className="ml-auto" size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlusIcon data-icon="inline-start" />
            Pre-provision user
          </Button>
        </div>

        {counts.pending > 0 && (tab === "all" || tab === "pending") ? (
          <div className="flex flex-wrap items-center gap-2 border-b bg-warning-soft/40 px-4 py-2.5 text-sm">
            <CheckIcon className="size-4 shrink-0 text-warning-foreground" />
            <span>
              <strong>{counts.pending === 1 ? "1 person is" : `${counts.pending} people are`} waiting for activation.</strong> Pending users cannot open the app yet: pick their role in the row, then press <em>Activate</em> in the Actions column.
            </span>
          </div>
        ) : null}

        {visible.length === 0 ? (
          <EmptyState icon={UserSquare2Icon} title={tab === "pending" ? "No one is waiting" : "No users match"} description={tab === "pending" ? "When a colleague signs in with Google for the first time they appear here until you activate them." : "Try another search or tab."} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Verifier</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead className="w-44 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((u) => {
                const isSelf = u.id === currentUserId;
                const busy = update.pending;
                return (
                  <TableRow key={u.id} className={cn(u.status === "pending" && "bg-warning-soft/30", u.status === "deactivated" && "opacity-60")}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt={u.name} /> : null}
                          <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary">{initials(u.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                            {u.name}
                            {isSelf ? <span className="rounded bg-muted px-1 text-[10px] font-medium uppercase text-muted-foreground">You</span> : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {u.email}
                            {u.jobTitle ? ` · ${u.jobTitle}` : ""}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <StatusBadge value={u.status} />
                        {u.status === "pending" ? <span className="text-[11px] text-muted-foreground">Signed in {fmtRelative(u.createdAt)}</span> : null}
                        {!u.hasGoogle && u.status !== "pending" ? <span className="text-[11px] text-muted-foreground">Pre-provisioned, not signed in yet</span> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select value={u.role} disabled={busy || u.status === "deactivated"} onValueChange={(role) => update.run({ id: u.id, role: role as Role })}>
                        <SelectTrigger className="h-8 w-40" aria-label={`Role for ${u.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              <span className="flex flex-col">
                                <span>{o.label}</span>
                                <span className="text-xs text-muted-foreground">{o.hint}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Switch checked={u.canVerify} disabled={busy || u.status === "deactivated"} onCheckedChange={(canVerify) => update.run({ id: u.id, canVerify })} aria-label={`Verifier rights for ${u.name}`} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Verifiers may accept evidence and mark skill claims verified.</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.lastLoginAt ? fmtRelative(u.lastLoginAt) : "Never"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        {u.status === "pending" ? (
                          <Button size="sm" disabled={busy} onClick={() => update.run({ id: u.id, status: "active", role: u.role })}>
                            <CheckIcon data-icon="inline-start" />
                            Activate as {ROLE_LABEL[u.role]}
                          </Button>
                        ) : null}
                        {u.status === "deactivated" ? (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => update.run({ id: u.id, status: "active" })}>
                            Reactivate
                          </Button>
                        ) : null}
                        {u.status === "active" && !isSelf ? (
                          <ConfirmButton
                            title={`Deactivate ${u.name}?`}
                            description="They are signed out immediately and cannot sign in again until reactivated. Records they own stay in place."
                            confirmLabel="Deactivate"
                            variant="ghost"
                            size="sm"
                            destructive
                            pending={busy}
                            onConfirm={() => update.run({ id: u.id, status: "deactivated" })}
                          >
                            Deactivate
                          </ConfirmButton>
                        ) : null}
                        {u.status === "pending" ? (
                          <ConfirmButton title={`Reject ${u.name}?`} description="Their account is marked deactivated. They can be reactivated later." confirmLabel="Reject" variant="ghost" size="sm" destructive pending={busy} onConfirm={() => update.run({ id: u.id, status: "deactivated" })}>
                            Reject
                          </ConfirmButton>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <InviteSheet open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  );
}

function InviteSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const form = useZodForm(inviteUserSchema, { email: "", name: "", role: "standard", canVerify: false, jobTitle: "" });
  const { run, pending, fieldErrors } = useAction(inviteUserAction, {
    successMessage: "User pre-provisioned — their first Google sign-in lands active with this role",
    onSuccess: () => {
      onOpenChange(false);
      form.reset();
      router.refresh();
    },
  });
  return (
    <SlideOver open={open} onOpenChange={onOpenChange} title="Pre-provision a user" description="Creates the account ahead of time so the colleague skips the Pending step. They still sign in with Google — no password is created." size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <TextField name="email" label="Work email" type="email" placeholder="name@company.com" hint="Must match the Google account they will sign in with." required autoFocus />
        <TextField name="name" label="Full name" placeholder="e.g. Dana Levi" required />
        <FormRow>
          <SelectField name="role" label="Role" options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} required />
          <TextField name="jobTitle" label="Job title" placeholder="e.g. Recruiter" />
        </FormRow>
        <SwitchField name="canVerify" label="Verifier" description="May accept evidence and mark skill claims verified." />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Create user</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}
