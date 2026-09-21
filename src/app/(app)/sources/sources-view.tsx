"use client";

import * as React from "react";
import Link from "next/link";
import { ArchiveIcon, MegaphoneIcon, PencilIcon, PlusIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { ConfirmButton } from "@/components/app/confirm-button";
import { SlideOver } from "@/components/app/slide-over";
import { KpiCard } from "@/components/app/kpi-card";
import { Form, FormRow, SelectField, SubmitButton, SwitchField, TextField, TextareaField, enumOptions, useZodForm } from "@/components/app/form";
import { useAction } from "@/components/app/use-action";
import { useQueryFlag } from "@/components/app/use-query-flag";
import { useViewer } from "@/components/shell/viewer-context";
import { archiveSourceAction, upsertSourceAction } from "@/actions/crm";
import { sourceSchema } from "@/lib/schemas/crm";
import { fmtPercent, humanize } from "@/lib/format";
import type { sources } from "@/db/schema";

type Source = typeof sources.$inferSelect;
type Row = { source: Source; candidates: number; events: number; presented: number; accepted: number; started: number };

export const SOURCE_TYPES = enumOptions(["agency", "referral", "job_board", "website", "social", "import", "walk_in", "partner", "other"]);

export function SourcesView({ rows, openNew }: { rows: Row[]; openNew: boolean }) {
  const viewer = useViewer();
  const canWrite = viewer.permissions.write;
  const isAdmin = viewer.permissions.admin;
  const [newOpen, setNewOpen] = useQueryFlag("new", openNew);
  const [editing, setEditing] = React.useState<Source | null>(null);
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState<"active" | "all">("active");
  const archive = useAction(archiveSourceAction, { successMessage: "Source archived" });

  const visible = rows.filter((r) => (tab === "all" || r.source.isActive) && (!q || r.source.name.toLowerCase().includes(q.toLowerCase()) || r.source.type.includes(q.toLowerCase())));
  const totals = rows.reduce((t, r) => ({ candidates: t.candidates + r.candidates, presented: t.presented + r.presented, started: t.started + r.started }), { candidates: 0, presented: 0, started: 0 });
  const best = [...rows].filter((r) => r.candidates >= 3).sort((a, b) => b.started / b.candidates - a.started / a.candidates)[0];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active sources" value={rows.filter((r) => r.source.isActive).length} hint={`${rows.length} total`} />
        <KpiCard label="Candidates attributed" value={totals.candidates} hint="Distinct candidates with a source event" />
        <KpiCard label="Presented → started" value={totals.presented ? fmtPercent(totals.started / totals.presented) : "—"} hint={`${totals.started} started of ${totals.presented} presented`} />
        <KpiCard label="Best converting" value={best ? best.source.name : "—"} hint={best ? `${fmtPercent(best.started / best.candidates)} of candidates started` : "Needs 3+ candidates per source"} />
      </div>

      <div className="surface">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sources…" className="h-9 w-64" />
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
          {canWrite ? (
            <Button className="ml-auto" size="sm" onClick={() => setNewOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              New source
            </Button>
          ) : null}
        </div>
        {visible.length === 0 ? (
          <EmptyState icon={MegaphoneIcon} title={rows.length === 0 ? "No sources yet" : "No sources match"} description={rows.length === 0 ? "Add the agencies, referrers and job boards you get candidates from so every intake can be attributed." : "Try another search or show archived sources."} action={canWrite && rows.length === 0 ? <Button onClick={() => setNewOpen(true)}>Add a source</Button> : undefined} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Candidates</TableHead>
                <TableHead className="text-right">Presented</TableHead>
                <TableHead className="text-right">Accepted</TableHead>
                <TableHead className="text-right">Started</TableHead>
                <TableHead>Conversion</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => {
                const conv = r.candidates ? r.started / r.candidates : 0;
                return (
                  <TableRow key={r.source.id} className={cn(!r.source.isActive && "opacity-60")}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link href={`/candidates?f_source=${r.source.id}`} className="font-medium hover:underline">
                          {r.source.name}
                        </Link>
                        {!r.source.isActive ? <StatusBadge value="inactive" /> : null}
                      </div>
                      {r.source.commissionTerms ? <p className="max-w-xs truncate text-xs text-muted-foreground">{r.source.commissionTerms}</p> : null}
                    </TableCell>
                    <TableCell>{humanize(r.source.type)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.candidates}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.presented}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.accepted}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.started}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round(conv * 100))}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">{r.candidates ? fmtPercent(conv) : "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.source.contactName ?? "—"}
                      {r.source.contactEmail ? <div>{r.source.contactEmail}</div> : null}
                    </TableCell>
                    <TableCell>
                      {canWrite ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" aria-label="Edit source" onClick={() => setEditing(r.source)}>
                            <PencilIcon />
                          </Button>
                          {isAdmin && r.source.isActive ? (
                            <ConfirmButton title="Archive this source?" description="Existing attributions are kept; the source can no longer be chosen for new candidates." confirmLabel="Archive" variant="ghost" size="icon-sm" onConfirm={() => archive.run({ id: r.source.id })}>
                              <ArchiveIcon />
                            </ConfirmButton>
                          ) : null}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
      {canWrite ? (
        <>
          <SourceSheet open={newOpen} onOpenChange={setNewOpen} source={null} />
          {editing ? <SourceSheet open onOpenChange={(o) => !o && setEditing(null)} source={editing} /> : null}
        </>
      ) : null}
    </>
  );
}

function SourceSheet({ open, onOpenChange, source }: { open: boolean; onOpenChange: (o: boolean) => void; source: Source | null }) {
  const form = useZodForm(sourceSchema, {
    id: source?.id ?? "",
    name: source?.name ?? "",
    type: source?.type ?? "agency",
    contactName: source?.contactName ?? "",
    contactEmail: source?.contactEmail ?? "",
    contactPhone: source?.contactPhone ?? "",
    commissionTerms: source?.commissionTerms ?? "",
    isActive: source?.isActive ?? true,
  });
  const { run, pending, fieldErrors } = useAction(upsertSourceAction, {
    successMessage: source ? "Source updated" : "Source created",
    onSuccess: () => {
      onOpenChange(false);
      form.reset();
    },
  });
  return (
    <SlideOver open={open} onOpenChange={onOpenChange} title={source ? "Edit source" : "New source"} description="Sources are attached to candidates at intake and on import so conversion can be attributed." size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <TextField name="name" label="Name" placeholder="e.g. Baltic Marine Agency, LinkedIn, Employee referral" required autoFocus />
        <SelectField name="type" label="Type" options={SOURCE_TYPES} required />
        <FormRow>
          <TextField name="contactName" label="Contact name" />
          <TextField name="contactPhone" label="Contact phone" />
        </FormRow>
        <TextField name="contactEmail" label="Contact email" type="email" />
        <TextareaField name="commissionTerms" label="Commission / referral terms" placeholder="e.g. 12% of first-year billing, paid after 8 weeks worked" />
        <SwitchField name="isActive" label="Active" description="Inactive sources stay attributed but cannot be chosen for new candidates." />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>{source ? "Save" : "Create source"}</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}
