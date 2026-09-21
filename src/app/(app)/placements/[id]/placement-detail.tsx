"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CalendarCheckIcon, CalendarPlusIcon, CheckCircle2Icon, ClipboardListIcon, FlagIcon, PlayIcon, RefreshCwIcon, XCircleIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DetailLayout, DetailSection, FieldGrid, FieldRow, SidePanel } from "@/components/app/detail-layout";
import { InlineField } from "@/components/app/inline-field";
import { StatusBadge } from "@/components/app/status-badge";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { CreateTaskSheet } from "@/components/app/create-task-sheet";
import { Lookup } from "@/components/app/lookup-field";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { CURRENCY_OPTIONS, DateField, Form, FormRow, PERIOD_OPTIONS, SelectField, SubmitButton, TextareaField, enumOptions, useFieldValue, useZodForm } from "@/components/app/form";
import { useAction } from "@/components/app/use-action";
import { useNow } from "@/components/app/use-now";
import { activatePlacementAction, cancelPlacementAction, completePlacementAction, extendPlacementAction, placementChecklistAction, replacePlacementAction, startPlacementAction, updatePlacementAction } from "@/actions/pipeline";
import { placementCancelSchema, placementCompleteSchema, placementExtendSchema, placementReplaceSchema, placementStartSchema } from "@/lib/schemas/pipeline";
import type { PlacementDetail } from "@/server/pipeline/placements";
import { fmtDate, fmtMoney, fmtRelative, humanize, initials, toDateInput } from "@/lib/format";
import { replacementCandidatesAction } from "@/actions/lookups";

type Opt = { value: string; label: string };
type Patch = Parameters<typeof updatePlacementAction>[0];
const CANCEL_REASONS = enumOptions(["candidate_withdrew", "customer_cancelled", "failed_start", "performance", "compliance", "other"]);
const WORKING = ["started", "active", "extended"];
const TERMINAL = ["completed", "cancelled", "replaced"];

