"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangleIcon, BriefcaseIcon, CalendarClockIcon, CheckIcon, GitBranchIcon, HandshakeIcon, ListChecksIcon, MailWarningIcon, MoreHorizontalIcon, PlayIcon, PlusIcon, ScanSearchIcon, UserRoundIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type Column, type FilterDef, type SavedFilter } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { CreateTaskSheet } from "@/components/app/create-task-sheet";
import { useAction } from "@/components/app/use-action";
import { useNow } from "@/components/app/use-now";
import { useQueryFlag } from "@/components/app/use-query-flag";
import { enumOptions } from "@/components/app/form";
import { useViewer } from "@/components/shell/viewer-context";
import { bulkReassignTasksAction, bulkTaskStatusAction, reassignTaskAction, updateTaskStatusAction } from "@/actions/tasks";
import type { TaskDetail, TaskListRow, WorkQueueItems } from "@/server/tasks";
import type { ListParams, ListResult } from "@/server/list";
import { fmtDate, fmtDateTime, fmtRelative, humanize } from "@/lib/format";
import { TaskSheet } from "./task-sheet";

type Opt = { value: string; label: string };
type Summary = { overdueTasks: number; openTasks: number; stalledSubmissions: number; reviewSubmissions: number; failedMessages: number; stalledRequisitions: number; upcomingStarts: number };

export const TASK_TYPES = enumOptions(["follow_up", "verification", "availability_check", "eligibility_review", "message_failed", "stalled_request", "manual_contact", "placement_checklist", "import_review", "other"]);
export const TASK_STATUSES = enumOptions(["open", "in_progress", "done", "cancelled"]);
export const PRIORITIES = enumOptions(["low", "medium", "high", "urgent"]);

const VIEWS = ["tasks", "review", "stalled", "requisitions", "starts"] as const;
type View = (typeof VIEWS)[number];

