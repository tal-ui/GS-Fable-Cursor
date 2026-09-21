"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BotIcon, ChevronDownIcon, ScrollTextIcon, ShieldAlertIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { EmptyState } from "@/components/app/empty-state";
import { KpiCard } from "@/components/app/kpi-card";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDateTime, fmtPercent, fmtRelative, humanize } from "@/lib/format";

type Change = { id: string; entityType: string; entityId: string; action: string; actorName: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null; note: string | null; ip: string | null; createdAt: Date };
type Security = { id: string; userName: string | null; userEmail: string | null; action: string; resource: string | null; method: string | null; path: string | null; statusCode: number; ip: string | null; userAgent: string | null; details: Record<string, unknown> | null; createdAt: Date };
type Ai = { id: string; purpose: string; provider: string; model: string | null; entityType: string | null; entityId: string | null; confidence: number | null; latencyMs: number | null; status: string; error: string | null; input: Record<string, unknown> | null; output: Record<string, unknown> | null; createdAt: Date };

const ENTITY_ROUTE: Record<string, string> = { candidate: "/candidates", account: "/accounts", requisition: "/requisitions", submission: "/submissions", placement: "/placements", import_batch: "/imports" };

function entityHref(type: string, id: string): string | null {
  const base = ENTITY_ROUTE[type];
  return base ? `${base}/${id}` : null;
}

function Json({ value }: { value: unknown }) {
  return <pre className="max-h-64 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-snug">{JSON.stringify(value, null, 2)}</pre>;
}

