"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDownIcon, DatabaseIcon, PlugZapIcon, RotateCcwIcon, WebhookIcon } from "lucide-react";
import { cn } from "cn";
import { retryJobAction } from "@/actions/admin";
import { EmptyState } from "@/components/app/empty-state";
import { KpiCard } from "@/components/app/kpi-card";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fmtDateTime, fmtRelative, humanize } from "@/lib/format";

type JobStatus = "queued" | "running" | "succeeded" | "failed" | "dead";
type Job = { id: string; type: string; status: JobStatus; attempts: number; maxAttempts: number; runAt: Date; startedAt: Date | null; finishedAt: Date | null; lastError: string | null; payload: Record<string, unknown>; result: Record<string, unknown> | null; updatedAt: Date; createdAt: Date; lockedBy: string | null };
type IntegrationError = { id: string; integration: string; operation: string; errorMessage: string; errorCode: string | null; attempts: number; jobId: string | null; resolvedAt: Date | null; createdAt: Date; payload: Record<string, unknown> | null };
type Webhook = { id: string; provider: string; externalEventId: string; signatureValid: boolean; processedAt: Date | null; error: string | null; createdAt: Date; payload: Record<string, unknown> };

const JOB_TYPE_LABEL: Record<string, string> = {
  "whatsapp:send": "WhatsApp send",
  "email:send": "Email send",
  "ai:extract_cv": "AI CV extraction",
  "matching:recompute": "Matching recompute",
  "import:commit": "Import commit",
  "maintenance:daily": "Daily maintenance",
};

function Json({ value }: { value: unknown }) {
  return <pre className="max-h-64 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-snug">{JSON.stringify(value, null, 2)}</pre>;
}

