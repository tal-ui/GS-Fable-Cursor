"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangleIcon, ArchiveIcon, BriefcaseIcon, Building2Icon, CheckIcon, GitBranchIcon, HandshakeIcon, PlayIcon, RotateCcwIcon, UserRoundIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SlideOver } from "@/components/app/slide-over";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { FieldGrid, FieldRow } from "@/components/app/detail-layout";
import { useAction } from "@/components/app/use-action";
import { useNow } from "@/components/app/use-now";
import { useViewer } from "@/components/shell/viewer-context";
import { reassignTaskAction, updateTaskStatusAction } from "@/actions/tasks";
import type { TaskDetail } from "@/server/tasks";
import { fmtDateTime, fmtRelative, humanize } from "@/lib/format";

type Opt = { value: string; label: string };

/** Detail slide-over for a single task. Opened by `?task=<id>` so notifications can deep-link into it. */
export function TaskSheet({ task, missing, onClose, users }: { task: TaskDetail | null; missing: boolean; onClose: () => void; users: Opt[] }) {
  const viewer = useViewer();
  const canWrite = viewer.permissions.write;
  const open = Boolean(task) || missing;
  const status = useAction(updateTaskStatusAction, { successMessage: (d) => (d.status === "done" ? "Task completed" : d.status === "cancelled" ? "Task cancelled" : d.status === "open" ? "Task reopened" : "Task started") });
  const reassign = useAction(reassignTaskAction, { successMessage: "Task reassigned" });
  const now = useNow();

  if (!open) return null;
  if (!task) {
    return (
      <SlideOver open onOpenChange={(o) => !o && onClose()} title="Task not found" size="sm">
        <EmptyState icon={AlertTriangleIcon} title="This task is not available" description="It may have been removed, or it belongs to a record you cannot see." action={<Button variant="outline" onClick={onClose}>Back to the queue</Button>} />
      </SlideOver>
    );
  }

  const t = task.task;
  const overdue = Boolean(t.dueAt) && new Date(t.dueAt!).getTime() < now && (t.status === "open" || t.status === "in_progress");
  const isActive = t.status === "open" || t.status === "in_progress";

  return (
    <SlideOver
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn(t.status === "done" && "text-muted-foreground line-through")}>{t.title}</span>
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge value={t.status} />
          <StatusBadge value={t.priority} />
          <StatusBadge value={t.type} tone={t.type === "message_failed" ? "danger" : "neutral"} />
        </span>
      }
      footer={
        canWrite ? (
          <>
            {t.status === "open" ? (
              <Button variant="outline" size="sm" disabled={status.pending} onClick={() => status.run({ id: t.id, status: "in_progress" })}>
                <PlayIcon data-icon="inline-start" />
                Start
              </Button>
            ) : null}
            {isActive ? (
              <Button variant="outline" size="sm" disabled={status.pending} onClick={() => status.run({ id: t.id, status: "cancelled" })}>
                <XIcon data-icon="inline-start" />
                Cancel task
              </Button>
            ) : null}
            {isActive ? (
              <Button size="sm" disabled={status.pending} onClick={() => status.run({ id: t.id, status: "done" })}>
                <CheckIcon data-icon="inline-start" />
                Mark done
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={status.pending} onClick={() => status.run({ id: t.id, status: "open" })}>
                <RotateCcwIcon data-icon="inline-start" />
                Reopen
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        {overdue ? (
          <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-foreground">
            <AlertTriangleIcon className="size-4 shrink-0" />
            Overdue since {fmtDateTime(t.dueAt)} ({fmtRelative(t.dueAt)}).
          </div>
        ) : null}

        {t.description ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{t.description}</p> : <p className="text-sm text-muted-foreground">No further details were recorded for this task.</p>}

        <FieldGrid>
          <FieldRow label="Due">
            {t.dueAt ? (
              <span className={cn(overdue && "font-medium text-danger-foreground")}>
                {fmtDateTime(t.dueAt)} <span className="text-muted-foreground">· {fmtRelative(t.dueAt)}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">No due date</span>
            )}
          </FieldRow>
          <FieldRow label="Owner">
            {canWrite ? (
              <Select value={t.ownerId ?? "__none"} onValueChange={(v) => reassign.run({ id: t.id, ownerId: v === "__none" ? null : v })} disabled={reassign.pending}>
                <SelectTrigger className="h-8 w-full" aria-label="Owner">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                      {u.value === viewer.id ? " (me)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              task.ownerName ?? <span className="text-muted-foreground">Unassigned</span>
            )}
          </FieldRow>
          <FieldRow label="Created">{fmtDateTime(t.createdAt)}</FieldRow>
          <FieldRow label={t.status === "done" ? "Completed" : "Last update"}>
            {t.status === "done" && t.completedAt ? (
              <span>
                {fmtDateTime(t.completedAt)}
                {task.completedByName ? <span className="text-muted-foreground"> · by {task.completedByName}</span> : null}
              </span>
            ) : (
              fmtDateTime(t.updatedAt)
            )}
          </FieldRow>
        </FieldGrid>

        {t.candidateId || t.accountId || t.requisitionId || t.submissionId || t.placementId ? (
          <>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Linked records</Label>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {t.candidateId ? <LinkRow href={`/candidates/${t.candidateId}`} icon={UserRoundIcon} label="Candidate" value={task.candidateName ?? "Open"} /> : null}
                {t.accountId ? <LinkRow href={`/accounts/${t.accountId}`} icon={Building2Icon} label="Account" value={task.accountName ?? "Open"} /> : null}
                {t.requisitionId ? <LinkRow href={`/requisitions/${t.requisitionId}`} icon={BriefcaseIcon} label="Requisition" value={task.requisitionTitle ?? "Open"} /> : null}
                {t.submissionId ? <LinkRow href={`/submissions/${t.submissionId}`} icon={GitBranchIcon} label="Submission" value={task.submissionLabel ?? "Open"} /> : null}
                {t.placementId ? <LinkRow href={`/placements/${t.placementId}`} icon={HandshakeIcon} label="Placement" value={task.placementLabel ?? "Open"} /> : null}
                {t.type === "retention_review" && t.candidateId && viewer.permissions.admin ? <LinkRow href={`/admin/retention?candidate=${t.candidateId}`} icon={ArchiveIcon} label="Setup" value="Retention & erasure" /> : null}
              </ul>
              {t.type === "retention_review" && !viewer.permissions.admin ? <p className="text-xs text-muted-foreground">Decide whether the profile should be kept, then ask a Super Admin to record a hold or erase it from Setup → Retention.</p> : null}
            </div>
          </>
        ) : null}

        {task.message ? (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Message this task was created for</Label>
                <span className="flex items-center gap-1.5">
                  <StatusBadge value={task.message.channel} tone="neutral" />
                  <StatusBadge value={task.message.status} />
                </span>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  To {task.message.toAddress} · {task.message.attempts} attempt{task.message.attempts === 1 ? "" : "s"} · {fmtDateTime(task.message.createdAt)}
                </p>
                {task.message.subject ? <p className="mt-1 font-medium">{task.message.subject}</p> : null}
                <p className="mt-1 whitespace-pre-wrap">{task.message.body}</p>
                {task.message.errorMessage ? <p className="mt-2 rounded-md bg-danger-soft px-2 py-1 text-xs text-danger-foreground">{task.message.errorMessage}</p> : null}
              </div>
              {t.candidateId ? (
                <p className="text-xs text-muted-foreground">
                  Contact the candidate through a permitted channel, then log the outcome on the{" "}
                  <Link href={`/candidates/${t.candidateId}`} className="text-primary hover:underline">
                    candidate record
                  </Link>{" "}
                  and mark this task done.
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {humanize(t.type)} task
          {t.dedupeKey ? " · created automatically" : ""}
        </p>
      </div>
    </SlideOver>
  );
}

function LinkRow({ href, icon: Icon, label, value }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary-soft/40">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className="block truncate font-medium">{value}</span>
        </span>
      </Link>
    </li>
  );
}
