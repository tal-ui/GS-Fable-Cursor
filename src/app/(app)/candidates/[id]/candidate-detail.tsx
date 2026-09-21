"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ArrowLeftIcon, BriefcaseIcon, CheckIcon, ClipboardListIcon, GitMergeIcon, MessageCircleIcon, SparklesIcon, Trash2Icon, XIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DetailLayout, DetailSection, FieldGrid, FieldRow, SidePanel } from "@/components/app/detail-layout";
import { InlineField } from "@/components/app/inline-field";
import { StatusBadge } from "@/components/app/status-badge";
import { ConfirmButton } from "@/components/app/confirm-button";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { SendMessageSheet } from "@/components/app/send-message-sheet";
import { SlideOver } from "@/components/app/slide-over";
import { Lookup } from "@/components/app/lookup-field";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { COUNTRY_OPTIONS, enumOptions } from "@/components/app/form";
import { useAction } from "@/components/app/use-action";
import { deleteCandidateAction, extractionDecisionAction, mergeCandidatesAction, undoMergeAction, updateCandidateAction } from "@/actions/candidates";
import { createSubmissionAction } from "@/actions/pipeline";
import { searchCandidatesAction, searchRequisitionsAction } from "@/actions/lookups";
import type { CandidateDetail } from "@/server/candidates/queries";
import { countryName, fmtDate, fmtDateTime, fmtRelative, fullName, initials } from "@/lib/format";
import { SkillsSection, LanguagesSection, WorkAuthSection } from "./claims-sections";
import { AvailabilitySection, CompensationSection, ConsentsSection, DocumentsSection } from "./profile-sections";
import { CreateTaskSheet } from "@/components/app/create-task-sheet";

type Opt = { value: string; label: string };
type Patch = Parameters<typeof updateCandidateAction>[0];

