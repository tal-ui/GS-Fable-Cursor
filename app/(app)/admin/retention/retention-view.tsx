"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ClipboardCheckIcon, ClockIcon, EraserIcon, PauseCircleIcon, ShieldOffIcon, ShieldQuestionIcon } from "lucide-react";
import { z } from "zod";
import { cn } from "cn";
import { eraseCandidateAction, setRetentionHoldAction } from "@/actions/admin";
import { EmptyState } from "@/components/app/empty-state";
import { DateField, Form, SubmitButton, TextField, TextareaField, useFieldValue, useZodForm } from "@/components/app/form";
import { KpiCard } from "@/components/app/kpi-card";
import { SlideOver } from "@/components/app/slide-over";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDate, fmtDateTime, fmtRelative, humanize } from "@/lib/format";
import type { ErasureRecord, RetentionEntry } from "@/server/retention";

type Stats = { due: number; onHold: number; eligible: number; withdrawn: number; erased: number };
type Tab = "due" | "hold" | "erased";

const holdSchema = z.object({
  reason: z.string().trim().min(3, "Say why the profile must be kept").max(300),
  until: z.string().optional(),
});

const eraseSchema = z.object({
  note: z.string().trim().max(500).optional(),
  confirmation: z.string(),
});

export function RetentionView({ queue, stats, erasures, policy, initialTab, focusCandidateId }: { queue: RetentionEntry[]; stats: Stats; erasures: ErasureRecord[]; policy: { retentionMonths: number; graceDays: number }; initialTab: string; focusCandidateId: string | null }) {
  const router = useRouter();
  // Deep links from review tasks land on the row itself; the decision (hold or erase) stays a deliberate click.
  const focused = focusCandidateId ? queue.find((e) => e.id === focusCandidateId) ?? null : null;
  const [tab, setTab] = React.useState<Tab>(focused ? (focused.onHold ? "hold" : "due") : initialTab === "hold" || initialTab === "erased" ? initialTab : "due");
  const [q, setQ] = React.useState("");
  const [holdFor, setHoldFor] = React.useState<RetentionEntry | null>(null);
  const [eraseFor, setEraseFor] = React.useState<RetentionEntry | null>(null);
  const clearHold = useAction(setRetentionHoldAction, { successMessage: "Retention hold cleared", onSuccess: () => router.refresh() });

  React.useEffect(() => {
    if (focused) document.getElementById(`retention-${focused.id}`)?.scrollIntoView({ block: "center" });
  }, [focused]);

  const matches = (e: RetentionEntry) => !q || `${e.firstName} ${e.lastName} ${e.email ?? ""} ${e.ownerName ?? ""}`.toLowerCase().includes(q.toLowerCase());
  const due = queue.filter((e) => !e.onHold).filter(matches);
  const held = queue.filter((e) => e.onHold).filter(matches);
  const erased = erasures.filter((e) => !q || e.label.toLowerCase().includes(q.toLowerCase()) || (e.actorName ?? "").toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Due for review" value={stats.due} hint={stats.due ? "Review tasks are raised for the owners daily" : "Nothing is past its retention date"} icon={ClockIcon} />
        <KpiCard label="Eligible for erasure" value={stats.eligible} hint={`Past the ${policy.graceDays}-day grace period`} icon={EraserIcon} invert />
        <KpiCard label="Permission withdrawn" value={stats.withdrawn} hint="Due immediately, regardless of activity" icon={ShieldOffIcon} invert />
        <KpiCard label="On hold" value={stats.onHold} hint="Kept with a documented reason" icon={PauseCircleIcon} />
        <KpiCard label="Erased" value={stats.erased} hint="Personal data removed, history kept" icon={ArchiveIcon} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="surface min-w-0">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, owner…" className="h-9 w-64" />
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList>
                <TabsTrigger value="due">Due {due.length ? `(${due.length})` : ""}</TabsTrigger>
                <TabsTrigger value="hold">On hold {held.length ? `(${held.length})` : ""}</TabsTrigger>
                <TabsTrigger value="erased">Erased {erased.length ? `(${erased.length})` : ""}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {focusCandidateId ? (
            <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-4 py-2.5 text-sm">
              <ClipboardCheckIcon className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                {focused ? (
                  <>
                    <strong>Opened from the review task for {focused.firstName} {focused.lastName}.</strong> The row is highlighted below — record a hold to keep the profile, or erase it if nothing justifies keeping it.
                  </>
                ) : (
                  <>
                    <strong>This profile is no longer due for review.</strong> It was erased, picked up new activity, or is now part of a live submission or placement.
                  </>
                )}
              </span>
              <Button variant="ghost" size="sm" onClick={() => router.replace("/admin/retention")}>
                Dismiss
              </Button>
            </div>
          ) : null}

          {tab === "erased" ? (
            erased.length === 0 ? (
              <EmptyState icon={ArchiveIcon} title="No profiles have been erased" description="Erasures appear here with who performed them and how many records were scrubbed. The content itself is never kept." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profile</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Removed</TableHead>
                    <TableHead>Erased by</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {erased.map((e) => (
                    <TableRow key={e.candidateId}>
                      <TableCell>
                        <Link href={`/candidates/${e.candidateId}`} className="font-medium hover:underline">{e.label}</Link>
                        {e.note ? <p className="text-xs text-muted-foreground">{e.note}</p> : null}
                      </TableCell>
                      <TableCell><StatusBadge value={e.reason ?? "erased"} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {Object.entries(e.counts).map(([k, v]) => `${v} ${humanize(k).toLowerCase()}`).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-sm">{e.actorName ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground" title={fmtDateTime(e.erasedAt)}>{fmtRelative(e.erasedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : (tab === "due" ? due : held).length === 0 ? (
            tab === "due" ? (
              <EmptyState icon={ShieldQuestionIcon} title="Nothing is due" description={`Profiles appear here after ${policy.retentionMonths} months without activity, or immediately when a candidate withdraws permission to process their profile.`} />
            ) : (
              <EmptyState icon={PauseCircleIcon} title="No holds in place" description="A hold keeps a profile past its retention date for a documented reason — a legal claim, an open dispute, an audit." />
            )
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead>{tab === "hold" ? "Hold" : "Erasure"}</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tab === "due" ? due : held).map((e) => (
                  <TableRow key={e.id} id={`retention-${e.id}`} className={cn(e.id === focusCandidateId && "bg-primary/5 shadow-[inset_3px_0_0_0_var(--primary)]")}>
                    <TableCell>
                      <Link href={`/candidates/${e.id}`} className="font-medium hover:underline">{e.firstName} {e.lastName}</Link>
                      <p className="text-xs text-muted-foreground">{e.email ?? "No email"} · {humanize(e.status)}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={e.reason} />
                      {e.processingWithdrawnAt ? <p className="mt-1 text-xs text-muted-foreground">Withdrawn {fmtDate(e.processingWithdrawnAt)}</p> : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" title={fmtDateTime(e.lastActivityAt)}>{fmtRelative(e.lastActivityAt)}</TableCell>
                    <TableCell>
                      {tab === "hold" ? (
                        <div className="max-w-56">
                          <p className="truncate text-sm" title={e.holdReason ?? undefined}>{e.holdReason}</p>
                          <p className="text-xs text-muted-foreground">{e.holdUntil ? `Until ${fmtDate(e.holdUntil)}` : "Until cleared"}</p>
                        </div>
                      ) : e.eligible ? (
                        <StatusBadge value="eligible_for_erasure" label="Eligible now" />
                      ) : (
                        <div>
                          <StatusBadge value="in_grace_period" label="Grace period" />
                          <p className="mt-1 text-xs text-muted-foreground">From {fmtDate(e.eligibleFrom)}</p>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{e.ownerName ?? "Unassigned"}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1.5">
                        {tab === "hold" ? (
                          <Button variant="outline" size="sm" disabled={clearHold.pending} onClick={() => clearHold.run({ candidateId: e.id, reason: null, until: null })}>
                            Clear hold
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => setHoldFor(e)}>
                            <PauseCircleIcon data-icon="inline-start" />
                            Hold
                          </Button>
                        )}
                        <Button variant={e.eligible && !e.onHold ? "destructive" : "outline"} size="sm" disabled={!e.eligible || e.onHold} onClick={() => setEraseFor(e)} title={e.onHold ? "Clear the hold first" : !e.eligible ? `Possible from ${fmtDate(e.eligibleFrom)}` : undefined}>
                          <EraserIcon data-icon="inline-start" />
                          Erase
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Policy</CardTitle>
              <CardDescription>Applied by the daily maintenance job. Change it in Settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Retention period</span><span className="tabular-nums">{policy.retentionMonths} months</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Grace before erasure</span><span className="tabular-nums">{policy.graceDays} days</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Permission withdrawn</span><span>Due at once</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Live submission or placement</span><span>Never due</span></div>
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href="/admin/settings">Open settings</Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">What erasure does</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
                <li>Replaces name, contact details, date of birth, passport, military and location data with placeholders.</li>
                <li>Deletes uploaded files and their extracted text; redacts AI extraction records and message bodies.</li>
                <li>Cancels open tasks and scrubs notes on activities, interviews, disclosures and consent evidence.</li>
                <li>Keeps submissions, placements, source events and headcount history linked to the erased row.</li>
                <li>Writes an <code className="font-mono text-xs">anonymize</code> audit entry holding counts only.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {holdFor ? <HoldSheet key={holdFor.id} entry={holdFor} onClose={() => setHoldFor(null)} /> : null}
      {eraseFor ? <EraseSheet key={eraseFor.id} entry={eraseFor} onClose={() => setEraseFor(null)} /> : null}
    </>
  );
}

// Each sheet mounts with the entry it edits, so the form's default values come straight from the
// entry and nothing has to be reset while the sheet is open.
function HoldSheet({ entry, onClose }: { entry: RetentionEntry; onClose: () => void }) {
  const router = useRouter();
  const form = useZodForm(holdSchema, { reason: entry.holdReason ?? "", until: entry.holdUntil ?? "" });
  const action = useAction(setRetentionHoldAction, { successMessage: "Retention hold recorded", onSuccess: () => { onClose(); router.refresh(); } });
  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title="Place a retention hold" description={`${entry.firstName} ${entry.lastName} stays out of the erasure queue while the hold is in place.`} size="sm">
      <Form form={form} onSubmit={(v) => action.run({ candidateId: entry.id, reason: v.reason, until: v.until || null })} fieldErrors={action.fieldErrors}>
        <TextareaField name="reason" label="Reason" required placeholder="Open legal claim about the March placement; keep until it is settled." rows={4} hint="Recorded in the audit log with your name." />
        <DateField name="until" label="Hold until" hint="Leave empty for an indefinite hold that must be cleared manually." />
        <SubmitButton pending={action.pending}>Record hold</SubmitButton>
      </Form>
    </SlideOver>
  );
}

function EraseSheet({ entry, onClose }: { entry: RetentionEntry; onClose: () => void }) {
  const router = useRouter();
  const form = useZodForm(eraseSchema, { note: "", confirmation: "" });
  const confirmation = useFieldValue(form, "confirmation");
  const action = useAction(eraseCandidateAction, {
    successMessage: (r) => `Profile erased: ${r.documents} files, ${r.messages} messages and ${r.aiRecords} AI records scrubbed`,
    onSuccess: () => { onClose(); router.refresh(); },
  });
  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title="Erase personal data" description={`${entry.firstName} ${entry.lastName} · ${humanize(entry.reason)} · last activity ${fmtDate(entry.lastActivityAt)}`} size="sm">
      <Alert variant="destructive" className="mb-5">
        <ShieldOffIcon />
        <AlertTitle>This cannot be undone</AlertTitle>
        <AlertDescription>Personal data, files and AI records are removed permanently. Submissions and placements remain, pointing at an anonymised row.</AlertDescription>
      </Alert>
      <Form form={form} onSubmit={(v) => action.run({ candidateId: entry.id, note: v.note || null, confirmation: v.confirmation as "ERASE" })} fieldErrors={action.fieldErrors}>
        <TextareaField name="note" label="Note for the audit log" placeholder="Erasure request received by email on 12 Sep." rows={3} />
        <TextField name="confirmation" label='Type "ERASE" to confirm' required placeholder="ERASE" autoFocus />
        <SubmitButton pending={action.pending} disabled={confirmation !== "ERASE"} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
          Erase this profile
        </SubmitButton>
      </Form>
    </SlideOver>
  );
}
