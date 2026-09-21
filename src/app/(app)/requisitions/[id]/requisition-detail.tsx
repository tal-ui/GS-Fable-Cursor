"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon, ChevronDownIcon, ClipboardListIcon, GitBranchIcon, HistoryIcon, PencilIcon, SparklesIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DetailLayout, DetailSection, FieldGrid, FieldRow, SidePanel } from "@/components/app/detail-layout";
import { InlineField } from "@/components/app/inline-field";
import { StatusBadge } from "@/components/app/status-badge";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { EmptyState } from "@/components/app/empty-state";
import { RichText, RichTextEditor } from "@/components/app/rich-text";
import { CreateTaskSheet } from "@/components/app/create-task-sheet";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { COUNTRY_OPTIONS, CURRENCY_OPTIONS, PERIOD_OPTIONS } from "@/components/app/form";
import { useAction } from "@/components/app/use-action";
import { useNow } from "@/components/app/use-now";
import { changeRequisitionStatusAction, updateRequisitionAction } from "@/actions/crm";
import type { RequisitionDetail } from "@/server/requisitions";
import { fmtDate, fmtDateTime, fmtMoney, fmtPercent, fmtRelative, initials } from "@/lib/format";
import { PRIORITIES } from "../requisition-form";
import { RequirementList, RequirementsEditor } from "./requirements-editor";

type Opt = { value: string; label: string };
type Patch = Parameters<typeof updateRequisitionAction>[0];
type Status = RequisitionDetail["requisition"]["status"];

const STATUS_TRANSITIONS: Record<Status, { to: Status; label: string; needsReason?: boolean; destructive?: boolean }[]> = {
  draft: [{ to: "open", label: "Open for matching" }, { to: "cancelled", label: "Cancel", needsReason: true, destructive: true }],
  open: [{ to: "on_hold", label: "Put on hold" }, { to: "filled", label: "Mark filled" }, { to: "closed", label: "Close", needsReason: true }, { to: "cancelled", label: "Cancel", needsReason: true, destructive: true }],
  on_hold: [{ to: "open", label: "Reopen" }, { to: "closed", label: "Close", needsReason: true }, { to: "cancelled", label: "Cancel", needsReason: true, destructive: true }],
  filled: [{ to: "open", label: "Reopen (more seats)" }, { to: "closed", label: "Close", needsReason: true }],
  closed: [{ to: "open", label: "Reopen" }],
  cancelled: [{ to: "draft", label: "Restore as draft" }],
};

