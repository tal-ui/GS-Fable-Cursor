"use client";

import Link from "next/link";
import { HandshakeIcon } from "lucide-react";
import { DataTable, type Column, type FilterDef, type SavedFilter } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { useViewer } from "@/components/shell/viewer-context";
import { enumOptions } from "@/components/app/form";
import type { PlacementListRow } from "@/server/pipeline/placements";
import type { ListParams, ListResult } from "@/server/list";
import { fmtDate, fmtMoney, fmtRelative } from "@/lib/format";

type Opt = { value: string; label: string };

export const PLACEMENT_STATUSES = enumOptions(["reserved", "started", "active", "extended", "completed", "cancelled", "replaced"]);

export function PlacementsTable({ result, params, savedFilters, users }: { result: ListResult<PlacementListRow>; params: ListParams; savedFilters: SavedFilter[]; users: Opt[] }) {
  const viewer = useViewer();

  const columns: Column<PlacementListRow>[] = [
    {
      id: "candidate",
      header: "Candidate",
      locked: true,
      cell: (r) => (
        <div className="min-w-0">
          <Link href={`/placements/${r.id}`} className="font-medium hover:underline">
            {r.candidateName}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {r.requisitionTitle} · {r.accountName}
          </p>
        </div>
      ),
    },
    { id: "status", header: "Status", sortKey: "status", cell: (r) => <StatusBadge value={r.status} /> },
    {
      id: "dates",
      header: "Planned",
      sortKey: "plannedStart",
      cell: (r) => (
        <span className="text-sm">
          {fmtDate(r.plannedStart)} → {r.plannedEnd ? fmtDate(r.plannedEnd) : <span className="text-muted-foreground">open</span>}
        </span>
      ),
    },
    {
      id: "actual",
      header: "Actual",
      cell: (r) => (r.actualStart ? <span className="text-sm">{fmtDate(r.actualStart)}{r.actualEnd ? ` → ${fmtDate(r.actualEnd)}` : ""}</span> : <span className="text-xs text-muted-foreground">not started</span>),
    },
    {
      id: "checklist",
      header: "Checklist",
      align: "center",
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: r.checklistTotal ? `${Math.round((r.checklistDone / r.checklistTotal) * 100)}%` : "0%" }} />
          </span>
          <span className="tabular-nums text-muted-foreground">
            {r.checklistDone}/{r.checklistTotal}
          </span>
        </span>
      ),
    },
    { id: "bill", header: "Bill rate", defaultHidden: true, cell: (r) => (r.billRateAmount ? fmtMoney(r.billRateAmount, r.billRateCurrency ?? "EUR", r.billRatePeriod) : "—") },
    { id: "owner", header: "Owner", cell: (r) => r.ownerName ?? <span className="text-muted-foreground">Unassigned</span> },
    { id: "updatedAt", header: "Updated", sortKey: "updatedAt", defaultHidden: true, cell: (r) => <span className="text-sm text-muted-foreground">{fmtRelative(r.updatedAt)}</span> },
  ];

  const filters: FilterDef[] = [
    { key: "status", label: "Status", type: "select", options: PLACEMENT_STATUSES },
    { key: "owner", label: "Owner", type: "select", options: users },
    { key: "startingSoon", label: "Starting in the next 14 days", type: "boolean" },
  ];

  return (
    <DataTable
      tableId="placements"
      entity="placements"
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
      searchPlaceholder="Search candidates, requisitions, accounts…"
      canExport={viewer.permissions.export}
      exportPath="/api/export/placements"
      rowHref={(r) => `/placements/${r.id}`}
      emptyIcon={HandshakeIcon}
      emptyTitle="No placements yet"
      emptyDescription="A placement is created automatically when a submission's offer is accepted — that reserves the seat."
    />
  );
}
