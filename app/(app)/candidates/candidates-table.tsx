"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BriefcaseIcon, ClockAlertIcon, ShieldCheckIcon, SparklesIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataTable, type Column, type FilterDef, type SavedFilter } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { SlideOver } from "@/components/app/slide-over";
import { Lookup } from "@/components/app/lookup-field";
import { useAction } from "@/components/app/use-action";
import { useQueryFlag } from "@/components/app/use-query-flag";
import { useViewer } from "@/components/shell/viewer-context";
import { COUNTRY_OPTIONS, enumOptions } from "@/components/app/form";
import { bulkCreateSubmissionsAction } from "@/actions/pipeline";
import { searchRequisitionsAction } from "@/actions/lookups";
import type { CandidateListRow } from "@/server/candidates/queries";
import type { ListParams, ListResult } from "@/server/list";
import { countryName, fmtDate, fmtRelative, fullName } from "@/lib/format";
import { NewCandidateSheet } from "./new-candidate-sheet";

type Opt = { value: string; label: string };

export function CandidatesTable({ result, params, savedFilters, users, sources, openNew }: { result: ListResult<CandidateListRow>; params: ListParams; savedFilters: SavedFilter[]; users: Opt[]; sources: Opt[]; openNew: boolean }) {
  const viewer = useViewer();
  const [newOpen, setNewOpen] = useQueryFlag("new", openNew);
  const canWrite = viewer.permissions.write;

  const columns: Column<CandidateListRow>[] = [
    {
      id: "name",
      header: "Candidate",
      locked: true,
      sortKey: "name",
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <Link href={`/candidates/${r.id}`} className="truncate font-medium hover:underline">
            {fullName(r.firstName, r.lastName)}
          </Link>
          <span className="truncate text-xs text-muted-foreground">{r.headline ?? r.militaryRole ?? r.email ?? "—"}</span>
        </div>
      ),
    },
    { id: "status", header: "Status", sortKey: "status", cell: (r) => <StatusBadge value={r.status} /> },
    {
      id: "location",
      header: "Location",
      sortKey: "country",
      cell: (r) => (
        <span className="text-sm">
          {[r.city, countryName(r.country)].filter((x) => x && x !== "—").join(", ") || <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      id: "skills",
      header: "Skills",
      align: "center",
      cell: (r) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 text-sm tabular-nums">
              {r.skillCount}
              {r.verifiedCount > 0 ? (
                <span className="inline-flex items-center gap-0.5 text-success-foreground">
                  <ShieldCheckIcon className="size-3.5" />
                  {r.verifiedCount}
                </span>
              ) : null}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {r.skillCount} declared · {r.verifiedCount} verified
          </TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: "availability",
      header: "Available",
      cell: (r) =>
        r.availableFrom ? (
          <span className="inline-flex items-center gap-1 text-sm">
            {fmtDate(r.availableFrom)}
            {r.availabilityStale ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <ClockAlertIcon className="size-3.5 text-warning" />
                </TooltipTrigger>
                <TooltipContent>Availability not confirmed recently — recheck before presenting</TooltipContent>
              </Tooltip>
            ) : null}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Unknown</span>
        ),
    },
    { id: "experience", header: "Exp.", align: "right", sortKey: "yearsExperience", defaultHidden: true, cell: (r) => <span className="tabular-nums">{r.yearsExperience ? `${Number(r.yearsExperience)} y` : "—"}</span> },
    { id: "citizenships", header: "Citizenship", defaultHidden: true, cell: (r) => (r.citizenships?.length ? r.citizenships.map(countryName).join(", ") : "—") },
    {
      id: "pipeline",
      header: "Open subs",
      align: "center",
      cell: (r) => (r.openSubmissions ? <span className="rounded-full bg-primary-soft px-2 text-xs font-medium text-primary">{r.openSubmissions}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      id: "suggestions",
      header: "AI review",
      align: "center",
      cell: (r) =>
        r.pendingSuggestions ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 text-xs font-medium text-warning-foreground">
                <SparklesIcon className="size-3" />
                {r.pendingSuggestions}
              </span>
            </TooltipTrigger>
            <TooltipContent>{r.pendingSuggestions} CV extraction suggestions awaiting your decision</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { id: "owner", header: "Owner", cell: (r) => <span className="text-sm">{r.ownerName ?? <span className="text-muted-foreground">Unassigned</span>}</span> },
    { id: "source", header: "Source", defaultHidden: true, cell: (r) => <span className="text-sm">{r.sourceName ?? "—"}</span> },
    { id: "updatedAt", header: "Updated", sortKey: "updatedAt", cell: (r) => <span className="text-sm text-muted-foreground">{fmtRelative(r.updatedAt)}</span> },
    { id: "createdAt", header: "Created", sortKey: "createdAt", defaultHidden: true, cell: (r) => <span className="text-sm text-muted-foreground">{fmtDate(r.createdAt)}</span> },
  ];

  const filters: FilterDef[] = [
    { key: "status", label: "Status", type: "select", options: enumOptions(["new", "screening", "active", "placed", "unavailable", "withdrawn", "archived"]) },
    { key: "owner", label: "Owner", type: "select", options: [{ value: "unassigned", label: "Unassigned" }, ...users] },
    { key: "source", label: "Source", type: "select", options: sources },
    { key: "country", label: "Country", type: "select", options: COUNTRY_OPTIONS },
    { key: "citizenship", label: "Citizenship", type: "select", options: COUNTRY_OPTIONS },
    { key: "verified", label: "Has verified skill", type: "boolean" },
    { key: "relocate", label: "Willing to relocate", type: "boolean" },
    { key: "availableBy", label: "Available by", type: "date" },
  ];

  return (
    <>
      <DataTable
        tableId="candidates"
        entity="candidates"
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
        searchPlaceholder="Search name, email, phone, skill, role…"
        canExport={viewer.permissions.export}
        exportPath="/api/export/candidates"
        selectable={canWrite}
        bulkActions={(ids, clear) => <BulkAddToRequisition ids={ids} onDone={clear} />}
        rowHref={(r) => `/candidates/${r.id}`}
        emptyIcon={UsersIcon}
        emptyTitle="No candidates yet"
        emptyDescription="Add your first candidate manually or import a CSV from a partner agency."
        emptyAction={
          canWrite ? (
            <div className="flex gap-2">
              <Button onClick={() => setNewOpen(true)}>
                <UserPlusIcon data-icon="inline-start" />
                Add candidate
              </Button>
              <Button variant="outline" asChild>
                <Link href="/imports">Import CSV</Link>
              </Button>
            </div>
          ) : undefined
        }
        toolbarExtra={
          canWrite ? (
            <Button onClick={() => setNewOpen(true)}>
              <UserPlusIcon data-icon="inline-start" />
              Add candidate
            </Button>
          ) : null
        }
      />
      {canWrite ? <NewCandidateSheet open={newOpen} onOpenChange={setNewOpen} users={users} sources={sources} /> : null}
    </>
  );
}

function BulkAddToRequisition({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [requisitionId, setRequisitionId] = React.useState<string | null>(null);
  const { run, pending } = useAction(bulkCreateSubmissionsAction, {
    successMessage: (d) => `${d.created.length} candidate${d.created.length === 1 ? "" : "s"} added${d.skipped.length ? ` · ${d.skipped.length} skipped (already submitted or not visible)` : ""}`,
    onSuccess: () => {
      setOpen(false);
      onDone();
      if (requisitionId) router.push(`/requisitions/${requisitionId}`);
    },
  });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <BriefcaseIcon data-icon="inline-start" />
        Add to requisition
      </Button>
      <SlideOver
        open={open}
        onOpenChange={setOpen}
        title={`Add ${ids.length} candidate${ids.length === 1 ? "" : "s"} to a requisition`}
        description="Each candidate gets a submission at the “sourced” stage with a fresh eligibility snapshot. Existing submissions are skipped."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!requisitionId || pending} onClick={() => requisitionId && run({ requisitionId, candidateIds: ids })}>
              Add to requisition
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-sm font-medium">Requisition</p>
          <Lookup value={requisitionId} onChange={(id) => setRequisitionId(id)} fetcher={searchRequisitionsAction} placeholder="Search open requisitions…" />
        </div>
      </SlideOver>
    </>
  );
}
