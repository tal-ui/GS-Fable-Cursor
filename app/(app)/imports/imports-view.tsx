"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DownloadIcon, FileSpreadsheetIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { KpiCard } from "@/components/app/kpi-card";
import { useQueryFlag } from "@/components/app/use-query-flag";
import { useViewer } from "@/components/shell/viewer-context";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { IMPORT_TEMPLATE_CSV } from "@/lib/imports/csv";
import { ImportWizard } from "./import-wizard";

type Opt = { value: string; label: string };
export type BatchRow = {
  id: string;
  filename: string;
  status: "previewed" | "importing" | "completed" | "failed" | "rolled_back";
  totalRows: number;
  importedRows: number;
  errorRows: number;
  duplicateRows: number;
  createdAt: Date;
  completedAt: Date | null;
  sourceName: string | null;
  createdByName: string | null;
};

export function ImportsView({ batches, sources, openNew }: { batches: BatchRow[]; sources: Opt[]; openNew: boolean }) {
  const viewer = useViewer();
  const router = useRouter();
  const canImport = viewer.permissions.bulk;
  const [wizardOpen, setWizardOpen] = useQueryFlag("new", openNew && canImport);

  const totals = batches.reduce(
    (t, b) => ({ imported: t.imported + (b.status === "completed" ? b.importedRows : 0), errors: t.errors + b.errorRows, pending: t.pending + (b.status === "previewed" ? 1 : 0), running: t.running + (b.status === "importing" ? 1 : 0) }),
    { imported: 0, errors: 0, pending: 0, running: 0 },
  );

  const templateHref = React.useMemo(() => `data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE_CSV)}`, []);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Batches" value={batches.length} hint={`${totals.running} importing · ${totals.pending} awaiting review`} icon={FileSpreadsheetIcon} />
        <KpiCard label="Candidates imported" value={totals.imported.toLocaleString()} hint="Across completed batches" />
        <KpiCard label="Rejected rows" value={totals.errors.toLocaleString()} hint="Rows that failed validation" />
        <KpiCard label="Awaiting commit" value={totals.pending} hint="Previewed batches not yet imported" />
      </div>

      <div className="surface">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Import batches</h2>
          <span className="text-xs text-muted-foreground">Latest 50</span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={templateHref} download="candidate-import-template.csv">
                <DownloadIcon data-icon="inline-start" />
                CSV template
              </a>
            </Button>
            {canImport ? (
              <Button size="sm" onClick={() => setWizardOpen(true)}>
                <UploadIcon data-icon="inline-start" />
                Import candidates
              </Button>
            ) : null}
          </div>
        </div>
        {batches.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheetIcon}
            title="No imports yet"
            description={canImport ? "Upload a CSV of candidates. You will map the columns, review errors and likely duplicates, and only then commit." : "Imports are run by Standard users and Super Admins. Completed batches will be listed here."}
            action={canImport ? <Button onClick={() => setWizardOpen(true)}>Import your first file</Button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">File</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rows</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Imported</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duplicates</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Errors</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">By</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id} className="cursor-pointer" onClick={(e) => !(e.target as HTMLElement).closest("a,button") && router.push(`/imports/${b.id}`)}>
                    <TableCell>
                      <Link href={`/imports/${b.id}`} className="font-medium hover:underline">
                        {b.filename}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={b.status} />
                    </TableCell>
                    <TableCell className="text-sm">{b.sourceName ?? <span className="text-muted-foreground">No source</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.totalRows.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.status === "completed" || b.status === "rolled_back" ? b.importedRows.toLocaleString() : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.duplicateRows ? <span className="text-warning-foreground">{b.duplicateRows}</span> : 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.errorRows ? <span className="text-danger-foreground">{b.errorRows}</span> : 0}</TableCell>
                    <TableCell className="text-sm">{b.createdByName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground" title={fmtDateTime(b.createdAt)}>
                      {fmtRelative(b.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {canImport ? <ImportWizard open={wizardOpen} onOpenChange={setWizardOpen} sources={sources} /> : null}
    </>
  );
}