export function WorkQueueView({
  result,
  params,
  savedFilters,
  summary,
  items,
  users,
  openNew,
  focusTask,
  focusMissing,
  initialView,
}: {
  result: ListResult<TaskListRow>;
  params: ListParams;
  savedFilters: SavedFilter[];
  summary: Summary;
  items: WorkQueueItems;
  users: Opt[];
  openNew: boolean;
  focusTask: TaskDetail | null;
  focusMissing: boolean;
  initialView: string;
}) {
  const viewer = useViewer();
  const canWrite = viewer.permissions.write;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [newOpen, setNewOpen] = useQueryFlag("new", openNew);
  const view: View = (VIEWS as readonly string[]).includes(initialView) ? (initialView as View) : "tasks";

  const setParam = React.useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(searchParams.toString());
      mutate(p);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const setView = (v: string) => setParam((p) => (v === "tasks" ? p.delete("view") : p.set("view", v)));
  const openTask = (id: string) => setParam((p) => p.set("task", id));
  const closeTask = () => setParam((p) => p.delete("task"));
  const showTasks = (mutate: (p: URLSearchParams) => void) =>
    setParam((p) => {
      p.delete("view");
      for (const k of Array.from(p.keys())) if (k.startsWith("f_")) p.delete(k);
      p.delete("page");
      mutate(p);
    });

  const status = useAction(updateTaskStatusAction, { successMessage: (d) => (d.status === "done" ? "Task completed" : d.status === "cancelled" ? "Task cancelled" : `Task ${humanize(d.status).toLowerCase()}`) });
  const reassign = useAction(reassignTaskAction, { successMessage: "Task reassigned" });
  const bulkStatus = useAction(bulkTaskStatusAction, { successMessage: (d) => `${d.count} task${d.count === 1 ? "" : "s"} updated` });
  const bulkReassign = useAction(bulkReassignTasksAction, { successMessage: (d) => `${d.count} task${d.count === 1 ? "" : "s"} reassigned` });

  const now = useNow();
  const isOverdue = (r: TaskListRow) => Boolean(r.task.dueAt) && new Date(r.task.dueAt!).getTime() < now && (r.task.status === "open" || r.task.status === "in_progress");

  const columns: Column<TaskListRow>[] = [
    {
      id: "title",
      header: "Task",
      locked: true,
      sortKey: "title",
      cell: (r) => (
        <div className="min-w-0 max-w-xl">
          <button type="button" onClick={() => openTask(r.task.id)} className={cn("text-left font-medium hover:underline", r.task.status === "done" && "text-muted-foreground line-through")}>
            {r.task.title}
          </button>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {r.candidateName ? (
              <Link href={`/candidates/${r.task.candidateId}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                <UserRoundIcon className="size-3" />
                {r.candidateName}
              </Link>
            ) : null}
            {r.requisitionTitle ? (
              <Link href={`/requisitions/${r.task.requisitionId}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                <BriefcaseIcon className="size-3" />
                {r.requisitionTitle}
              </Link>
            ) : null}
            {r.accountName && !r.requisitionTitle ? <Link href={`/accounts/${r.task.accountId}`} className="hover:text-foreground hover:underline">{r.accountName}</Link> : null}
            {r.task.submissionId ? (
              <Link href={`/submissions/${r.task.submissionId}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                <GitBranchIcon className="size-3" />
                Submission
              </Link>
            ) : null}
            {r.task.placementId ? (
              <Link href={`/placements/${r.task.placementId}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                <HandshakeIcon className="size-3" />
                Placement
              </Link>
            ) : null}
          </div>
        </div>
      ),
    },
    { id: "type", header: "Type", sortKey: "type", cell: (r) => <StatusBadge value={r.task.type} tone={r.task.type === "message_failed" ? "danger" : r.task.type === "eligibility_review" || r.task.type === "verification" ? "warning" : "neutral"} /> },
    { id: "priority", header: "Priority", sortKey: "priority", cell: (r) => <StatusBadge value={r.task.priority} /> },
    {
      id: "dueAt",
      header: "Due",
      sortKey: "dueAt",
      cell: (r) =>
        r.task.dueAt ? (
          <span className={cn("inline-flex items-center gap-1 text-sm tabular-nums", isOverdue(r) && "font-medium text-danger-foreground")} title={fmtDateTime(r.task.dueAt)}>
            {isOverdue(r) ? <AlertTriangleIcon className="size-3.5" /> : null}
            {fmtRelative(r.task.dueAt)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No due date</span>
        ),
    },
    { id: "owner", header: "Owner", cell: (r) => r.ownerName ?? <span className="text-warning-foreground">Unassigned</span> },
    { id: "status", header: "Status", sortKey: "status", cell: (r) => <StatusBadge value={r.task.status} /> },
    { id: "createdAt", header: "Created", sortKey: "createdAt", defaultHidden: true, cell: (r) => <span className="text-sm text-muted-foreground">{fmtRelative(r.task.createdAt)}</span> },
    ...(canWrite
      ? [
          {
            id: "actions",
            header: "",
            align: "right" as const,
            width: "56px",
            cell: (r: TaskListRow) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Task actions" data-no-row-link>
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => openTask(r.task.id)}>Open</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {r.task.status === "open" ? (
                    <DropdownMenuItem onSelect={() => status.run({ id: r.task.id, status: "in_progress" })}>
                      <PlayIcon />
                      Start
                    </DropdownMenuItem>
                  ) : null}
                  {r.task.status !== "done" ? (
                    <DropdownMenuItem onSelect={() => status.run({ id: r.task.id, status: "done" })}>
                      <CheckIcon />
                      Mark done
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => status.run({ id: r.task.id, status: "open" })}>Reopen</DropdownMenuItem>
                  )}
                  {r.task.status !== "cancelled" && r.task.status !== "done" ? (
                    <DropdownMenuItem onSelect={() => status.run({ id: r.task.id, status: "cancelled" })}>
                      <XIcon />
                      Cancel
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Reassign to</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                      <DropdownMenuLabel>Owner</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => reassign.run({ id: r.task.id, ownerId: viewer.id })}>Me</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => reassign.run({ id: r.task.id, ownerId: null })}>Unassigned</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {users.map((u) => (
                        <DropdownMenuItem key={u.value} onSelect={() => reassign.run({ id: r.task.id, ownerId: u.value })} disabled={u.value === r.task.ownerId}>
                          {u.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          },
        ]
      : []),
  ];

  const filters: FilterDef[] = [
    { key: "status", label: "Status", type: "select", options: TASK_STATUSES },
    { key: "type", label: "Type", type: "select", options: TASK_TYPES },
    { key: "priority", label: "Priority", type: "select", options: PRIORITIES },
    { key: "owner", label: "Owner", type: "select", options: [{ value: "unassigned", label: "Unassigned" }, ...users] },
    { key: "due", label: "Due", type: "select", options: [{ value: "today", label: "Today or earlier" }, { value: "week", label: "Within 7 days" }] },
    { key: "overdue", label: "Overdue only", type: "boolean" },
    { key: "mine", label: "Assigned to me", type: "boolean" },
  ];

  const attention = summary.overdueTasks + summary.failedMessages + summary.reviewSubmissions + summary.stalledSubmissions + summary.stalledRequisitions;

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <AttentionCard icon={AlertTriangleIcon} label="Overdue tasks" value={summary.overdueTasks} tone={summary.overdueTasks ? "danger" : "neutral"} active={view === "tasks" && params.filters.overdue === "true"} onClick={() => showTasks((p) => p.set("f_overdue", "true"))} />
        <AttentionCard icon={MailWarningIcon} label="Failed messages" value={summary.failedMessages} tone={summary.failedMessages ? "danger" : "neutral"} active={view === "tasks" && params.filters.type === "message_failed"} onClick={() => showTasks((p) => p.set("f_type", "message_failed"))} />
        <AttentionCard icon={ScanSearchIcon} label="Eligibility unknown" value={summary.reviewSubmissions} tone={summary.reviewSubmissions ? "warning" : "neutral"} active={view === "review"} onClick={() => setView("review")} />
        <AttentionCard icon={GitBranchIcon} label="Stalled submissions" value={summary.stalledSubmissions} tone={summary.stalledSubmissions ? "warning" : "neutral"} active={view === "stalled"} onClick={() => setView("stalled")} />
        <AttentionCard icon={BriefcaseIcon} label="Stalled requisitions" value={summary.stalledRequisitions} tone={summary.stalledRequisitions ? "warning" : "neutral"} active={view === "requisitions"} onClick={() => setView("requisitions")} />
        <AttentionCard icon={CalendarClockIcon} label="Starting in 14 days" value={items.upcomingStarts.length} tone={items.upcomingStarts.length ? "info" : "neutral"} active={view === "starts"} onClick={() => setView("starts")} />
      </section>

      <Tabs value={view} onValueChange={setView} className="gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="tasks">
              Tasks <Count n={summary.openTasks} />
            </TabsTrigger>
            <TabsTrigger value="review">
              Eligibility review <Count n={items.reviewSubmissions.length} />
            </TabsTrigger>
            <TabsTrigger value="stalled">
              Stalled submissions <Count n={items.stalledSubmissions.length} />
            </TabsTrigger>
            <TabsTrigger value="requisitions">
              Stalled requisitions <Count n={items.stalledRequisitions.length} />
            </TabsTrigger>
            <TabsTrigger value="starts">
              Starting soon <Count n={items.upcomingStarts.length} />
            </TabsTrigger>
          </TabsList>
          {canWrite ? (
            <Button className="ml-auto" onClick={() => setNewOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              New task
            </Button>
          ) : null}
        </div>

        <TabsContent value="tasks">
          <DataTable
            tableId="work-queue"
            entity="work-queue"
            columns={columns}
            rows={result.rows}
            total={result.total}
            page={result.page}
            pageSize={result.pageSize}
            pageCount={result.pageCount}
            sort={params.sort}
            dir={params.dir}
            q={params.q}
            filters={filters}
            activeFilters={params.filters}
            savedFilters={savedFilters}
            searchPlaceholder="Search task titles and details…"
            canExport={viewer.permissions.export}
            exportPath="/api/export/tasks"
            selectable={canWrite}
            bulkActions={(ids, clear) => (
              <>
                <Button size="sm" variant="outline" disabled={bulkStatus.pending} onClick={() => bulkStatus.run({ ids, status: "done" }).then(clear)}>
                  <CheckIcon data-icon="inline-start" />
                  Mark done
                </Button>
                <Button size="sm" variant="outline" disabled={bulkStatus.pending} onClick={() => bulkStatus.run({ ids, status: "in_progress" }).then(clear)}>
                  <PlayIcon data-icon="inline-start" />
                  Start
                </Button>
                <Button size="sm" variant="outline" disabled={bulkStatus.pending} onClick={() => bulkStatus.run({ ids, status: "cancelled" }).then(clear)}>
                  <XIcon data-icon="inline-start" />
                  Cancel
                </Button>
                <Select onValueChange={(v) => bulkReassign.run({ ids, ownerId: v === "__none" ? null : v }).then(clear)} disabled={bulkReassign.pending}>
                  <SelectTrigger className="h-7 w-44 text-[0.8rem]" aria-label="Reassign selected tasks">
                    <SelectValue placeholder="Reassign to…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={viewer.id}>Me</SelectItem>
                    <SelectItem value="__none">Unassigned</SelectItem>
                    {users.filter((u) => u.value !== viewer.id).map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            emptyIcon={ListChecksIcon}
            emptyTitle={attention ? "No open tasks" : "Your queue is clear"}
            emptyDescription={attention ? "Other tabs still have items that need attention." : "Nothing overdue, stalled or failed. Tasks created by automations, failed messages and colleagues will show up here."}
            emptyAction={canWrite ? <Button onClick={() => setNewOpen(true)}>Create a task</Button> : undefined}
          />
        </TabsContent>

        <TabsContent value="review">
          <QueueTable
            rows={items.reviewSubmissions}
            empty={{ icon: ScanSearchIcon, title: "No submissions waiting on evidence", description: "Submissions land here when a mandatory rule could not be decided — missing or stale evidence, unconfirmed availability or work authorization." }}
            columns={[
              { header: "Candidate", cell: (s) => <Link href={`/submissions/${s.id}`} className="font-medium hover:underline">{s.candidateName}</Link> },
              { header: "Requisition", cell: (s) => <span className="text-sm">{s.requisitionTitle} <span className="text-muted-foreground">· {s.accountName}</span></span> },
              { header: "Stage", cell: (s) => <StatusBadge value={s.stage} /> },
              { header: "Unknown rules", cell: (s) => <span className="tabular-nums">{s.unknownRules}</span>, align: "center" },
              { header: "Owner", cell: (s) => s.ownerName ?? <span className="text-warning-foreground">Unassigned</span> },
              { header: "Since", cell: (s) => <span className="text-sm text-muted-foreground" title={fmtDateTime(s.stageChangedAt)}>{fmtRelative(s.stageChangedAt)}</span> },
              {
                header: "",
                align: "right",
                cell: (s) => (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/requisitions/${s.requisitionId}/match`}>Review evidence</Link>
                  </Button>
                ),
              },
            ]}
            href={(s) => `/submissions/${s.id}`}
            footer={
              <Link href="/submissions?f_eligibility=review" className="text-xs text-primary hover:underline">
                Open in submissions →
              </Link>
            }
          />
        </TabsContent>

        <TabsContent value="stalled">
          <QueueTable
            rows={items.stalledSubmissions}
            empty={{ icon: GitBranchIcon, title: "Nothing is stalled", description: "Every open submission has moved recently. The stall threshold is configured by a Super Admin under Setup → Settings." }}
            columns={[
              { header: "Candidate", cell: (s) => <Link href={`/submissions/${s.id}`} className="font-medium hover:underline">{s.candidateName}</Link> },
              { header: "Requisition", cell: (s) => <span className="text-sm">{s.requisitionTitle} <span className="text-muted-foreground">· {s.accountName}</span></span> },
              { header: "Stage", cell: (s) => <StatusBadge value={s.stage} /> },
              { header: "Eligibility", cell: (s) => <StatusBadge value={s.eligibility} /> },
              { header: "Owner", cell: (s) => s.ownerName ?? <span className="text-warning-foreground">Unassigned</span> },
              { header: "No movement for", cell: (s) => <span className="text-sm font-medium text-warning-foreground" title={fmtDateTime(s.stageChangedAt)}>{fmtRelative(s.stageChangedAt).replace(" ago", "")}</span> },
            ]}
            href={(s) => `/submissions/${s.id}`}
            footer={
              <Link href="/submissions?f_stalled=true" className="text-xs text-primary hover:underline">
                Open in submissions →
              </Link>
            }
          />
        </TabsContent>

        <TabsContent value="requisitions">
          <QueueTable
            rows={items.stalledRequisitions}
            empty={{ icon: BriefcaseIcon, title: "No stalled requisitions", description: "Every open requisition has had a submission move recently." }}
            columns={[
              { header: "Requisition", cell: (r) => <Link href={`/requisitions/${r.id}`} className="font-medium hover:underline">{r.title}</Link> },
              { header: "Account", cell: (r) => <Link href={`/accounts/${r.accountId}`} className="text-sm hover:underline">{r.accountName}</Link> },
              { header: "Priority", cell: (r) => <StatusBadge value={r.priority} /> },
              { header: "Open seats", cell: (r) => <span className="tabular-nums">{r.openSeats}</span>, align: "center" },
              { header: "Active submissions", cell: (r) => <span className="tabular-nums">{r.activeSubmissions}</span>, align: "center" },
              { header: "Owner", cell: (r) => r.ownerName ?? <span className="text-warning-foreground">Unassigned</span> },
              { header: "Last movement", cell: (r) => <span className="text-sm text-muted-foreground">{r.lastMovementAt ? fmtRelative(r.lastMovementAt) : `none · updated ${fmtRelative(r.updatedAt)}`}</span> },
              {
                header: "",
                align: "right",
                cell: (r) => (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/requisitions/${r.id}/match`}>Find candidates</Link>
                  </Button>
                ),
              },
            ]}
            href={(r) => `/requisitions/${r.id}`}
            footer={
              <Link href="/requisitions?f_stalled=true" className="text-xs text-primary hover:underline">
                Open in requisitions →
              </Link>
            }
          />
        </TabsContent>

        <TabsContent value="starts">
          <QueueTable
            rows={items.upcomingStarts}
            empty={{ icon: HandshakeIcon, title: "No starts in the next two weeks", description: "Reserved placements appear here as their planned start approaches so the readiness checklist gets finished in time." }}
            columns={[
              { header: "Candidate", cell: (p) => <Link href={`/placements/${p.id}`} className="font-medium hover:underline">{p.candidateName}</Link> },
              { header: "Requisition", cell: (p) => <span className="text-sm">{p.requisitionTitle} <span className="text-muted-foreground">· {p.accountName}</span></span> },
              { header: "Planned start", cell: (p) => <span className={cn("text-sm tabular-nums", new Date(p.plannedStart).getTime() < now && "font-medium text-danger-foreground")}>{fmtDate(p.plannedStart)}</span> },
              {
                header: "Checklist",
                cell: (p) => (
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                      <span className={cn("block h-full rounded-full", p.checklistTotal && p.checklistDone === p.checklistTotal ? "bg-success" : "bg-primary")} style={{ width: p.checklistTotal ? `${Math.round((p.checklistDone / p.checklistTotal) * 100)}%` : "0%" }} />
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {p.checklistDone}/{p.checklistTotal}
                    </span>
                  </span>
                ),
              },
              { header: "Owner", cell: (p) => p.ownerName ?? <span className="text-warning-foreground">Unassigned</span> },
            ]}
            href={(p) => `/placements/${p.id}`}
            footer={
              <Link href="/placements?f_startingSoon=true" className="text-xs text-primary hover:underline">
                Open in placements →
              </Link>
            }
          />
        </TabsContent>
      </Tabs>

      {canWrite ? <CreateTaskSheet open={newOpen} onOpenChange={setNewOpen} link={{}} users={users} /> : null}
      <TaskSheet task={focusTask} missing={focusMissing} onClose={closeTask} users={users} />
    </>
  );
}

function Count({ n }: { n: number }) {
  if (!n) return null;
  return <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{n > 99 ? "99+" : n}</span>;
}

function AttentionCard({ icon: Icon, label, value, tone, active, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone: "danger" | "warning" | "info" | "neutral"; active?: boolean; onClick: () => void }) {
  const toneClass = { danger: "bg-danger-soft text-danger-foreground", warning: "bg-warning-soft text-warning-foreground", info: "bg-info-soft text-info-foreground", neutral: "bg-neutral-soft text-neutral-strong" }[tone];
  return (
    <button type="button" onClick={onClick} className={cn("surface flex items-center gap-3 px-4 py-3 text-left transition-colors hover:border-primary/40", active && "border-primary/60 ring-2 ring-primary/15")}>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", toneClass)}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-semibold leading-none tabular-nums">{value}</span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{label}</span>
      </span>
    </button>
  );
}

type QueueColumn<T> = { header: string; cell: (row: T) => React.ReactNode; align?: "left" | "right" | "center" };

function QueueTable<T extends { id: string }>({ rows, columns, empty, href, footer }: { rows: T[]; columns: QueueColumn<T>[]; empty: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }; href: (row: T) => string; footer?: React.ReactNode }) {
  const router = useRouter();
  if (rows.length === 0) return <EmptyState icon={empty.icon as never} title={empty.title} description={empty.description} />;
  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              {columns.map((c, i) => (
                <TableHead key={i} className={cn("whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground", c.align === "right" && "text-right", c.align === "center" && "text-center")}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest("a,button")) return;
                  router.push(href(row));
                }}
              >
                {columns.map((c, i) => (
                  <TableCell key={i} className={cn("align-middle", c.align === "right" && "text-right", c.align === "center" && "text-center")}>
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
        <span>
          {rows.length} item{rows.length === 1 ? "" : "s"}
          {rows.length >= 50 ? " (showing the oldest 50)" : ""}
        </span>
        {footer}
      </div>
    </div>
  );
}
