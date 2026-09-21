"use client";

import Link from "next/link";
import { BriefcaseIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column, type FilterDef, type SavedFilter } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { useQueryFlag } from "@/components/app/use-query-flag";
import { useViewer } from "@/components/shell/viewer-context";
import { COUNTRY_OPTIONS } from "@/components/app/form";
import type { RequisitionListRow } from "@/server/requisitions";
import type { ListParams, ListResult } from "@/server/list";
import { countryName, fmtDate, fmtRelative } from "@/lib/format";
import { NewRequisitionSheet, PRIORITIES, REQUISITION_STATUSES } from "./requisition-form";

type Opt = { value: string; label: string };

export function RequisitionsTable({
  result,
  params,
  savedFilters,
  users,
  roleFamilies,
  openNew,
  presetAccount,
}: {
  result: ListResult<RequisitionListRow>;
  params: ListParams;
  savedFilters: SavedFilter[];
  users: Opt[];
  roleFamilies: Opt[];
  openNew: boolean;
  presetAccount?: { id: string; label: string } | null;
}) {
  const viewer = useViewer();
  const [newOpen, setNewOpen] = useQueryFlag("new", openNew);
  const canWrite = viewer.permissions.write;

  const columns: Column<RequisitionListRow>[] = [
    {
      id: "title",
      header: "Requisition",
      locked: true,
      sortKey: "title",
      cell: (r) => (
        <div className="min-w-0">
          <Link href={`/requisitions/${r.id}`} className="font-medium hover:underline">
            {r.title}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            <Link href={`/accounts/${r.accountId}`} className="hover:underline">
              {r.accountName}
            </Link>
            {r.roleFamilyName ? ` · ${r.roleFamilyName}` : ""}
          </p>
        </div>
      ),
    },
    { id: "status", header: "Status", sortKey: "status", cell: (r) => <StatusBadge value={r.status} /> },
    { id: "priority", header: "Priority", sortKey: "priority", cell: (r) => <StatusBadge value={r.priority} /> },
    {
      id: "seats",
      header: "Seats",
      align: "center",
      cell: (r) => (
        <span className="inline-flex items-baseline gap-1 text-sm" title={`${r.seatsTaken} of ${r.headcountApproved} seats taken`}>
          <span className={r.openSeats > 0 && r.status === "open" ? "font-semibold text-primary" : "font-medium"}>{r.openSeats}</span>
          <span className="text-xs text-muted-foreground">open / {r.headcountApproved}</span>
        </span>
      ),
    },
    { id: "location", header: "Location", cell: (r) => [r.locationCity, countryName(r.locationCountry)].filter((x) => x && x !== "—").join(", ") || "—" },
    { id: "startDate", header: "Start", sortKey: "startDate", cell: (r) => (r.startDate ? fmtDate(r.startDate) : <span className="text-muted-foreground">TBD</span>) },
    {
      id: "pipeline",
      header: "Pipeline",
      align: "center",
      cell: (r) => (
        <span className="text-sm">
          <span className="font-medium">{r.activeSubmissions}</span>
          <span className="text-xs text-muted-foreground"> active / {r.submissionCount}</span>
        </span>
      ),
    },
    { id: "version", header: "Req. version", align: "center", defaultHidden: true, cell: (r) => <span className="text-xs text-muted-foreground">v{r.currentVersion}</span> },
    { id: "owner", header: "Owner", cell: (r) => r.ownerName ?? <span className="text-muted-foreground">Unassigned</span> },
    { id: "lastActivity", header: "Last stage move", defaultHidden: true, cell: (r) => <span className="text-sm text-muted-foreground">{r.lastActivityAt ? fmtRelative(r.lastActivityAt) : "—"}</span> },
    { id: "updatedAt", header: "Updated", sortKey: "updatedAt", cell: (r) => <span className="text-sm text-muted-foreground">{fmtRelative(r.updatedAt)}</span> },
  ];

  const filters: FilterDef[] = [
    { key: "status", label: "Status", type: "select", options: REQUISITION_STATUSES },
    { key: "priority", label: "Priority", type: "select", options: PRIORITIES },
    { key: "owner", label: "Owner", type: "select", options: users },
    { key: "country", label: "Country", type: "select", options: COUNTRY_OPTIONS },
    { key: "roleFamily", label: "Role family", type: "select", options: roleFamilies },
  ];

  return (
    <>
      <DataTable
        tableId="requisitions"
        entity="requisitions"
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
        searchPlaceholder="Search titles, accounts, cities, sites…"
        canExport={viewer.permissions.export}
        exportPath="/api/export/requisitions"
        rowHref={(r) => `/requisitions/${r.id}`}
        emptyIcon={BriefcaseIcon}
        emptyTitle="No requisitions yet"
        emptyDescription="A requisition is a customer's demand: seats, dates, rates and the requirements candidates are matched against."
        emptyAction={canWrite ? <Button onClick={() => setNewOpen(true)}><PlusIcon data-icon="inline-start" />New requisition</Button> : undefined}
        toolbarExtra={canWrite ? <Button onClick={() => setNewOpen(true)}><PlusIcon data-icon="inline-start" />New requisition</Button> : null}
      />
      {canWrite ? <NewRequisitionSheet open={newOpen} onOpenChange={setNewOpen} users={users} roleFamilies={roleFamilies} presetAccount={presetAccount} /> : null}
    </>
  );
}
