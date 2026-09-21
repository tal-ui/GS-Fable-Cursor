"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon, CopyIcon, FileSpreadsheetIcon, PlayIcon, RotateCcwIcon, TableIcon, UsersIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { KpiCard } from "@/components/app/kpi-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ConfirmButton } from "@/components/app/confirm-button";
import { useAction } from "@/components/app/use-action";
import { useViewer } from "@/components/shell/viewer-context";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { rollbackImportAction, startImportAction, updateDuplicateDecisionsAction } from "@/actions/imports";
import { CANDIDATE_IMPORT_FIELDS } from "@/lib/imports/csv";
import type { ImportDuplicateProposal, ImportRowError } from "@/db/schema";
import { fmtDateTime } from "@/lib/format";

type Decision = "merge" | "create" | "skip";
export type BatchDetail = {
  id: string;
  filename: string;
  status: "previewed" | "importing" | "completed" | "failed" | "rolled_back";
  mapping: Record<string, string>;
  rows: Record<string, string>[];
  totalRows: number;
  importedRows: number;
  errorRows: number;
  duplicateRows: number;
  errors: ImportRowError[];
  duplicates: ImportDuplicateProposal[];
  createdRecordCount: number;
  createdAt: Date;
  completedAt: Date | null;
  rolledBackAt: Date | null;
  sourceId: string | null;
  sourceName: string | null;
  createdByName: string | null;
};

const DECISIONS: { value: Decision; label: string; description: string }[] = [
  { value: "merge", label: "Merge into existing", description: "Fill empty fields on the existing record and add a re-referral source event." },
  { value: "create", label: "Create anyway", description: "Treat this row as a different person and create a new candidate." },
  { value: "skip", label: "Skip row", description: "Do not import this row at all." },
];