export function PlacementDetailView({ detail, users, canEdit }: { detail: PlacementDetail; users: Opt[]; canEdit: boolean }) {
  const router = useRouter();
  const p = detail.placement;
  const c = detail.candidate;
  const r = detail.requisition;
  const name = `${c.firstName} ${c.lastName}`;
  const readOnly = !canEdit || TERMINAL.includes(p.status);
  const [taskOpen, setTaskOpen] = React.useState(false);
  const [dialog, setDialog] = React.useState<"start" | "complete" | "extend" | "cancel" | "replace" | null>(null);

  const update = useAction(updatePlacementAction, { silent: true });
  const patch = (field: keyof Omit<Patch, "id">) => (value: string | number | boolean | null) => update.run({ id: p.id, [field]: value === null ? "" : value } as Patch);
  const activate = useAction(activatePlacementAction, { successMessage: "Placement marked active" });
  const checklist = useAction(placementChecklistAction, { silent: true });

  const now = useNow();
  const done = p.checklist.filter((i) => i.done).length;
  const pct = p.checklist.length ? Math.round((done / p.checklist.length) * 100) : 0;
  const daysToStart = p.status === "reserved" ? Math.ceil((new Date(p.plannedStart).getTime() - now) / 86_400_000) : null;

  return (
    <>
      <BreadcrumbLabel segment={p.id} label={`${name} · ${r.title}`} />
      <DetailLayout
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="icon-sm" asChild aria-label="Back to placements">
              <Link href="/placements">
                <ArrowLeftIcon />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                <Link href={`/candidates/${c.id}`} className="truncate hover:underline">
                  {name}
                </Link>
                <span className="text-muted-foreground">at</span>
                <Link href={`/accounts/${detail.account.id}`} className="truncate hover:underline">
                  {detail.account.name}
                </Link>
                <StatusBadge value={p.status} />
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                <Link href={`/requisitions/${r.id}`} className="hover:underline">
                  {r.title}
                </Link>
                {" · "}
                {fmtDate(p.plannedStart)} → {p.plannedEnd ? fmtDate(p.plannedEnd) : "open"} · updated {fmtRelative(p.updatedAt)}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {canEdit ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setTaskOpen(true)}>
                    <ClipboardListIcon data-icon="inline-start" />
                    Task
                  </Button>
                  {p.status === "reserved" ? (
                    <Button size="sm" onClick={() => setDialog("start")}>
                      <PlayIcon data-icon="inline-start" />
                      Record start
                    </Button>
                  ) : null}
                  {p.status === "started" ? (
                    <Button size="sm" variant="outline" onClick={() => activate.run({ id: p.id })} disabled={activate.pending}>
                      <CheckCircle2Icon data-icon="inline-start" />
                      Mark active
                    </Button>
                  ) : null}
                  {WORKING.includes(p.status) ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setDialog("extend")}>
                        <CalendarPlusIcon data-icon="inline-start" />
                        Extend
                      </Button>
                      <Button size="sm" onClick={() => setDialog("complete")}>
                        <FlagIcon data-icon="inline-start" />
                        Complete
                      </Button>
                    </>
                  ) : null}
                  {!TERMINAL.includes(p.status) ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setDialog("replace")}>
                        <RefreshCwIcon data-icon="inline-start" />
                        Replace
                      </Button>
                      <Button size="sm" variant="ghost" className="text-danger-foreground" onClick={() => setDialog("cancel")}>
                        <XCircleIcon data-icon="inline-start" />
                        Cancel
                      </Button>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        }
        main={
          <>
            {p.status === "reserved" && daysToStart !== null ? (
              <Alert>
                <CalendarCheckIcon />
                <AlertTitle>{daysToStart < 0 ? `Planned start was ${Math.abs(daysToStart)} day(s) ago` : daysToStart === 0 ? "Starts today" : `Starts in ${daysToStart} day(s)`}</AlertTitle>
                <AlertDescription>The seat is reserved but not filled. Record the actual start to fill it, or cancel to release the seat. {done}/{p.checklist.length} readiness items done.</AlertDescription>
              </Alert>
            ) : null}
            {p.status === "cancelled" ? (
              <Alert variant="destructive">
                <XCircleIcon />
                <AlertTitle>Cancelled — seat released</AlertTitle>
                <AlertDescription>
                  {p.cancellationReason ? humanize(p.cancellationReason) : "No reason recorded"}
                  {p.cancellationNotes ? `: ${p.cancellationNotes}` : ""}
                  {detail.replacedBy ? (
                    <>
                      {" "}
                      Replaced by <Link href={`/placements/${detail.replacedBy.id}`} className="underline">another placement</Link>.
                    </>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
            {p.status === "replaced" && detail.replacedBy ? (
              <Alert>
                <RefreshCwIcon />
                <AlertTitle>Replaced</AlertTitle>
                <AlertDescription>
                  This seat is now held by <Link href={`/placements/${detail.replacedBy.id}`} className="underline">the replacement placement</Link> (planned start {fmtDate(detail.replacedBy.plannedStart)}).
                </AlertDescription>
              </Alert>
            ) : null}

            <DetailSection title="Readiness checklist" count={p.checklist.length} description="Everything that must be true before the candidate starts. Items are tracked with who ticked them and when.">
              <Progress value={pct} className="mb-3 h-2" />
              <ul className="grid gap-2 sm:grid-cols-2">
                {p.checklist.map((item) => (
                  <li key={item.key} className={cn("flex items-start gap-2 rounded-lg border p-3 text-sm", item.done && "bg-success-soft/30")}>
                    <Checkbox checked={item.done} disabled={readOnly || checklist.pending} onCheckedChange={(v) => checklist.run({ id: p.id, key: item.key, done: v === true })} className="mt-0.5" aria-label={item.label} />
                    <div>
                      <p className={cn(item.done && "line-through decoration-muted-foreground/50")}>{item.label}</p>
                      {item.doneAt ? <p className="text-xs text-muted-foreground">Done {fmtRelative(item.doneAt)}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </DetailSection>

            <DetailSection title="Dates">
              <FieldGrid cols={3}>
                <InlineField label="Planned start" value={p.plannedStart} kind="date" display={fmtDate(p.plannedStart)} onSave={patch("plannedStart")} readOnly={readOnly || p.status !== "reserved"} />
                <InlineField label="Planned end" value={p.plannedEnd} kind="date" display={p.plannedEnd ? fmtDate(p.plannedEnd) : undefined} onSave={patch("plannedEnd")} readOnly={readOnly} placeholder="Open-ended" />
                <FieldRow label="Duration">{p.plannedEnd ? `${Math.round((new Date(p.plannedEnd).getTime() - new Date(p.plannedStart).getTime()) / (7 * 86_400_000))} weeks` : "—"}</FieldRow>
                <FieldRow label="Actual start">{p.actualStart ? fmtDate(p.actualStart) : <span className="text-muted-foreground">Not started</span>}</FieldRow>
                <FieldRow label="Actual end">{p.actualEnd ? fmtDate(p.actualEnd) : <span className="text-muted-foreground">—</span>}</FieldRow>
                <FieldRow label="Seat">{["reserved"].includes(p.status) ? "Reserved" : WORKING.includes(p.status) ? "Filled" : "Released"}</FieldRow>
              </FieldGrid>
            </DetailSection>

            <DetailSection title="Terms" description="Copied from the requisition at acceptance; edit here if the negotiated terms differ. Versioned in the audit log.">
              <FieldGrid cols={3}>
                <InlineField label="Bill rate" value={p.billRateAmount} kind="currency" currency={p.billRateCurrency ?? undefined} display={p.billRateAmount ? fmtMoney(p.billRateAmount, p.billRateCurrency ?? "EUR", p.billRatePeriod) : undefined} onSave={patch("billRateAmount")} readOnly={readOnly} />
                <InlineField label="Bill currency" value={p.billRateCurrency} kind="select" options={CURRENCY_OPTIONS} onSave={patch("billRateCurrency")} readOnly={readOnly} />
                <InlineField label="Bill period" value={p.billRatePeriod} kind="select" options={PERIOD_OPTIONS} onSave={patch("billRatePeriod")} readOnly={readOnly} />
                <InlineField label="Pay rate" value={p.payRateAmount} kind="currency" currency={p.payRateCurrency ?? undefined} display={p.payRateAmount ? fmtMoney(p.payRateAmount, p.payRateCurrency ?? "EUR", p.payRatePeriod) : undefined} onSave={patch("payRateAmount")} readOnly={readOnly} />
                <InlineField label="Pay currency" value={p.payRateCurrency} kind="select" options={CURRENCY_OPTIONS} onSave={patch("payRateCurrency")} readOnly={readOnly} />
                <InlineField label="Pay period" value={p.payRatePeriod} kind="select" options={PERIOD_OPTIONS} onSave={patch("payRatePeriod")} readOnly={readOnly} />
                <InlineField label="Basis" value={p.grossNet} kind="select" options={[{ value: "gross", label: "Gross" }, { value: "net", label: "Net" }]} onSave={patch("grossNet")} readOnly={readOnly} />
              </FieldGrid>
              <div className="mt-4">
                <InlineField label="Notes" value={p.notes} kind="textarea" onSave={patch("notes")} readOnly={!canEdit} placeholder="Site instructions, rotation, PPE, accommodation…" />
              </div>
            </DetailSection>

            {detail.replacementOf || detail.extensionOf ? (
              <DetailSection title="Links">
                <ul className="text-sm">
                  {detail.replacementOf ? (
                    <li>
                      Replacement for{" "}
                      <Link href={`/placements/${detail.replacementOf.id}`} className="text-primary hover:underline">
                        placement starting {fmtDate(detail.replacementOf.plannedStart)}
                      </Link>{" "}
                      ({humanize(detail.replacementOf.status).toLowerCase()})
                    </li>
                  ) : null}
                  {detail.extensionOf ? (
                    <li>
                      Extension of{" "}
                      <Link href={`/placements/${detail.extensionOf.id}`} className="text-primary hover:underline">
                        earlier placement
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </DetailSection>
            ) : null}
          </>
        }
        side={
          <>
            <SidePanel title="Submission">
              <div className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/submissions/${detail.submission.id}`} className="font-medium hover:underline">
                  View submission
                </Link>
                <StatusBadge value={detail.submission.stage} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Matched on requirements v{detail.submission.requirementVersion} · eligibility {detail.submission.eligibility}</p>
            </SidePanel>
            <SidePanel title="Candidate">
              <div className="space-y-1 text-sm">
                <Link href={`/candidates/${c.id}`} className="font-medium hover:underline">
                  {name}
                </Link>
                <p className="text-xs text-muted-foreground">{c.headline ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ")}</p>
              </div>
            </SidePanel>
            <SidePanel title="Customer">
              <div className="space-y-1 text-sm">
                <Link href={`/accounts/${detail.account.id}`} className="font-medium hover:underline">
                  {detail.account.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {r.siteName ? `${r.siteName} · ` : ""}
                  {r.locationCity ? `${r.locationCity}, ` : ""}
                  {r.locationCountry}
                </p>
                {detail.account.paymentTermsDays ? <p className="text-xs text-muted-foreground">Payment terms {detail.account.paymentTermsDays} days</p> : null}
              </div>
            </SidePanel>
            <SidePanel title="Owner">
              <div className="flex items-center gap-3">
                <Avatar className="size-9">
                  {detail.owner?.avatarUrl ? <AvatarImage src={detail.owner.avatarUrl} alt="" /> : null}
                  <AvatarFallback>{initials(detail.owner?.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <InlineField label="Accountable" value={p.ownerId} kind="select" options={users} onSave={patch("ownerId")} readOnly={!canEdit} placeholder="Unassigned" />
                </div>
              </div>
            </SidePanel>
            <SidePanel title="Activity">
              <ActivityTimeline items={detail.activities} link={{ placementId: p.id, candidateId: c.id, requisitionId: r.id, accountId: detail.account.id, submissionId: detail.submission.id }} canWrite={canEdit} limit={10} />
            </SidePanel>
          </>
        }
      />
      {canEdit ? (
        <>
          <CreateTaskSheet open={taskOpen} onOpenChange={setTaskOpen} link={{ placementId: p.id, candidateId: c.id, requisitionId: r.id }} users={users} />
          {dialog === "start" ? <StartDialog placementId={p.id} plannedStart={p.plannedStart} onClose={() => setDialog(null)} /> : null}
          {dialog === "complete" ? <CompleteDialog placementId={p.id} plannedEnd={p.plannedEnd} onClose={() => setDialog(null)} /> : null}
          {dialog === "extend" ? <ExtendDialog placementId={p.id} plannedEnd={p.plannedEnd} onClose={() => setDialog(null)} /> : null}
          {dialog === "cancel" ? <CancelDialog placementId={p.id} status={p.status} onClose={() => setDialog(null)} /> : null}
          {dialog === "replace" ? <ReplaceDialog placementId={p.id} requisitionId={r.id} candidateId={c.id} onClose={() => setDialog(null)} onReplaced={(id) => router.push(`/placements/${id}`)} /> : null}
        </>
      ) : null}
    </>
  );
}

function ActionDialog({ title, description, children, onClose }: { title: string; description: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function StartDialog({ placementId, plannedStart, onClose }: { placementId: string; plannedStart: string; onClose: () => void }) {
  const form = useZodForm(placementStartSchema, { id: placementId, actualStart: plannedStart });
  const { run, pending, fieldErrors } = useAction(startPlacementAction, { successMessage: "Placement started — seat filled", onSuccess: onClose });
  return (
    <ActionDialog title="Record actual start" description="Fills the seat and moves the submission to placed. The requisition is marked filled automatically when its last seat fills." onClose={onClose}>
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <DateField name="actualStart" label="Actual start date" required />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Start placement</SubmitButton>
        </DialogFooter>
      </Form>
    </ActionDialog>
  );
}

function CompleteDialog({ placementId, plannedEnd, onClose }: { placementId: string; plannedEnd: string | null; onClose: () => void }) {
  const form = useZodForm(placementCompleteSchema, { id: placementId, actualEnd: plannedEnd ?? toDateInput(new Date()), notes: "" });
  const { run, pending, fieldErrors } = useAction(completePlacementAction, { successMessage: "Placement completed — availability re-check task created", onSuccess: onClose });
  return (
    <ActionDialog title="Complete placement" description="Releases the seat and asks the owner to re-confirm the candidate's availability before they are matched again." onClose={onClose}>
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <DateField name="actualEnd" label="Actual end date" required />
        <TextareaField name="notes" label="Notes" placeholder="Outcome, feedback from the customer, would we place again?" />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Complete</SubmitButton>
        </DialogFooter>
      </Form>
    </ActionDialog>
  );
}

function ExtendDialog({ placementId, plannedEnd, onClose }: { placementId: string; plannedEnd: string | null; onClose: () => void }) {
  const form = useZodForm(placementExtendSchema, { id: placementId, newPlannedEnd: "", notes: "" });
  const { run, pending, fieldErrors } = useAction(extendPlacementAction, { successMessage: "Placement extended", onSuccess: onClose });
  return (
    <ActionDialog title="Extend placement" description={`Current planned end: ${plannedEnd ? fmtDate(plannedEnd) : "open-ended"}. The new end must be later; overlap with other assignments is re-checked.`} onClose={onClose}>
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <DateField name="newPlannedEnd" label="New planned end" required />
        <TextareaField name="notes" label="Notes" placeholder="Who agreed the extension and on what terms" />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Extend</SubmitButton>
        </DialogFooter>
      </Form>
    </ActionDialog>
  );
}

function CancelDialog({ placementId, status, onClose }: { placementId: string; status: string; onClose: () => void }) {
  const form = useZodForm(placementCancelSchema, { id: placementId, reason: "candidate_withdrew", notes: "" });
  const { run, pending, fieldErrors } = useAction(cancelPlacementAction, { successMessage: "Placement cancelled — seat released", onSuccess: onClose });
  return (
    <ActionDialog title="Cancel placement" description={status === "reserved" ? "Releases the reserved seat so it can be offered to someone else." : "Ends the assignment early, releases the seat and schedules an availability re-check."} onClose={onClose}>
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <SelectField name="reason" label="Reason" options={CANCEL_REASONS} required />
        <TextareaField name="notes" label="Notes" placeholder="What happened, who informed whom" />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Back
          </Button>
          <SubmitButton pending={pending}>Cancel placement</SubmitButton>
        </DialogFooter>
      </Form>
    </ActionDialog>
  );
}

function ReplaceDialog({ placementId, requisitionId, candidateId, onClose, onReplaced }: { placementId: string; requisitionId: string; candidateId: string; onClose: () => void; onReplaced: (id: string) => void }) {
  const form = useZodForm(placementReplaceSchema, { id: placementId, replacementSubmissionId: "", plannedStart: toDateInput(new Date()), reason: "candidate_withdrew", notes: "" });
  const { run, pending, fieldErrors } = useAction(replacePlacementAction, { successMessage: "Replacement placement created", onSuccess: (d) => { onClose(); onReplaced(d.id); } });
  const fetcher = React.useCallback(({ q }: { q: string }) => replacementCandidatesAction({ requisitionId, excludeCandidateId: candidateId, q }), [requisitionId, candidateId]);
  const replacementSubmissionId = useFieldValue(form, "replacementSubmissionId");
  return (
    <ActionDialog title="Replace with another candidate" description="Marks this placement replaced (seat released) and reserves the same seat for a candidate who is already presented, in customer review, offered or accepted on this requisition." onClose={onClose}>
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <div className="grid gap-1.5">
          <label className="text-sm">
            Replacement submission<span className="ml-0.5 text-destructive">*</span>
          </label>
          <Lookup value={replacementSubmissionId || null} onChange={(id) => form.setValue("replacementSubmissionId", id ?? "", { shouldValidate: true })} fetcher={fetcher} placeholder="Search presented / offered candidates…" />
          {fieldErrors.replacementSubmissionId ? <p className="text-xs text-destructive">{fieldErrors.replacementSubmissionId}</p> : null}
        </div>
        <FormRow>
          <DateField name="plannedStart" label="Replacement planned start" required />
          <SelectField name="reason" label="Why is the original replaced?" options={CANCEL_REASONS} required />
        </FormRow>
        <TextareaField name="notes" label="Notes" />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Replace</SubmitButton>
        </DialogFooter>
      </Form>
    </ActionDialog>
  );
}