export function CandidateDetailView({ detail, users, sources, canEdit, canVerify }: { detail: CandidateDetail; users: Opt[]; sources: Opt[]; canEdit: boolean; canVerify: boolean }) {
  const router = useRouter();
  const c = detail.candidate;
  const name = fullName(c.firstName, c.lastName);
  const [messageOpen, setMessageOpen] = React.useState(false);
  const [submitOpen, setSubmitOpen] = React.useState(false);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [taskOpen, setTaskOpen] = React.useState(false);
  const readOnly = !canEdit;

  const update = useAction(updateCandidateAction, { silent: true });
  const patch = (field: keyof Omit<Patch, "id">) => (value: string | number | boolean | null) => update.run({ id: c.id, [field]: value === null ? "" : value } as Patch);
  const decide = useAction(extractionDecisionAction, { successMessage: "Suggestion recorded" });
  const remove = useAction(deleteCandidateAction, { successMessage: "Candidate archived", onSuccess: () => router.push("/candidates") });
  const undo = useAction(undoMergeAction, { successMessage: "Merge undone" });

  const canCommunicate = detail.consents.some((r) => r.consent.scope === "communicate" && !r.consent.withdrawnAt);
  const pendingSuggestions = (c.extractionSuggestions ?? []).map((s, index) => ({ ...s, index })).filter((s) => s.accepted === null || s.accepted === undefined);
  const activeMerges = detail.merges.filter((m) => m.primaryCandidateId === c.id && !m.undoneAt);

  return (
    <>
      <BreadcrumbLabel segment={c.id} label={name} />
      <DetailLayout
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="icon-sm" asChild aria-label="Back to candidates">
              <Link href="/candidates">
                <ArrowLeftIcon />
              </Link>
            </Button>
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary-soft text-primary">{initials(name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 truncate text-lg font-semibold">
                {name}
                <StatusBadge value={c.status} />
                {c.mergedIntoId ? <StatusBadge value="merged" tone="neutral" label="Merged" /> : null}
                {c.anonymizedAt ? <StatusBadge value="erased" label={`Erased ${fmtDate(c.anonymizedAt)}`} /> : null}
                {!c.anonymizedAt && c.retentionHoldReason ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span><StatusBadge value="hold" label={c.retentionHoldUntil ? `Retention hold until ${fmtDate(c.retentionHoldUntil)}` : "Retention hold"} /></span>
                    </TooltipTrigger>
                    <TooltipContent>{c.retentionHoldReason}</TooltipContent>
                  </Tooltip>
                ) : null}
              </h1>
              <p className="truncate text-xs text-muted-foreground">{c.headline ?? c.militaryRole ?? "No headline yet"} · updated {fmtRelative(c.updatedAt)}</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {canEdit ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setTaskOpen(true)}>
                    <ClipboardListIcon data-icon="inline-start" />
                    Task
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button variant="outline" size="sm" onClick={() => setMessageOpen(true)} disabled={!canCommunicate}>
                          <MessageCircleIcon data-icon="inline-start" />
                          Message
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!canCommunicate ? <TooltipContent>No communication consent on file</TooltipContent> : null}
                  </Tooltip>
                  <Button size="sm" onClick={() => setSubmitOpen(true)}>
                    <BriefcaseIcon data-icon="inline-start" />
                    Add to requisition
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setMergeOpen(true)}>
                    <GitMergeIcon data-icon="inline-start" />
                    Merge
                  </Button>
                  <ConfirmButton title="Archive this candidate?" description="The profile is hidden from lists, search and matching; its history is kept. Open submissions and active placements must be closed first. A Super Admin can restore it from Setup → Archived records." confirmLabel="Archive" destructive variant="ghost" size="icon-sm" onConfirm={() => remove.run({ id: c.id })} pending={remove.pending}>
                    <Trash2Icon />
                  </ConfirmButton>
                </>
              ) : null}
            </div>
          </div>
        }
        main={
          <>
            {c.anonymizedAt ? (
              <Alert>
                <ArchiveIcon />
                <AlertTitle>Personal data erased on {fmtDate(c.anonymizedAt)}</AlertTitle>
                <AlertDescription>
                  Name, contact details, documents, notes, messages and AI records were removed permanently. Submissions, placements and source history stay linked to this placeholder for reporting and headcount, and nothing on this page can be edited.
                </AlertDescription>
              </Alert>
            ) : null}
            {pendingSuggestions.length && canEdit ? (
              <DetailSection title="CV extraction suggestions" count={pendingSuggestions.length} description="Extracted from the uploaded CV with the confidence shown. Accept to apply, reject to discard — the decision is logged.">
                <ul className="divide-y">
                  {pendingSuggestions.map((s) => (
                    <li key={s.index} className="flex items-center gap-3 py-2 text-sm">
                      <SparklesIcon className="size-4 shrink-0 text-warning" />
                      <div className="min-w-0 flex-1">
                        <p>
                          <span className="font-medium">{humanField(s.field)}</span>: <span className="break-words">{renderValue(s.value)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Confidence {Math.round(s.confidence * 100)}%{s.evidence ? ` · “${s.evidence}”` : ""}
                        </p>
                      </div>
                      <Button size="icon-sm" variant="outline" aria-label="Accept" onClick={() => decide.run({ candidateId: c.id, index: s.index, accept: true })} disabled={decide.pending}>
                        <CheckIcon />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Reject" onClick={() => decide.run({ candidateId: c.id, index: s.index, accept: false })} disabled={decide.pending}>
                        <XIcon />
                      </Button>
                    </li>
                  ))}
                </ul>
              </DetailSection>
            ) : null}

            <DetailSection title="Profile">
              <FieldGrid>
                <InlineField label="First name" value={c.firstName} onSave={patch("firstName")} readOnly={readOnly} />
                <InlineField label="Last name" value={c.lastName} onSave={patch("lastName")} readOnly={readOnly} />
                <InlineField label="Email" value={c.email} onSave={patch("email")} readOnly={readOnly} placeholder="Add an email" />
                <InlineField label="Phone (WhatsApp)" value={c.phone} onSave={patch("phone")} readOnly={readOnly} placeholder="Add a phone number" />
                <InlineField label="City" value={c.city} onSave={patch("city")} readOnly={readOnly} />
                <InlineField label="Country of residence" value={c.country} kind="select" options={COUNTRY_OPTIONS} onSave={patch("country")} readOnly={readOnly} />
                <InlineField label="Status" value={c.status} kind="select" options={enumOptions(["new", "screening", "active", "placed", "unavailable", "withdrawn", "archived"])} display={<StatusBadge value={c.status} />} onSave={patch("status")} readOnly={readOnly} />
                <InlineField label="Owner" value={c.ownerId} kind="select" options={users} onSave={patch("ownerId")} readOnly={readOnly} placeholder="Unassigned" />
                <InlineField label="Primary source" value={c.primarySourceId} kind="select" options={sources} onSave={patch("primarySourceId")} readOnly={readOnly} />
                <InlineField label="Years of experience" value={c.yearsExperience ? Number(c.yearsExperience) : null} kind="number" onSave={patch("yearsExperience")} readOnly={readOnly} />
                <InlineField label="Headline" value={c.headline} onSave={patch("headline")} readOnly={readOnly} className="sm:col-span-2" placeholder="One line that sells the profile" />
                <InlineField label="Summary" value={c.summary} kind="textarea" onSave={patch("summary")} readOnly={readOnly} className="sm:col-span-2" placeholder="Background, strengths, constraints…" />
                <InlineField label="External reference" value={c.externalRef} onSave={patch("externalRef")} readOnly={readOnly} placeholder="Partner or legacy ID" />
                <InlineField label="Date of birth" value={c.dateOfBirth} kind="date" onSave={patch("dateOfBirth")} readOnly={readOnly} display={c.dateOfBirth ? fmtDate(c.dateOfBirth) : undefined} />
              </FieldGrid>
            </DetailSection>

            <DetailSection title="Military background" defaultOpen={Boolean(c.militaryRole || c.militaryUnit)}>
              <FieldGrid cols={3}>
                <InlineField label="Role" value={c.militaryRole} onSave={patch("militaryRole")} readOnly={readOnly} />
                <InlineField label="Unit" value={c.militaryUnit} onSave={patch("militaryUnit")} readOnly={readOnly} />
                <InlineField label="Rank" value={c.militaryRank} onSave={patch("militaryRank")} readOnly={readOnly} />
                <InlineField label="Service start" value={c.militaryServiceStart} kind="date" onSave={patch("militaryServiceStart")} readOnly={readOnly} display={c.militaryServiceStart ? fmtDate(c.militaryServiceStart) : undefined} />
                <InlineField label="Service end" value={c.militaryServiceEnd} kind="date" onSave={patch("militaryServiceEnd")} readOnly={readOnly} display={c.militaryServiceEnd ? fmtDate(c.militaryServiceEnd) : undefined} />
              </FieldGrid>
            </DetailSection>

            <DetailSection title="Citizenship, passport & mobility" description="Citizenship and passport are identity facts. Whether someone may work in a destination country is tracked separately under Work authorization.">
              <FieldGrid cols={3}>
                <InlineField label="Citizenships" value={c.citizenships?.join(", ")} display={c.citizenships?.length ? c.citizenships.map(countryName).join(", ") : undefined} onSave={patch("citizenships")} readOnly={readOnly} hint="Comma-separated 2-letter codes" placeholder="e.g. IL, US" />
                <InlineField label="Passport country" value={c.passportCountry} kind="select" options={COUNTRY_OPTIONS} onSave={patch("passportCountry")} readOnly={readOnly} />
                <InlineField label="Passport expiry" value={c.passportExpiry} kind="date" onSave={patch("passportExpiry")} readOnly={readOnly} display={c.passportExpiry ? fmtDate(c.passportExpiry) : undefined} />
                <InlineField label="Willing to relocate" value={c.willingToRelocate ?? false} kind="boolean" onSave={patch("willingToRelocate")} readOnly={readOnly} />
                <InlineField label="Preferred destinations" value={c.preferredCountries?.join(", ")} display={c.preferredCountries?.length ? c.preferredCountries.map(countryName).join(", ") : undefined} onSave={patch("preferredCountries")} readOnly={readOnly} placeholder="e.g. DE, NL" />
                <InlineField label="Relocation constraints" value={c.relocationConstraints} kind="textarea" onSave={patch("relocationConstraints")} readOnly={readOnly} />
              </FieldGrid>
            </DetailSection>

            <SkillsSection candidateId={c.id} claims={detail.skillClaims} documents={detail.documents} canEdit={canEdit} canVerify={canVerify} />
            <WorkAuthSection candidateId={c.id} rows={detail.workAuths} documents={detail.documents} canEdit={canEdit} canVerify={canVerify} />
            <LanguagesSection candidateId={c.id} rows={detail.languages} canEdit={canEdit} />
            <AvailabilitySection candidateId={c.id} rows={detail.availability} canEdit={canEdit} />
            <CompensationSection candidateId={c.id} rows={detail.compensation} canEdit={canEdit} />
            <ConsentsSection candidateId={c.id} rows={detail.consents} canEdit={canEdit} />
            <DocumentsSection candidateId={c.id} candidateName={name} rows={detail.documents} links={detail.uploadLinks} canEdit={canEdit} />

            <DetailSection title="Pipeline" count={detail.submissions.length + detail.placements.length} defaultOpen={detail.submissions.length > 0}>
              {detail.submissions.length === 0 && detail.placements.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not submitted to any requisition yet.</p>
              ) : (
                <div className="space-y-4">
                  {detail.submissions.length ? (
                    <ul className="divide-y">
                      {detail.submissions.map((s) => (
                        <li key={s.submission.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <div className="min-w-0">
                            <Link href={`/submissions/${s.submission.id}`} className="font-medium hover:underline">
                              {s.requisitionTitle}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              <Link href={`/accounts/${s.accountId}`} className="hover:underline">
                                {s.accountName}
                              </Link>{" "}
                              · {s.ownerName ?? "Unassigned"} · {fmtRelative(s.submission.stageChangedAt)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <StatusBadge value={s.submission.eligibility} />
                            <StatusBadge value={s.submission.stage} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {detail.placements.length ? (
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Placements</p>
                      <ul className="divide-y">
                        {detail.placements.map((p) => (
                          <li key={p.placement.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                            <div className="min-w-0">
                              <Link href={`/placements/${p.placement.id}`} className="font-medium hover:underline">
                                {p.requisitionTitle}
                              </Link>
                              <p className="text-xs text-muted-foreground">
                                {p.accountName} · {fmtDate(p.placement.plannedStart)} → {p.placement.plannedEnd ? fmtDate(p.placement.plannedEnd) : "open-ended"}
                              </p>
                            </div>
                            <StatusBadge value={p.placement.status} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </DetailSection>
          </>
        }
        side={
          <>
            <SidePanel title="Ownership">
              <div className="flex items-center gap-3">
                <Avatar className="size-9">
                  {detail.owner?.avatarUrl ? <AvatarImage src={detail.owner.avatarUrl} alt="" /> : null}
                  <AvatarFallback>{initials(detail.owner?.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium">{detail.owner?.name ?? "Unassigned"}</p>
                  <p className="truncate text-xs text-muted-foreground">{detail.owner?.email ?? "Pick an owner in the profile"}</p>
                </div>
              </div>
            </SidePanel>

            <SidePanel title="Source attribution">
              {detail.sourceEvents.length === 0 ? (
                <p className="text-muted-foreground">{detail.source ? detail.source.name : "No source recorded."}</p>
              ) : (
                <ul className="space-y-2">
                  {detail.sourceEvents.map((e) => (
                    <li key={e.event.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{e.sourceName ?? "Unknown source"}</p>
                        <p className="text-xs text-muted-foreground">
                          {e.event.eventType.replace(/_/g, " ")}
                          {e.event.referrerName ? ` · ref. ${e.event.referrerName}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(e.event.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SidePanel>

            <SidePanel title="Open tasks" action={canEdit ? <Button variant="ghost" size="xs" onClick={() => setTaskOpen(true)}>Add</Button> : undefined}>
              {detail.openTasks.length === 0 ? (
                <p className="text-muted-foreground">Nothing outstanding.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.openTasks.map((t) => (
                    <li key={t.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.dueAt ? `Due ${fmtRelative(t.dueAt)}` : "No due date"}</p>
                      </div>
                      <StatusBadge value={t.priority} />
                    </li>
                  ))}
                </ul>
              )}
            </SidePanel>

            <SidePanel title="Messages" action={canEdit ? <Button variant="ghost" size="xs" onClick={() => setMessageOpen(true)} disabled={!canCommunicate}>Send</Button> : undefined}>
              {detail.messages.length === 0 ? (
                <p className="text-muted-foreground">No outreach yet.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.messages.slice(0, 6).map((m) => (
                    <li key={m.id} className="space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium">
                          {m.direction === "inbound" ? "↩ " : ""}
                          {m.channel} · {m.toAddress}
                        </span>
                        <StatusBadge value={m.status} />
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{m.body}</p>
                      {m.errorMessage ? <p className="text-xs text-danger-foreground">{m.errorMessage}</p> : null}
                      <p className="text-[11px] text-muted-foreground">{fmtDateTime(m.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </SidePanel>

            {activeMerges.length ? (
              <SidePanel title="Merged profiles">
                <ul className="space-y-2">
                  {activeMerges.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0 text-xs">
                        <p className="font-medium">Merged {fmtDate(m.createdAt)}</p>
                        <p className="text-muted-foreground">{m.reason ?? "No reason recorded"}</p>
                      </div>
                      {canEdit ? (
                        <Button variant="ghost" size="xs" onClick={() => undo.run({ mergeId: m.id, candidateId: c.id })} disabled={undo.pending}>
                          Undo
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </SidePanel>
            ) : null}

            <SidePanel title="Activity">
              <ActivityTimeline items={detail.activities} link={{ candidateId: c.id }} canWrite={canEdit} limit={10} />
            </SidePanel>

            <SidePanel title="Record">
              <FieldGrid cols={1}>
                <FieldRow label="Created">{fmtDateTime(c.createdAt)}</FieldRow>
                <FieldRow label="Updated">{fmtDateTime(c.updatedAt)}</FieldRow>
                <FieldRow label="ID">
                  <code className="text-xs">{c.id}</code>
                </FieldRow>
              </FieldGrid>
            </SidePanel>
          </>
        }
      />

      {canEdit ? (
        <>
          <SendMessageSheet open={messageOpen} onOpenChange={setMessageOpen} candidateId={c.id} candidateName={name} canCommunicate={canCommunicate} />
          <AddToRequisitionSheet open={submitOpen} onOpenChange={setSubmitOpen} candidateId={c.id} candidateName={name} />
          <MergeSheet open={mergeOpen} onOpenChange={setMergeOpen} primaryId={c.id} primaryName={name} />
          <CreateTaskSheet open={taskOpen} onOpenChange={setTaskOpen} link={{ candidateId: c.id }} users={users} />
        </>
      ) : null}
    </>
  );
}

function humanField(field: string) {
  return field.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).replace(/_/g, " ");
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("name" in o) return String(o.name) + (o.proficiency ? ` (${o.proficiency})` : "");
    return JSON.stringify(value);
  }
  return String(value);
}

function AddToRequisitionSheet({ open, onOpenChange, candidateId, candidateName }: { open: boolean; onOpenChange: (o: boolean) => void; candidateId: string; candidateName: string }) {
  const router = useRouter();
  const [requisitionId, setRequisitionId] = React.useState<string | null>(null);
  const { run, pending } = useAction(createSubmissionAction, {
    successMessage: "Submission created — eligibility snapshot saved",
    onSuccess: (d) => {
      onOpenChange(false);
      router.push(`/submissions/${d.id}`);
    },
  });
  return (
    <SlideOver
      open={open}
      onOpenChange={onOpenChange}
      title={`Add ${candidateName} to a requisition`}
      description="Creates a submission at the “sourced” stage with the current requirements version and an explainable eligibility snapshot."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!requisitionId || pending} onClick={() => requisitionId && run({ requisitionId, candidateId })}>
            Create submission
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-sm font-medium">Requisition</p>
        <Lookup value={requisitionId} onChange={(id) => setRequisitionId(id)} fetcher={searchRequisitionsAction} placeholder="Search open requisitions…" />
      </div>
    </SlideOver>
  );
}

function MergeSheet({ open, onOpenChange, primaryId, primaryName }: { open: boolean; onOpenChange: (o: boolean) => void; primaryId: string; primaryName: string }) {
  const [mergedId, setMergedId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const { run, pending } = useAction(mergeCandidatesAction, {
    successMessage: "Profiles merged — this can be undone from the side panel",
    onSuccess: () => {
      onOpenChange(false);
      setMergedId(null);
      setReason("");
    },
  });
  return (
    <SlideOver
      open={open}
      onOpenChange={onOpenChange}
      title="Merge a duplicate into this profile"
      description={`Skills, documents, consents and submissions from the duplicate move onto ${primaryName}. The duplicate is hidden, and the merge is fully auditable and reversible.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <ConfirmButton title="Merge these two profiles?" description="Fields that are empty on this profile are filled from the duplicate; everything else stays as-is. You can undo the merge later." confirmLabel="Merge" variant="default" size="default" disabled={!mergedId} pending={pending} onConfirm={() => mergedId && run({ primaryId, mergedId, reason })}>
            <GitMergeIcon data-icon="inline-start" />
            Merge
          </ConfirmButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Duplicate profile</p>
          <Lookup value={mergedId} onChange={(id) => setMergedId(id === primaryId ? null : id)} fetcher={searchCandidatesAction} placeholder="Search by name…" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Reason</p>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Same phone number, imported twice" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" />
        </div>
      </div>
    </SlideOver>
  );
}
