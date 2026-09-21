"use client";

import Link from "next/link";
import { Building2Icon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column, type FilterDef, type SavedFilter } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { useQueryFlag } from "@/components/app/use-query-flag";
import { useViewer } from "@/components/shell/viewer-context";
import { COUNTRY_OPTIONS } from "@/components/app/form";
import type { AccountListRow } from "@/server/accounts";
import type { ListParams, ListResult } from "@/server/list";
import { countryName, fmtRelative, humanize } from "@/lib/format";
import { ACCOUNT_STATUSES, ACCOUNT_TYPES, NewAccountSheet } from "./account-form";

type Opt = { value: string; label: string };

export function AccountsTable({ result, params, savedFilters, users, openNew }: { result: ListResult<AccountListRow>; params: ListParams; savedFilters: SavedFilter[]; users: Opt[]; openNew: boolean }) {
  const viewer = useViewer();
  const [newOpen, setNewOpen] = useQueryFlag("new", openNew);
  const canWrite = viewer.permissions.write;

  const columns: Column<AccountListRow>[] = [
    {
      id: "name",
      header: "Account",
      locked: true,
      sortKey: "name",
      cell: (r) => (
        <div className="min-w-0">
          <Link href={`/accounts/${r.id}`} className="font-medium hover:underline">
            {r.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{[humanize(r.type), r.industry].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    { id: "status", header: "Status", sortKey: "status", cell: (r) => <StatusBadge value={r.status} /> },
    { id: "location", header: "Location", cell: (r) => [r.city, countryName(r.country)].filter((x) => x && x !== "—").join(", ") || "—" },
    { id: "openRequisitions", header: "Open reqs", align: "center", cell: (r) => (r.openRequisitions ? <span className="rounded-full bg-primary-soft px-2 text-xs font-medium text-primary">{r.openRequisitions}</span> : <span className="text-muted-foreground">—</span>) },
    { id: "activePlacements", header: "Working", align: "center", cell: (r) => (r.activePlacements ? <span className="rounded-full bg-success-soft px-2 text-xs font-medium text-success-foreground">{r.activePlacements}</span> : <span className="text-muted-foreground">—</span>) },
    { id: "contacts", header: "Contacts", align: "center", defaultHidden: true, cell: (r) => r.contactCount },
    { id: "owner", header: "Owner", cell: (r) => r.ownerName ?? <span className="text-muted-foreground">Unassigned</span> },
    { id: "updatedAt", header: "Updated", sortKey: "updatedAt", cell: (r) => <span className="text-sm text-muted-foreground">{fmtRelative(r.updatedAt)}</span> },
  ];

  const filters: FilterDef[] = [
    { key: "type", label: "Type", type: "select", options: ACCOUNT_TYPES },
    { key: "status", label: "Status", type: "select", options: ACCOUNT_STATUSES },
    { key: "owner", label: "Owner", type: "select", options: users },
    { key: "country", label: "Country", type: "select", options: COUNTRY_OPTIONS },
  ];

  return (
    <>
      <DataTable
        tableId="accounts"
        entity="accounts"
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
        searchPlaceholder="Search accounts, industry, city…"
        canExport={viewer.permissions.export}
        exportPath="/api/export/accounts"
        rowHref={(r) => `/accounts/${r.id}`}
        emptyIcon={Building2Icon}
        emptyTitle="No accounts yet"
        emptyDescription="Create your first employer or partner account to start opening requisitions."
        emptyAction={canWrite ? <Button onClick={() => setNewOpen(true)}><PlusIcon data-icon="inline-start" />New account</Button> : undefined}
        toolbarExtra={canWrite ? <Button onClick={() => setNewOpen(true)}><PlusIcon data-icon="inline-start" />New account</Button> : null}
      />
      {canWrite ? <NewAccountSheet open={newOpen} onOpenChange={setNewOpen} users={users} /> : null}
    </>
  );
}