export function RequisitionDetailView({ detail, users, roleFamilies, contacts, canEdit }: { detail: RequisitionDetail; users: Opt[]; roleFamilies: Opt[]; contacts: Opt[]; canEdit: boolean }) {
  const now = useNow();
  const router = useRouter();
  const r = detail.requisition;
  const readOnly = !canEdit;
  const [taskOpen, setTaskOpen] = React.useState(false);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [descDraft, setDescDraft] = React.useState<string | null>(null);
  const [statusTarget, setStatusTarget] = React.useState<{ to: Status; label: string } | null>(null);
  const [closeReason, setCloseReason] = React.useState("");

  const update = useAction(updateRequisitionAction, { silent: true });
  const patch = (field: keyof Omit<Patch, "id">) => (value: string | number | boolean | null) => update.run({ id: r.id, [field]: value === null ? "" : value } as Patch);
  const saveDesc = useAction(updateRequisitionAction, { successMessage: "Description saved", onSuccess: () => setDescDraft(null) });
  const status = useAction(changeRequisitionStatusAction, {
    successMessage: (d) => `Requisition is now ${d.status.replace(/_/g, " ")}`,
    onSuccess: () => {
      setStatusTarget(null);
      setCloseReason("");
      router.refresh();
    },
  });

  const mandatory = detail.requirements.filter((x) => x.kind === "mandatory");
  const canOpen = detail.requirementIssues.length === 0 && mandatory.length > 0;
  const seatPct = detail.seats.headcount ? Math.round((detail.seats.seatsTaken / detail.seats.headcount) * 100) : 0;
  const openSubs = detail.submissions.filter((s) => !["placed", "declined_by_candidate", "rejected_by_customer", "withdrawn", "not_eligible"].includes(s.submission.stage));

  const runStatus = (t: { to: Status; label: string; needsReason?: boolean }) => {
    if (t.needsReason) setStatusTarget(t);
    else void status.run({ id: r.id, status: t.to });
  };

  return (
    <>
      <BreadcrumbLabel segment={r.id} label={r.title} />
      <DetailLayout
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="icon-sm" asChild aria-label="Back to requisitions">
              <Link href="/requisitions">
                <ArrowLeftIcon />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                <span className="truncate">{r.title}</span>
                <StatusBadge value={r.status} />
                <StatusBadge value={r.priority} />
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                <Link href={`/accounts/${detail.account.id}`} className="hover:underline">
                  {detail.account.name}
                </Link>
                {" · "}
                {detail.seats.open} of {detail.seats.headcount} seats open · requirements v{r.currentVersion} · updated {fmtRelative(r.updatedAt)}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/requisitions/${r.id}/match`}>
                  <SparklesIcon data-icon="inline-start" />
                  Find matches
                </Link>
              </Button>
              {canEdit ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setTaskOpen(true)}>
                    <ClipboardListIcon data-icon="inline-start" />
                    Task
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}>
                    <PencilIcon data-icon="inline-start" />
                    Edit requirements
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" disabled={status.pending}>
                        Status
                        <ChevronDownIcon data-icon="inline-end" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Move requisition to…</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {STATUS_TRANSITIONS[r.status].map((t) => (
                        <DropdownMenuItem key={t.to} onSelect={() => runStatus(t)} disabled={t.to === "open" && !canOpen} variant={t.destructive ? "destructive" : "default"}>
                          {t.label}
                          {t.to === "open" && !canOpen ? <span className="ml-auto text-xs text-muted-foreground">needs rules</span> : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : null}
            </div>
          </div>
        }
        main={
          <>
            {r.status === "draft" && !canOpen ? (
              <Alert>
                <AlertTriangleIcon />
                <AlertTitle>Not ready to open</AlertTitle>
                <AlertDescription>
                  {mandatory.length === 0 ? "Add at least one mandatory eligibility rule (work authorisation, availability, core skill) before this requisition can be opened for matching." : detail.requirementIssues[0]}
                </AlertDescription>
              </Alert>
            ) : null}
            {detail.requirementIssues.length > 0 && r.status !== "draft" ? (
              <Alert variant="destructive">
                <AlertTriangleIcon />
                <AlertTitle>Requirement problems</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {detail.requirementIssues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}

            <DetailSection
              title={`Requirements · v${r.currentVersion}`}
              count={detail.requirements.length}
              description="Mandatory rules decide eligibility and each one carries a business justification. Preferred rules only influence ranking. Every save creates a new version; matches are recomputed automatically."
              actions={canEdit ? <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}><PencilIcon data-icon="inline-start" />Edit</Button> : undefined}
            >
              {detail.requirements.length === 0 ? (
                <EmptyState compact icon={ClipboardListIcon} title="No requirements yet" description="Without rules every candidate is 'unknown'. Start with work authorisation, availability and the core skill." action={canEdit ? <Button variant="outline" onClick={() => setEditorOpen(true)}>Add requirements</Button> : undefined} className="border-dashed" />
              ) : (
                <RequirementList requirements={detail.requirements} fallbackCountry={r.locationCountry} />
              )}
            </DetailSection>

            <DetailSection title="Requisition">
              <FieldGrid cols={3}>
                <InlineField label="Title" value={r.title} onSave={patch("title")} readOnly={readOnly} className="sm:col-span-2" />
                <InlineField label="Priority" value={r.priority} kind="select" options={PRIORITIES} display={<StatusBadge value={r.priority} />} onSave={patch("priority")} readOnly={readOnly} />
                <FieldRow label="Account">
                  <Link href={`/accounts/${detail.account.id}`} className="text-primary hover:underline">
                    {detail.account.name}
                  </Link>
                </FieldRow>
                <InlineField label="Hiring contact" value={r.contactId} kind="select" options={contacts} onSave={patch("contactId")} readOnly={readOnly} placeholder="None" />
                <InlineField label="Role family" value={r.roleFamilyId} kind="select" options={roleFamilies} onSave={patch("roleFamilyId")} readOnly={readOnly} placeholder="Unclassified" />
                <InlineField label="Owner" value={r.ownerId} kind="select" options={users} onSave={patch("ownerId")} readOnly={readOnly} placeholder="Unassigned" />
                <InlineField label="Customer reference" value={r.externalRef} onSave={patch("externalRef")} readOnly={readOnly} />
              </FieldGrid>
            </DetailSection>

            <DetailSection title="Location & timing" description="Start date and country feed the availability and work-authorisation rules.">
              <FieldGrid cols={3}>
                <InlineField label="Country" value={r.locationCountry} kind="select" options={COUNTRY_OPTIONS} onSave={patch("locationCountry")} readOnly={readOnly} />
                <InlineField label="City" value={r.locationCity} onSave={patch("locationCity")} readOnly={readOnly} />
                <InlineField label="Site" value={r.siteName} onSave={patch("siteName")} readOnly={readOnly} />
                <InlineField label="Start date" value={r.startDate} kind="date" display={r.startDate ? fmtDate(r.startDate) : undefined} onSave={patch("startDate")} readOnly={readOnly} placeholder="TBD" />
                <InlineField label="End date" value={r.endDate} kind="date" display={r.endDate ? fmtDate(r.endDate) : undefined} onSave={patch("endDate")} readOnly={readOnly} placeholder="Open-ended" />
                <InlineField label="Duration (weeks)" value={r.durationWeeks} kind="number" onSave={patch("durationWeeks")} readOnly={readOnly} />
              </FieldGrid>
            </DetailSection>

            <DetailSection title="Seats & rates">
              <FieldGrid cols={3}>
                <InlineField label="Approved seats" value={r.headcountApproved} kind="number" onSave={patch("headcountApproved")} readOnly={readOnly} hint="Each placement takes one seat" />
                <InlineField label="Bill rate" value={r.billRateAmount} kind="currency" currency={r.billRateCurrency ?? undefined} display={r.billRateAmount ? fmtMoney(r.billRateAmount, r.billRateCurrency ?? "EUR", r.billRatePeriod) : undefined} onSave={patch("billRateAmount")} readOnly={readOnly} />
                <InlineField label="Pay rate" value={r.payRateAmount} kind="currency" currency={r.payRateCurrency ?? undefined} display={r.payRateAmount ? fmtMoney(r.payRateAmount, r.payRateCurrency ?? "EUR", r.payRatePeriod) : undefined} onSave={patch("payRateAmount")} readOnly={readOnly} />
                <InlineField label="Bill currency" value={r.billRateCurrency} kind="select" options={CURRENCY_OPTIONS} onSave={patch("billRateCurrency")} readOnly={readOnly} />
                <InlineField label="Bill period" value={r.billRatePeriod} kind="select" options={PERIOD_OPTIONS} onSave={patch("billRatePeriod")} readOnly={readOnly} />
                <InlineField label="Pay period" value={r.payRatePeriod} kind="select" options={PERIOD_OPTIONS} onSave={patch("payRatePeriod")} readOnly={readOnly} />
              </FieldGrid>
              {r.billRateAmount && r.payRateAmount && r.billRateCurrency === r.payRateCurrency && r.billRatePeriod === r.payRatePeriod ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Gross margin {fmtPercent((Number(r.billRateAmount) - Number(r.payRateAmount)) / Number(r.billRateAmount))} per {r.billRatePeriod?.replace("ly", "") ?? "unit"}
                </p>
              ) : null}
            </DetailSection>

            <DetailSection title="Description" defaultOpen={Boolean(r.description)} actions={canEdit && descDraft === null ? <Button variant="ghost" size="xs" onClick={() => setDescDraft(r.description ?? "")}>Edit</Button> : undefined}>
              {descDraft !== null ? (
                <div className="space-y-2">
                  <RichTextEditor value={descDraft} onChange={setDescDraft} placeholder="Scope of work, shift pattern, site conditions…" />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setDescDraft(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => saveDesc.run({ id: r.id, description: descDraft })} disabled={saveDesc.pending}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : r.description ? (
                <RichText html={r.description} />
              ) : (
                <p className="text-sm text-muted-foreground">No description yet.</p>
              )}
            </DetailSection>

            <DetailSection
              title="Pipeline"
              count={detail.submissions.length}
              description="Candidates submitted against this requisition, ranked by match score. Each keeps the requirement version it was matched against."
              actions={
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/submissions?f_requisition=${r.id}`}>Open board</Link>
                </Button>
              }
            >
              {detail.submissions.length === 0 ? (
                <EmptyState compact icon={UsersIcon} title="Nobody in the pipeline yet" description="Run matching to find eligible candidates and submit them in bulk." action={<Button variant="outline" asChild><Link href={`/requisitions/${r.id}/match`}>Find matches</Link></Button>} className="border-dashed" />
              ) : (
                <ul className="divide-y">
                  {detail.submissions.map((s) => (
                    <li key={s.submission.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <Link href={`/submissions/${s.submission.id}`} className="font-medium hover:underline">
                          {s.candidateName}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.candidateHeadline ?? "—"} · v{s.submission.requirementVersion} · {s.ownerName ?? "Unassigned"} · moved {fmtRelative(s.submission.stageChangedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {s.submission.matchScore !== null ? <span className="text-xs font-medium tabular-nums text-muted-foreground">{Math.round(Number(s.submission.matchScore))}</span> : null}
                        <StatusBadge value={s.submission.eligibility} />
                        <StatusBadge value={s.submission.stage} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection title="Placements" count={detail.placements.length} defaultOpen={detail.placements.length > 0}>
              {detail.placements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No seats reserved or filled yet.</p>
              ) : (
                <ul className="divide-y">
                  {detail.placements.map((p) => (
                    <li key={p.placement.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <Link href={`/placements/${p.placement.id}`} className="font-medium hover:underline">
                          {p.candidateName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {fmtDate(p.placement.plannedStart)} → {p.placement.plannedEnd ? fmtDate(p.placement.plannedEnd) : "open"}
                          {p.placement.actualStart ? ` · started ${fmtDate(p.placement.actualStart)}` : ""}
                        </p>
                      </div>
                      <StatusBadge value={p.placement.status} />
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection title="Version history" count={detail.versions.length} defaultOpen={false} description="Every requirements change is a new immutable version.">
              <ol className="relative ml-2 border-l pl-5">
                {detail.versions.map((v) => (
                  <li key={v.version.id} className="relative pb-4 last:pb-0">
                    <span className="absolute -left-[27px] top-1 flex size-4 items-center justify-center rounded-full border bg-background">
                      <HistoryIcon className="size-2.5 text-muted-foreground" />
                    </span>
                    <div className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="font-medium">v{v.version.version}</span>
                      {v.version.version === r.currentVersion ? <span className="rounded-full bg-success-soft px-1.5 text-[11px] text-success-foreground">current</span> : null}
                      <span className="text-xs text-muted-foreground">
                        {v.createdByName ?? "System"} · {fmtDateTime(v.version.createdAt)} · {v.version.requirementsSnapshot.length} rules
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{v.version.changeSummary ?? "—"}</p>
                  </li>
                ))}
              </ol>
            </DetailSection>
          </>
        }
        side={
          <>
            <SidePanel title="Seats">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">
                  {detail.seats.open} <span className="text-sm font-normal text-muted-foreground">open</span>
                </span>
                <span className="text-xs text-muted-foreground">{seatPct}% taken</span>
              </div>
              <Progress value={seatPct} className="h-2" />
              <FieldGrid cols={2}>
                <FieldRow label="Approved" className="mt-3">{detail.seats.headcount}</FieldRow>
                <FieldRow label="Reserved" className="mt-3">{detail.seats.reserved}</FieldRow>
                <FieldRow label="Working">{detail.seats.filled}</FieldRow>
                <FieldRow label="Completed">{detail.seats.completed}</FieldRow>
              </FieldGrid>
              {detail.seats.open === 0 && r.status === "open" ? (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-warning-foreground">
                  <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0" /> All seats are taken. Mark the requisition filled or raise the approved headcount.
                </p>
              ) : null}
            </SidePanel>
            <SidePanel title="Pipeline health">
              <FieldGrid cols={2}>
                <FieldRow label="Active">{openSubs.length}</FieldRow>
                <FieldRow label="Presented">{openSubs.filter((s) => ["presented", "customer_review", "offered", "accepted"].includes(s.submission.stage)).length}</FieldRow>
                <FieldRow label="Needs review">{detail.submissions.filter((s) => s.submission.eligibility === "review").length}</FieldRow>
                <FieldRow label="Days open">{r.openedAt ? Math.max(0, Math.floor((now - new Date(r.openedAt).getTime()) / 86_400_000)) : "—"}</FieldRow>
              </FieldGrid>
              <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
                <Link href={`/submissions?f_requisition=${r.id}`}>
                  <GitBranchIcon data-icon="inline-start" />
                  View submissions
                </Link>
              </Button>
            </SidePanel>
            <SidePanel title="Customer">
              <div className="space-y-2 text-sm">
                <Link href={`/accounts/${detail.account.id}`} className="font-medium hover:underline">
                  {detail.account.name}
                </Link>
                {detail.contact ? (
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {detail.contact.firstName} {detail.contact.lastName}
                    </p>
                    <p>{detail.contact.title ?? "—"}</p>
                    {detail.contact.email ? <a href={`mailto:${detail.contact.email}`} className="hover:underline">{detail.contact.email}</a> : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No hiring contact set — disclosures need one.</p>
                )}
                {detail.account.paymentTermsDays ? <p className="text-xs text-muted-foreground">Payment terms {detail.account.paymentTermsDays} days</p> : null}
              </div>
            </SidePanel>
            <SidePanel title="Owner">
              <div className="flex items-center gap-3">
                <Avatar className="size-9">
                  {detail.owner?.avatarUrl ? <AvatarImage src={detail.owner.avatarUrl} alt="" /> : null}
                  <AvatarFallback>{initials(detail.owner?.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium">{detail.owner?.name ?? "Unassigned"}</p>
                  <p className="truncate text-xs text-muted-foreground">{detail.owner?.email ?? ""}</p>
                </div>
              </div>
            </SidePanel>
            {r.closeReason ? (
              <SidePanel title="Close reason">
                <p className="text-sm">{r.closeReason}</p>
                <p className="mt-1 text-xs text-muted-foreground">{r.closedAt ? fmtDateTime(r.closedAt) : ""}</p>
              </SidePanel>
            ) : null}
            <SidePanel title="Activity">
              <ActivityTimeline items={detail.activities} link={{ requisitionId: r.id, accountId: detail.account.id }} canWrite={canEdit} limit={10} />
            </SidePanel>
          </>
        }
      />
      {canEdit ? (
        <>
          <CreateTaskSheet open={taskOpen} onOpenChange={setTaskOpen} link={{ requisitionId: r.id, accountId: detail.account.id }} users={users} />
          {editorOpen ? <RequirementsEditor open onOpenChange={setEditorOpen} requisitionId={r.id} requisitionCountry={r.locationCountry} currentVersion={r.currentVersion} requirements={detail.requirements} /> : null}
          <Dialog open={statusTarget !== null} onOpenChange={(o) => !o && setStatusTarget(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{statusTarget?.label} requisition</DialogTitle>
                <DialogDescription>Record why. This is shown on the requisition and in reports on lost demand.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor="close-reason">Reason</Label>
                <Textarea id="close-reason" rows={3} value={closeReason} onChange={(e) => setCloseReason(e.target.value)} placeholder="e.g. Customer filled internally; budget frozen until Q3; project cancelled" maxLength={300} autoFocus />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setStatusTarget(null)}>
                  Back
                </Button>
                <Button onClick={() => statusTarget && status.run({ id: r.id, status: statusTarget.to, closeReason })} disabled={status.pending || closeReason.trim().length < 3}>
                  Confirm
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </>
  );
}