function Diff({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (keys.length === 0) return <p className="text-xs text-muted-foreground">No field-level detail recorded.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="h-8 text-xs">Field</TableHead>
          <TableHead className="h-8 text-xs">Before</TableHead>
          <TableHead className="h-8 text-xs">After</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((k) => {
          const b = before?.[k];
          const a = after?.[k];
          const changed = JSON.stringify(b) !== JSON.stringify(a);
          return (
            <TableRow key={k} className={cn(!changed && "opacity-60")}>
              <TableCell className="py-1 font-mono text-[11px]">{k}</TableCell>
              <TableCell className="py-1 text-xs">{b === undefined ? <span className="text-muted-foreground">—</span> : typeof b === "object" ? JSON.stringify(b) : String(b)}</TableCell>
              <TableCell className={cn("py-1 text-xs", changed && "font-medium")}>{a === undefined ? <span className="text-muted-foreground">—</span> : typeof a === "object" ? JSON.stringify(a) : String(a)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function LogsView({ initialTab, entityFilter, changes, security, ai, denied7d }: { initialTab: string; entityFilter: { entityType: string | null; entityId: string | null }; changes: Change[]; security: Security[]; ai: Ai[]; denied7d: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = React.useState<"changes" | "security" | "ai">(initialTab === "security" || initialTab === "ai" ? initialTab : "changes");
  const [q, setQ] = React.useState("");
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const clearEntityFilter = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("entity");
    params.delete("id");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const needle = q.trim().toLowerCase();
  const visibleChanges = changes.filter((c) => !needle || [c.entityType, c.action, c.actorName ?? "", c.note ?? "", c.entityId].some((s) => s.toLowerCase().includes(needle)));
  const visibleSecurity = security.filter((s) => !needle || [s.action, s.resource ?? "", s.path ?? "", s.userName ?? "", s.userEmail ?? "", s.ip ?? "", String(s.statusCode)].some((x) => x.toLowerCase().includes(needle)));
  const visibleAi = ai.filter((a) => !needle || [a.purpose, a.provider, a.model ?? "", a.status, a.entityType ?? ""].some((x) => x.toLowerCase().includes(needle)));

  const lowConfidence = ai.filter((a) => a.confidence !== null && a.confidence < 0.75).length;
  const avgLatency = ai.length ? Math.round(ai.reduce((s, a) => s + (a.latencyMs ?? 0), 0) / ai.length) : 0;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Changes (recent)" value={changes.length} hint="Create, update, delete, merge, role changes" icon={ScrollTextIcon} />
        <KpiCard label="Access denials (7d)" value={denied7d} hint="403 responses logged with user, IP and path" icon={ShieldAlertIcon} />
        <KpiCard label="AI decisions (recent)" value={ai.length} hint={`${lowConfidence} below the 0.75 review threshold`} icon={BotIcon} />
        <KpiCard label="Avg AI latency" value={ai.length ? `${avgLatency} ms` : "—"} hint="Across recent calls" />
      </div>

      <div className="surface">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="changes">Change log ({changes.length})</TabsTrigger>
              <TabsTrigger value="security">Security ({security.length})</TabsTrigger>
              <TabsTrigger value="ai">AI decisions ({ai.length})</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="h-9 w-56" />
          {entityFilter.entityType ? (
            <Button variant="outline" size="sm" onClick={clearEntityFilter}>
              {humanize(entityFilter.entityType)} {entityFilter.entityId ? entityFilter.entityId.slice(0, 8) : ""}
              <XIcon data-icon="inline-end" />
            </Button>
          ) : null}
        </div>

        {tab === "changes" ? (
          visibleChanges.length === 0 ? (
            <EmptyState icon={ScrollTextIcon} title="No changes recorded" description="Every create, update, merge, delete and role change lands here with before/after values." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleChanges.map((c) => {
                  const open = expanded === c.id;
                  const href = entityHref(c.entityType, c.entityId);
                  return (
                    <React.Fragment key={c.id}>
                      <TableRow className="cursor-pointer" onClick={() => setExpanded(open ? null : c.id)}>
                        <TableCell>
                          <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground" title={fmtDateTime(c.createdAt)}>
                          {fmtRelative(c.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm">{c.actorName ?? <span className="text-muted-foreground">System</span>}</TableCell>
                        <TableCell>
                          <StatusBadge value={c.action} tone={c.action === "delete" ? "danger" : c.action === "create" ? "success" : c.action === "role_change" ? "primary" : "info"} />
                        </TableCell>
                        <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
                          {href ? (
                            <Link href={href} className="hover:underline">
                              {humanize(c.entityType)} ↗
                            </Link>
                          ) : (
                            humanize(c.entityType)
                          )}
                          <span className="ml-1 font-mono text-[11px] text-muted-foreground">{c.entityId.slice(0, 8)}</span>
                        </TableCell>
                        <TableCell className="max-w-sm truncate text-xs text-muted-foreground">{c.note ?? ""}</TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={6}>
                            <Diff before={c.before} after={c.after} />
                            <p className="mt-1 text-xs text-muted-foreground">
                              {fmtDateTime(c.createdAt)}
                              {c.ip ? ` · ${c.ip}` : ""}
                            </p>
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

        {tab === "security" ? (
          visibleSecurity.length === 0 ? (
            <EmptyState icon={ShieldAlertIcon} title="No security events" description="Forbidden actions, blocked admin routes, inactive-account access and CSRF rejections are recorded here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>When</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Attempted</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSecurity.map((s) => {
                  const open = expanded === s.id;
                  return (
                    <React.Fragment key={s.id}>
                      <TableRow className={cn("cursor-pointer", s.statusCode === 403 && "bg-danger-soft/20")} onClick={() => setExpanded(open ? null : s.id)}>
                        <TableCell>
                          <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground" title={fmtDateTime(s.createdAt)}>
                          {fmtRelative(s.createdAt)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={String(s.statusCode)} tone={s.statusCode >= 400 ? "danger" : "success"} label={String(s.statusCode)} />
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.userName ?? <span className="text-muted-foreground">Anonymous</span>}
                          {s.userEmail ? <p className="text-xs text-muted-foreground">{s.userEmail}</p> : null}
                        </TableCell>
                        <TableCell className="text-sm">
                          {humanize(s.action.replace(/:/g, " "))}
                          {s.resource ? <span className="text-muted-foreground"> · {humanize(s.resource)}</span> : null}
                        </TableCell>
                        <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                          {s.method ? `${s.method} ` : ""}
                          {s.path ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{s.ip ?? "—"}</TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={7}>
                            <p className="text-xs text-muted-foreground">{s.userAgent ?? "No user agent"}</p>
                            {s.details ? <Json value={s.details} /> : null}
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

        {tab === "ai" ? (
          visibleAi.length === 0 ? (
            <EmptyState icon={BotIcon} title="No AI decisions yet" description="Each CV extraction or ranking call is logged with its input, output, confidence and latency. Low-confidence results are routed to a recruiter." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>When</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleAi.map((a) => {
                  const open = expanded === a.id;
                  const href = a.entityType && a.entityId ? entityHref(a.entityType, a.entityId) : null;
                  const low = a.confidence !== null && a.confidence < 0.75;
                  return (
                    <React.Fragment key={a.id}>
                      <TableRow className="cursor-pointer" onClick={() => setExpanded(open ? null : a.id)}>
                        <TableCell>
                          <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground" title={fmtDateTime(a.createdAt)}>
                          {fmtRelative(a.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{humanize(a.purpose)}</TableCell>
                        <TableCell className="text-sm">
                          {a.provider}
                          {a.model ? <span className="text-muted-foreground"> · {a.model}</span> : null}
                        </TableCell>
                        <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
                          {href ? (
                            <Link href={href} className="hover:underline">
                              {humanize(a.entityType!)} ↗
                            </Link>
                          ) : (
                            a.entityType ? humanize(a.entityType) : "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {a.confidence === null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <span className={cn("flex items-center gap-2 text-sm tabular-nums", low && "text-warning-foreground")}>
                              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                <span className={cn("block h-full rounded-full", low ? "bg-warning" : "bg-success")} style={{ width: `${Math.round(a.confidence * 100)}%` }} />
                              </span>
                              {fmtPercent(a.confidence)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">{a.latencyMs !== null ? `${a.latencyMs} ms` : "—"}</TableCell>
                        <TableCell>
                          <StatusBadge value={a.status} tone={a.status === "error" || a.status === "failed" ? "danger" : a.status === "fallback" ? "warning" : "success"} />
                        </TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={8}>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Input</p>
                                <Json value={a.input ?? {}} />
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Output</p>
                                <Json value={a.output ?? {}} />
                                {a.error ? <p className="mt-1 text-xs text-danger-foreground">{a.error}</p> : null}
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
      </div>
    </>
  );
}