export function ImportBatchView({ batch }: { batch: BatchDetail }) {
  const viewer = useViewer();
  const router = useRouter();
  const canImport = viewer.permissions.bulk;
  const [decisions, setDecisions] = React.useState<Record<number, Decision>>(() => Object.fromEntries(batch.duplicates.map((d) => [d.row, d.decision ?? "merge"])));
  const dirty = batch.duplicates.some((d) => (d.decision ?? "merge") !== decisions[d.row]);

  const saveDecisions = useAction(updateDuplicateDecisionsAction, { successMessage: "Duplicate decisions saved" });
  const start = useAction(startImportAction, { successMessage: "Import started — rows are being committed in the background", onSuccess: () => router.refresh() });
  const rollback = useAction(rollbackImportAction, { successMessage: "Import rolled back — created candidates were soft-deleted", onSuccess: () => router.refresh() });

  // While the job runs, poll so the page flips to "completed" without a manual reload.
  React.useEffect(() => {
    if (batch.status !== "importing") return;
    const handle = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(handle);
  }, [batch.status, router]);

  const errorRowSet = new Set(batch.errors.filter((e) => e.row >= 0).map((e) => e.row));
  const parseErrors = batch.errors.filter((e) => e.row < 0);
  const dupRowSet = new Set(batch.duplicates.map((d) => d.row));
  const skipCount = batch.duplicates.filter((d) => decisions[d.row] === "skip").length;
  const mergeCount = batch.duplicates.filter((d) => decisions[d.row] === "merge").length;
  const expectedCreated = Math.max(0, batch.totalRows - errorRowSet.size - mergeCount - skipCount);
  const fieldLabel = (key: string) => CANDIDATE_IMPORT_FIELDS.find((f) => f.key === key)?.label ?? key;
  const mappedHeaders = Object.entries(batch.mapping);
  const errorsByRow = new Map<number, string[]>();
  for (const e of batch.errors) if (e.row >= 0) errorsByRow.set(e.row, [...(errorsByRow.get(e.row) ?? []), e.message]);

  const persistDecisions = () => saveDecisions.run({ batchId: batch.id, decisions: batch.duplicates.map((d) => ({ row: d.row, decision: decisions[d.row] ?? "merge" })) });

  return (
    <>
      <BreadcrumbLabel segment={batch.id} label={batch.filename} />
      <PageHeader
        eyebrow={
          <Link href="/imports" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeftIcon className="size-3" />
            Imports
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {batch.filename}
            <StatusBadge value={batch.status} className="h-6 px-2.5 text-xs" />
          </span>
        }
        description={`Previewed ${fmtDateTime(batch.createdAt)}${batch.createdByName ? ` by ${batch.createdByName}` : ""}${batch.sourceName ? ` · source: ${batch.sourceName}` : " · no source"}${batch.completedAt ? ` · completed ${fmtDateTime(batch.completedAt)}` : ""}${batch.rolledBackAt ? ` · rolled back ${fmtDateTime(batch.rolledBackAt)}` : ""}`}
        actions={
          canImport ? (
            <>
              {batch.status === "previewed" ? (
                <>
                  {dirty ? (
                    <Button variant="outline" onClick={persistDecisions} disabled={saveDecisions.pending}>
                      {saveDecisions.pending ? <Spinner data-icon="inline-start" /> : null}
                      Save decisions
                    </Button>
                  ) : null}
                  <ConfirmButton
                    title="Start this import?"
                    description={`${expectedCreated.toLocaleString()} candidates will be created, ${mergeCount} merged into existing records and ${errorRowSet.size + skipCount} rows skipped. Rows are committed in the background; you can roll the batch back afterwards.`}
                    confirmLabel="Start import"
                    variant="default"
                    size="default"
                    pending={start.pending}
                    disabled={dirty || expectedCreated + mergeCount === 0}
                    onConfirm={() => start.run({ batchId: batch.id })}
                  >
                    <PlayIcon data-icon="inline-start" />
                    Start import
                  </ConfirmButton>
                </>
              ) : null}
              {batch.status === "completed" && batch.createdRecordCount > 0 ? (
                <ConfirmButton
                  title="Roll back this import?"
                  description={`${batch.createdRecordCount} candidates created by this batch will be soft-deleted. Records that were merged into existing candidates are kept, including their re-referral source events.`}
                  confirmLabel="Roll back"
                  destructive
                  size="default"
                  pending={rollback.pending}
                  onConfirm={() => rollback.run({ batchId: batch.id })}
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  Roll back
                </ConfirmButton>
              ) : null}
            </>
          ) : undefined
        }
      />

      {batch.status === "importing" ? (
        <div className="flex items-center gap-2 rounded-lg border border-info/40 bg-info-soft px-3 py-2 text-sm text-info-foreground">
          <Spinner className="size-4" />
          Committing rows in the background. This page refreshes automatically; the batch owner gets a review task when it finishes.
        </div>
      ) : null}
      {batch.status === "previewed" && dirty ? (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
          <AlertTriangleIcon className="size-4" />
          You changed duplicate decisions. Save them before starting the import.
        </div>
      ) : null}
      {batch.status === "completed" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-success/40 bg-success-soft px-3 py-2 text-sm text-success-foreground">
          <CheckCircle2Icon className="size-4" />
          {batch.importedRows} candidate{batch.importedRows === 1 ? "" : "s"} created, {batch.duplicates.filter((d) => (d.decision ?? "merge") === "merge").length} merged. Imported records carry processing permission only — contact permission stays restricted until each candidate confirms.
          <Button variant="link" size="sm" className="ml-auto h-auto p-0 text-success-foreground underline" asChild>
            <Link href={`/candidates?f_importBatch=${batch.id}`}>Open imported candidates →</Link>
          </Button>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Rows in file" value={batch.totalRows.toLocaleString()} icon={FileSpreadsheetIcon} hint={`${mappedHeaders.length} mapped columns`} />
        <KpiCard label="Valid rows" value={(batch.totalRows - errorRowSet.size).toLocaleString()} icon={CheckCircle2Icon} hint="Pass validation" />
        <KpiCard label="Likely duplicates" value={batch.duplicates.length} icon={CopyIcon} hint={batch.duplicates.length ? `${mergeCount} merge · ${skipCount} skip · ${batch.duplicates.length - mergeCount - skipCount} create` : "Matched on email or phone"} />
        <KpiCard label="Rejected rows" value={errorRowSet.size} icon={AlertTriangleIcon} hint={errorRowSet.size ? "Will be skipped" : "No validation errors"} />
        <KpiCard label={batch.status === "previewed" ? "Will be created" : "Created"} value={(batch.status === "previewed" ? expectedCreated : batch.importedRows).toLocaleString()} icon={UsersIcon} hint={batch.status === "rolled_back" ? "Soft-deleted by rollback" : batch.status === "previewed" ? "After duplicates and errors" : `${batch.createdRecordCount} records linked to this batch`} />
      </section>

      <Tabs defaultValue={batch.duplicates.length ? "duplicates" : errorRowSet.size ? "errors" : "rows"} className="gap-4">
        <TabsList>
          <TabsTrigger value="duplicates">
            Duplicates <Count n={batch.duplicates.length} tone={batch.duplicates.length ? "warning" : undefined} />
          </TabsTrigger>
          <TabsTrigger value="errors">
            Errors <Count n={batch.errors.length} tone={batch.errors.length ? "danger" : undefined} />
          </TabsTrigger>
          <TabsTrigger value="rows">Rows</TabsTrigger>
          <TabsTrigger value="mapping">Mapping</TabsTrigger>
        </TabsList>

        <TabsContent value="duplicates">
          {batch.duplicates.length === 0 ? (
            <EmptyState icon={CopyIcon} title="No likely duplicates" description="No row shares an email or phone with an existing candidate. Names alone are never used to propose a merge." />
          ) : (
            <div className="surface overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 text-xs text-muted-foreground">
                <span>Decide what happens to each row that matches an existing candidate.</span>
                {canImport && batch.status === "previewed" ? (
                  <div className="ml-auto flex items-center gap-1.5">
                    <span>Set all to</span>
                    {DECISIONS.map((d) => (
                      <Button key={d.value} variant="ghost" size="xs" onClick={() => setDecisions(Object.fromEntries(batch.duplicates.map((x) => [x.row, d.value])))}>
                        {d.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Row</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In file</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Existing candidate</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Matched on</TableHead>
                      <TableHead className="w-56 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batch.duplicates.map((d) => {
                      const row = batch.rows[d.row];
                      const name = row ? [valueFor(row, batch.mapping, "firstName"), valueFor(row, batch.mapping, "lastName")].filter(Boolean).join(" ") : `Row ${d.row + 1}`;
                      const contact = row ? [valueFor(row, batch.mapping, "email"), valueFor(row, batch.mapping, "phone")].filter(Boolean).join(" · ") : "";
                      const decision = decisions[d.row] ?? "merge";
                      return (
                        <TableRow key={d.row} className={cn(errorRowSet.has(d.row) && "opacity-60")}>
                          <TableCell className="text-sm tabular-nums text-muted-foreground">{d.row + 1}</TableCell>
                          <TableCell>
                            <p className="font-medium">{name || <span className="text-muted-foreground">(no name)</span>}</p>
                            {contact ? <p className="text-xs text-muted-foreground">{contact}</p> : null}
                            {errorRowSet.has(d.row) ? <p className="text-xs text-danger-foreground">This row also has validation errors and will be skipped.</p> : null}
                          </TableCell>
                          <TableCell>
                            <Link href={`/candidates/${d.existingCandidateId}`} className="font-medium hover:underline">
                              {d.existingLabel}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <span className="flex flex-wrap gap-1">
                              {d.matchedOn.map((m) => (
                                <StatusBadge key={m} value={m} tone="warning" />
                              ))}
                            </span>
                          </TableCell>
                          <TableCell>
                            {canImport && batch.status === "previewed" ? (
                              <Select value={decision} onValueChange={(v) => setDecisions((prev) => ({ ...prev, [d.row]: v as Decision }))}>
                                <SelectTrigger className="h-8 w-full" aria-label={`Decision for row ${d.row + 1}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {DECISIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      <span className="flex flex-col">
                                        <span>{opt.label}</span>
                                        <span className="text-[11px] text-muted-foreground">{opt.description}</span>
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <StatusBadge value={decision} tone={decision === "merge" ? "info" : decision === "skip" ? "neutral" : "success"} label={DECISIONS.find((x) => x.value === decision)?.label} />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {canImport && batch.status === "previewed" && dirty ? (
                <div className="flex justify-end border-t px-4 py-2.5">
                  <Button size="sm" onClick={persistDecisions} disabled={saveDecisions.pending}>
                    {saveDecisions.pending ? <Spinner data-icon="inline-start" /> : null}
                    Save decisions
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="errors">
          {batch.errors.length === 0 ? (
            <EmptyState icon={CheckCircle2Icon} title="Every row passed validation" description="Required names are present and emails, dates, countries and numbers are well-formed." />
          ) : (
            <div className="surface overflow-hidden">
              {parseErrors.length ? (
                <div className="border-b px-4 py-2.5 text-xs text-warning-foreground">
                  <p className="font-medium">File-level warnings</p>
                  <ul className="mt-1 list-inside list-disc">
                    {parseErrors.map((e, i) => (
                      <li key={i}>{e.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Row</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In file</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Problems</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from(errorsByRow.entries())
                      .sort((a, b) => a[0] - b[0])
                      .map(([rowIndex, messages]) => {
                        const row = batch.rows[rowIndex];
                        const name = row ? [valueFor(row, batch.mapping, "firstName"), valueFor(row, batch.mapping, "lastName")].filter(Boolean).join(" ") : "";
                        return (
                          <TableRow key={rowIndex}>
                            <TableCell className="text-sm tabular-nums text-muted-foreground">{rowIndex + 1}</TableCell>
                            <TableCell className="text-sm">{name || <span className="text-muted-foreground">(no name)</span>}</TableCell>
                            <TableCell>
                              <ul className="space-y-0.5 text-sm text-danger-foreground">
                                {messages.map((m, i) => (
                                  <li key={i}>{m}</li>
                                ))}
                              </ul>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">Fix these rows in the spreadsheet and import them in a new batch; rejected rows are never written.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="rows">
          <div className="surface overflow-hidden">
            <div className="flex items-center gap-2 border-b px-4 py-2.5 text-xs text-muted-foreground">
              <TableIcon className="size-3.5" />
              Showing the first {Math.min(batch.rows.length, 200).toLocaleString()} of {batch.totalRows.toLocaleString()} rows as they will be interpreted.
            </div>
            <div className="max-h-[560px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs text-muted-foreground">#</TableHead>
                    <TableHead className="text-xs text-muted-foreground">Outcome</TableHead>
                    {mappedHeaders.map(([header, key]) => (
                      <TableHead key={header} className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {fieldLabel(key)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batch.rows.map((row, i) => (
                    <TableRow key={i} className={cn(errorRowSet.has(i) && "bg-danger-soft/40", !errorRowSet.has(i) && dupRowSet.has(i) && "bg-warning-soft/40")}>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>{errorRowSet.has(i) ? <StatusBadge value="rejected" /> : dupRowSet.has(i) ? <StatusBadge value={decisions[i] ?? "merge"} tone="warning" /> : <StatusBadge value="create" tone="success" label="Create" />}</TableCell>
                      {mappedHeaders.map(([header]) => (
                        <TableCell key={header} className="max-w-[200px] truncate text-sm" title={row[header]}>
                          {row[header] || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="mapping">
          <div className="surface overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CSV column</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Imported as</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappedHeaders.map(([header, key]) => (
                  <TableRow key={header}>
                    <TableCell className="text-sm text-muted-foreground">{header}</TableCell>
                    <TableCell className="text-sm font-medium">{fieldLabel(key)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">The mapping is frozen with the batch so the import can be audited and rolled back exactly as it ran. To change it, create a new preview from the same file.</p>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

function valueFor(row: Record<string, string>, mapping: Record<string, string>, key: string): string {
  const header = Object.entries(mapping).find(([, k]) => k === key)?.[0];
  return header ? row[header] ?? "" : "";
}

function Count({ n, tone }: { n: number; tone?: "warning" | "danger" }) {
  if (!n) return null;
  return <span className={cn("ml-1 rounded-full px-1.5 text-[10px] font-semibold tabular-nums", tone === "danger" ? "bg-danger-soft text-danger-foreground" : tone === "warning" ? "bg-warning-soft text-warning-foreground" : "bg-muted text-muted-foreground")}>{n}</span>;
}
