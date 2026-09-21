"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GitBranchIcon, ShieldAlertIcon } from "lucide-react";
import { cn } from "cn";
import { DataTable, type Column, type FilterDef, type SavedFilter } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { useViewer } from "@/components/shell/viewer-context";
import type { SubmissionListRow } from "@/server/pipeline/submissions";
import type { ListParams, ListResult } from "@/server/list";
import { fmtRelative, humanize } from "@/lib/format";
import { enumOptions } from "@/components/app/form";

type Opt = { value: string; label: string };

export const OPEN_STAGE_ORDER = ["sourced", "contacted", "interested", "screening", "interviewing", "presented", "customer_review", "offered", "accepted"] as const;
export const CLOSED_STAGE_ORDER = ["placed", "declined_by_candidate", "rejected_by_customer", "withdrawn", "not_eligible"] as const;
export const STAGE_OPTIONS = enumOptions([...OPEN_STAGE_ORDER, ...CLOSED_STAGE_ORDER]);
export const ELIGIBILITY_OPTIONS = enumOptions(["eligible", "review", "ineligible"]);

export function SubmissionsTable({ result, params, savedFilters, users, counts }: { result: ListResult<SubmissionListRow>; params: ListParams; savedFilters: SavedFilter[]; users: Opt[]; counts: Record<string, number> }) {
  const viewer = useViewer();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeStage = params.filters.stage;

  const setStage = (stage: string | null) => {
    const p = new URLSearchParams(searchParams.toString());
    if (stage) p.set("f_stage", stage);
    else p.delete("f_stage");
    p.delete("page");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const columns: Column<SubmissionListRow>[] = [
    {
      id: "candidate",
      header: "Candidate",
      locked: true,
      cell: (r) => (
        <div className="min-w-0">
          <Link href={`/submissions/${r.id}`} className="font-medium hover:underline">
            {r.candidateName}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{r.candidateHeadline ?? "—"}</p>
        </div>
      ),
    },
    {
      id: "requisition",
      header: "Requisition",
      cell: (r) => (
        <div className="min-w-0">
          <Link href={`/requisitions/${r.requisitionId}`} className="hover:underline">
            {r.requisitionTitle}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{r.accountName}</p>
        </div>
      ),
    },
    { id: "stage", header: "Stage", sortKey: "stage", cell: (r) => <StatusBadge value={r.stage} /> },
    { id: "eligibility", header: "Eligibility", sortKey: "eligibility", cell: (r) => <StatusBadge value={r.eligibility} /> },
    { id: "matchScore", header: "Score", sortKey: "matchScore", align: "right", cell: (r) => (r.matchScore !== null ? <span className="tabular-nums">{Math.round(Number(r.matchScore))}</span> : <span className="text-muted-foreground">—</span>) },
    {
      id: "readiness",
      header: "Readiness",
      cell: (r) => (
        <div className="flex gap-1" title="Interest confirmed · Sharing permission">
          <span className={cn("size-2 rounded-full", r.interestConfirmedAt ? "bg-success" : "bg-muted-foreground/30")} aria-label={r.interestConfirmedAt ? "Interest confirmed" : "Interest not confirmed"} />
          <span className={cn("size-2 rounded-full", r.hasSharingConsent ? "bg-success" : "bg-muted-foreground/30")} aria-label={r.hasSharingConsent ? "Sharing permission on file" : "No sharing permission"} />
          {r.presentedAt ? <span className="ml-1 text-[11px] text-muted-foreground">presented</span> : null}
        </div>
      ),
    },
    { id: "owner", header: "Owner", cell: (r) => r.ownerName ?? <span className="text-muted-foreground">Unassigned</span> },
    { id: "stageChangedAt", header: "In stage since", sortKey: "stageChangedAt", cell: (r) => <span className="text-sm text-muted-foreground">{fmtRelative(r.stageChangedAt)}</span> },
    { id: "createdAt", header: "Submitted", sortKey: "createdAt", defaultHidden: true, cell: (r) => <span className="text-sm text-muted-foreground">{fmtRelative(r.createdAt)}</span> },
  ];

  const filters: FilterDef[] = [
    { key: "stage", label: "Stage", type: "select", options: STAGE_OPTIONS },
    { key: "eligibility", label: "Eligibility", type: "select", options: ELIGIBILITY_OPTIONS },
    { key: "owner", label: "Owner", type: "select", options: users },
    { key: "stalled", label: "Stalled only", type: "boolean" },
    { key: "includeClosed", label: "Include closed stages", type: "boolean" },
  ];

  const openTotal = OPEN_STAGE_ORDER.reduce((s, k) => s + (counts[k] ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="surface overflow-x-auto">
        <div className="flex min-w-max items-stretch divide-x">
          <button type="button" onClick={() => setStage(null)} className={cn("flex min-w-[96px] flex-col items-start px-4 py-3 text-left hover:bg-muted/50", !activeStage && "bg-primary-soft/40")}>
            <span className="text-xl font-semibold tabular-nums">{openTotal}</span>
            <span className="text-xs text-muted-foreground">All open</span>
          </button>
          {OPEN_STAGE_ORDER.map((stage) => (
            <button key={stage} type="button" onClick={() => setStage(activeStage === stage ? null : stage)} className={cn("flex min-w-[96px] flex-col items-start px-4 py-3 text-left hover:bg-muted/50", activeStage === stage && "bg-primary-soft/40")}>
              <span className="text-xl font-semibold tabular-nums">{counts[stage] ?? 0}</span>
              <span className="text-xs text-muted-foreground">{humanize(stage)}</span>
            </button>
          ))}
          <div className="flex items-center gap-3 px-4 text-xs text-muted-foreground">
            {CLOSED_STAGE_ORDER.map((stage) => (
              <button key={stage} type="button" onClick={() => setStage(activeStage === stage ? null : stage)} className={cn("hover:text-foreground", activeStage === stage && "font-semibold text-foreground")}>
                {counts[stage] ?? 0} {humanize(stage).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
      <DataTable
        tableId="submissions"
        entity="submissions"
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
        exportPath="/api/export/submissions"
        rowHref={(r) => `/submissions/${r.id}`}
        emptyIcon={activeStage ? ShieldAlertIcon : GitBranchIcon}
        emptyTitle={activeStage ? `Nothing in ${humanize(activeStage).toLowerCase()}` : "No submissions yet"}
        emptyDescription={activeStage ? "Pick another stage or clear the filter." : "Submissions are created from a requisition's matching workspace or from a candidate's profile."}
      />
    </div>
  );
}