export function JobsView({ counts, statusFilter, initialTab, jobs, errors, webhooks, runner }: { counts: Record<string, number>; statusFilter: string[]; initialTab: string; jobs: Job[]; errors: IntegrationError[]; webhooks: Webhook[]; runner: { inline: boolean; pollMs: number; timeoutMs: number; slack: boolean } }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = React.useState<"jobs" | "errors" | "webhooks">(initialTab === "errors" || initialTab === "webhooks" ? initialTab : "jobs");
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const retry = useAction(retryJobAction, { successMessage: "Job queued for another attempt", onSuccess: () => router.refresh() });

  const setStatuses = (values: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    if (values.length) params.set("status", values.join(","));
    else params.delete("status");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const dead = (counts.dead ?? 0) + (counts.failed ?? 0);
  const unresolved = errors.filter((e) => !e.resolvedAt).length;
  const badSignatures = webhooks.filter((w) => !w.signatureValid).length;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Queued" value={counts.queued ?? 0} hint={runner.inline ? `Inline worker polls every ${Math.round(runner.pollMs / 1000)}s` : "External runner"} icon={DatabaseIcon} />
        <KpiCard label="Running" value={counts.running ?? 0} hint="Stale locks are recovered automatically" />
        <KpiCard label="Failed / dead" value={dead} hint={dead ? "Retry from the list below" : "Nothing needs attention"} />
        <KpiCard label="Integration errors" value={unresolved} hint={runner.slack ? "Also alerted to Slack" : "Slack alerts not configured"} icon={PlugZapIcon} />
        <KpiCard label="Webhook signature failures" value={badSignatures} hint={`Timeout per call: ${runner.timeoutMs / 1000}s`} icon={WebhookIcon} />
      </div>

      <div className="surface">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="jobs">Jobs ({jobs.length})</TabsTrigger>
              <TabsTrigger value="errors">Integration errors ({errors.length})</TabsTrigger>
              <TabsTrigger value="webhooks">Webhooks ({webhooks.length})</TabsTrigger>
            </TabsList>
          </Tabs>
          {tab === "jobs" ? (
            <ToggleGroup type="multiple" value={statusFilter} onValueChange={setStatuses} variant="outline" size="sm" className="ml-auto">
              {(["queued", "running", "succeeded", "failed", "dead"] as JobStatus[]).map((s) => (
                <ToggleGroupItem key={s} value={s} aria-label={`Filter ${s}`} className="px-2.5 text-xs">
                  {humanize(s)} <span className="ml-1 tabular-nums text-muted-foreground">{counts[s] ?? 0}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
        </div>

        {tab === "jobs" ? (
          jobs.length === 0 ? (
            <EmptyState icon={DatabaseIcon} title="No jobs match" description={statusFilter.length ? "Clear the status filter to see the full queue." : "Jobs appear when a message is queued, a CV is uploaded, a requisition changes or an import is committed."} action={statusFilter.length ? <Button variant="outline" onClick={() => setStatuses([])}>Clear filter</Button> : undefined} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>Last error</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => {
                  const open = expanded === j.id;
                  return (
                    <React.Fragment key={j.id}>
                      <TableRow className={cn("cursor-pointer", (j.status === "dead" || j.status === "failed") && "bg-danger-soft/30")} onClick={() => setExpanded(open ? null : j.id)}>
                        <TableCell>
                          <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{JOB_TYPE_LABEL[j.type] ?? j.type}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">{j.id.slice(0, 8)}</p>
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={j.status} />
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {j.attempts} / {j.maxAttempts}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground" title={fmtDateTime(j.runAt)}>
                          {fmtRelative(j.runAt)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{j.finishedAt ? fmtRelative(j.finishedAt) : "—"}</TableCell>
                        <TableCell className="max-w-xs truncate text-xs text-danger-foreground">{j.lastError ?? ""}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {j.status === "dead" || j.status === "failed" ? (
                            <Button size="sm" variant="outline" disabled={retry.pending} onClick={() => retry.run({ id: j.id })}>
                              <RotateCcwIcon data-icon="inline-start" />
                              Retry
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={8}>
                            <div className="grid gap-3 py-1 md:grid-cols-2">
                              <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Payload</p>
                                <Json value={j.payload} />
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Result</p>
                                {j.result ? <Json value={j.result} /> : <p className="text-xs text-muted-foreground">No result recorded.</p>}
                                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                  <dt>Created</dt>
                                  <dd>{fmtDateTime(j.createdAt)}</dd>
                                  <dt>Started</dt>
                                  <dd>{j.startedAt ? fmtDateTime(j.startedAt) : "—"}</dd>
                                  <dt>Worker</dt>
                                  <dd className="font-mono">{j.lockedBy ?? "—"}</dd>
                                </dl>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )
        ) : null}

        {tab === "errors" ? (
          errors.length === 0 ? (
            <EmptyState icon={PlugZapIcon} title="No integration errors" description="Provider failures (timeouts, 4xx/5xx, signature mismatches) are recorded here with the payload that caused them." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Integration</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Resolved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((e) => {
                  const open = expanded === e.id;
                  return (
                    <React.Fragment key={e.id}>
                      <TableRow className="cursor-pointer" onClick={() => setExpanded(open ? null : e.id)}>
                        <TableCell>
                          <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
                        </TableCell>
                        <TableCell className="font-medium">{humanize(e.integration)}</TableCell>
                        <TableCell className="text-sm">{e.operation}</TableCell>
                        <TableCell className="max-w-md text-sm">
                          {e.errorCode ? <code className="mr-1 rounded bg-muted px-1 text-[11px]">{e.errorCode}</code> : null}
                          <span className="text-danger-foreground">{e.errorMessage}</span>
                        </TableCell>
                        <TableCell className="tabular-nums">{e.attempts}</TableCell>
                        <TableCell className="text-sm text-muted-foreground" title={fmtDateTime(e.createdAt)}>
                          {fmtRelative(e.createdAt)}
                        </TableCell>
                        <TableCell>{e.resolvedAt ? <StatusBadge value="succeeded" label="Resolved" /> : <StatusBadge value="open" tone="warning" label="Open" />}</TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={7}>
                            <Json value={e.payload ?? {}} />
                            {e.jobId ? <p className="mt-1 text-xs text-muted-foreground">Job {e.jobId.slice(0, 8)}</p> : null}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )
        ) : null}

        {tab === "webhooks" ? (
          webhooks.length === 0 ? (
            <EmptyState icon={WebhookIcon} title="No webhooks received" description="Inbound delivery receipts and replies from WhatsApp land here. Each event is verified by signature and processed once." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Provider</TableHead>
                  <TableHead>Event ID</TableHead>
                  <TableHead>Signature</TableHead>
                  <TableHead>Processed</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((w) => {
                  const open = expanded === w.id;
                  return (
                    <React.Fragment key={w.id}>
                      <TableRow className={cn("cursor-pointer", !w.signatureValid && "bg-danger-soft/30")} onClick={() => setExpanded(open ? null : w.id)}>
                        <TableCell>
                          <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
                        </TableCell>
                        <TableCell className="font-medium">{humanize(w.provider)}</TableCell>
                        <TableCell className="max-w-xs truncate font-mono text-xs">{w.externalEventId}</TableCell>
                        <TableCell>{w.signatureValid ? <StatusBadge value="verified" label="Valid" /> : <StatusBadge value="failed" label="Invalid" />}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{w.processedAt ? fmtRelative(w.processedAt) : "—"}</TableCell>
                        <TableCell className="max-w-xs truncate text-xs text-danger-foreground">{w.error ?? ""}</TableCell>
                        <TableCell className="text-sm text-muted-foreground" title={fmtDateTime(w.createdAt)}>
                          {fmtRelative(w.createdAt)}
                        </TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={7}>
                            <Json value={w.payload} />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )
        ) : null}
      </div>
    </>
  );
}
