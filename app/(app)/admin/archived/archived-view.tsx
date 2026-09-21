"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArchiveRestoreIcon, Building2Icon, UserRoundIcon } from "lucide-react";
import { restoreRecordAction } from "@/actions/admin";
import { EmptyState } from "@/components/app/empty-state";
import { KpiCard } from "@/components/app/kpi-card";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import type { ArchivedEntity, ArchivedRecord } from "@/server/archive";

type Tab = "all" | ArchivedEntity;

export function ArchivedView({ records }: { records: ArchivedRecord[] }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("all");
  const [q, setQ] = React.useState("");
  const [restoringId, setRestoringId] = React.useState<string | null>(null);
  const restore = useAction(restoreRecordAction, {
    successMessage: (r) => `${r.label} restored — it is back in ${r.entityType === "candidate" ? "the candidate pool" : "Accounts"}`,
    onSuccess: () => router.refresh(),
  });

  const counts = { candidate: records.filter((r) => r.entityType === "candidate").length, account: records.filter((r) => r.entityType === "account").length };
  const visible = records
    .filter((r) => tab === "all" || r.entityType === tab)
    .filter((r) => !q || `${r.label} ${r.detail ?? ""} ${r.ownerName ?? ""} ${r.archivedByName ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  const onRestore = async (r: ArchivedRecord) => {
    setRestoringId(r.id);
    await restore.run({ entityType: r.entityType, id: r.id });
    setRestoringId(null);
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Archived records" value={records.length} hint="Hidden from lists, search and matching" icon={ArchiveRestoreIcon} />
        <KpiCard label="Candidates" value={counts.candidate} hint="Profiles kept with their history" icon={UserRoundIcon} />
        <KpiCard label="Accounts" value={counts.account} hint="Employers and partners" icon={Building2Icon} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="surface min-w-0">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, owner, archived by…" className="h-9 w-64" />
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList>
                <TabsTrigger value="all">All {records.length ? `(${records.length})` : ""}</TabsTrigger>
                <TabsTrigger value="candidate">Candidates {counts.candidate ? `(${counts.candidate})` : ""}</TabsTrigger>
                <TabsTrigger value="account">Accounts {counts.account ? `(${counts.account})` : ""}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={ArchiveRestoreIcon}
              title={records.length === 0 ? "Nothing is archived" : "No archived records match"}
              description={records.length === 0 ? "When staff archive a candidate or an account it appears here so a Super Admin can bring it back." : "Try a different name or clear the search."}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Record</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Archived by</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={`${r.entityType}-${r.id}`}>
                    <TableCell>
                      <p className="font-medium">{r.label}</p>
                      {r.detail ? <p className="text-xs text-muted-foreground">{r.detail}</p> : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={r.entityType} tone="neutral" label={r.entityType === "candidate" ? "Candidate" : "Account"} />
                    </TableCell>
                    <TableCell className="text-sm">{r.ownerName ?? "Unassigned"}</TableCell>
                    <TableCell className="text-sm">{r.archivedByName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground" title={fmtDateTime(r.archivedAt)}>
                      {fmtRelative(r.archivedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" disabled={restore.pending} onClick={() => onRestore(r)}>
                        <ArchiveRestoreIcon data-icon="inline-start" />
                        {restoringId === r.id && restore.pending ? "Restoring…" : "Restore"}
                      </Button>
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
              <CardTitle className="text-base">How archiving works</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
                <li>Nothing is deleted. The record is flagged and leaves every list, search and matching run.</li>
                <li>A candidate with an open submission or an active placement cannot be archived; an account with an open requisition cannot either.</li>
                <li>Restoring clears the flag. Submissions, placements, documents and activity were kept the whole time.</li>
                <li>
                  Every archive and restore is written to the <Link href="/admin/logs" className="underline underline-offset-2">change log</Link> with the person who did it.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
