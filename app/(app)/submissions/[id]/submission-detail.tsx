"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon, CalendarPlusIcon, CheckCircle2Icon, ChevronDownIcon, CircleIcon, ClipboardListIcon, HandshakeIcon, MessageSquareIcon, PhoneCallIcon, Share2Icon, ShieldCheckIcon, Trash2Icon, XCircleIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DetailLayout, DetailSection, FieldGrid, FieldRow, SidePanel } from "@/components/app/detail-layout";
import { InlineField } from "@/components/app/inline-field";
import { StatusBadge } from "@/components/app/status-badge";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { ConfirmButton } from "@/components/app/confirm-button";
import { EmptyState } from "@/components/app/empty-state";
import { RichText } from "@/components/app/rich-text";
import { CreateTaskSheet } from "@/components/app/create-task-sheet";
import { SendMessageSheet } from "@/components/app/send-message-sheet";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { useAction } from "@/components/app/use-action";
import { deleteSubmissionAction, reassignSubmissionAction, revokeDisclosureAction } from "@/actions/pipeline";
import type { SubmissionDetail } from "@/server/pipeline/submissions";
import { fmtDate, fmtDateTime, fmtRelative, humanize, initials } from "@/lib/format";
import { OPEN_STAGE_ORDER } from "../submissions-table";
import { ConfirmInterestSheet, DisclosureSheet, InterviewOutcomeSheet, ScheduleInterviewSheet, SharingConsentSheet, StageDialog } from "./submission-sheets";

type Opt = { value: string; label: string };
type Stage = SubmissionDetail["submission"]["stage"];

const CLOSING: Stage[] = ["declined_by_candidate", "rejected_by_customer", "withdrawn", "not_eligible"];
const STAGE_HELP: Partial<Record<Stage, string>> = {
  contacted: "Outreach sent; waiting on the candidate.",
  interested: "Candidate confirmed interest and current availability.",
  screening: "Recruiter screening in progress.",
  interviewing: "Interviews scheduled or under way.",
  presented: "Shared with the customer — requires sharing permission and eligibility.",
  customer_review: "Customer is reviewing the candidate.",
  offered: "Offer made — overlap with other assignments checked.",
  accepted: "Offer accepted — a seat is reserved. Start the placement to fill it.",
  placed: "Placement started; this submission is complete.",
};

export function SubmissionDetailView({ detail, users, contacts, canEdit }: { detail: SubmissionDetail; users: Opt[]; contacts: (Opt & { receivesShortlists: boolean })[]; canEdit: boolean }) {
  const router = useRouter();
  const s = detail.submission;
  const c = detail.candidate;
  const r = detail.requisition;
  const name = `${c.firstName} ${c.lastName}`;
  const [taskOpen, setTaskOpen] = React.useState(false);
  const [messageOpen, setMessageOpen] = React.useState(false);
  const [interestOpen, setInterestOpen] = React.useState(false);
  const [interviewOpen, setInterviewOpen] = React.useState(false);
  const [outcomeFor, setOutcomeFor] = React.useState<SubmissionDetail["interviews"][number] | null>(null);
  const [disclosureOpen, setDisclosureOpen] = React.useState(false);
  const [consentOpen, setConsentOpen] = React.useState(false);
  const [stageTarget, setStageTarget] = React.useState<Stage | null>(null);

  const reassign = useAction(reassignSubmissionAction, { silent: true });
  const remove = useAction(deleteSubmissionAction, { successMessage: "Submission removed", onSuccess: () => router.push("/submissions") });
  const revoke = useAction(revokeDisclosureAction, { successMessage: "Disclosure marked revoked" });

  const snapshot = s.matchSnapshot;
  const isClosed = !OPEN_STAGE_ORDER.includes(s.stage as (typeof OPEN_STAGE_ORDER)[number]) && s.stage !== "placed";
  const stageIndex = OPEN_STAGE_ORDER.indexOf(s.stage as (typeof OPEN_STAGE_ORDER)[number]);
  const forward = detail.allowedStages.filter((st) => !CLOSING.includes(st) && st !== "placed" && OPEN_STAGE_ORDER.indexOf(st as never) > stageIndex);
  const backward = detail.allowedStages.filter((st) => !CLOSING.includes(st) && st !== "placed" && OPEN_STAGE_ORDER.indexOf(st as never) <= stageIndex);
  const closing = detail.allowedStages.filter((st) => CLOSING.includes(st));

  const readiness = [
    { key: "eligibility", label: "Eligibility", ok: s.eligibility === "eligible", warn: s.eligibility === "review", detail: s.eligibility === "eligible" ? `All mandatory rules pass (v${s.requirementVersion})` : s.eligibility === "review" ? "Unknown evidence — resolve or override explicitly" : "Fails a mandatory rule" },
    { key: "interest", label: "Interest confirmed", ok: Boolean(s.interestConfirmedAt), detail: s.interestConfirmedAt ? `Confirmed ${fmtRelative(s.interestConfirmedAt)}` : "Not yet confirmed with the candidate" },
    { key: "availability", label: "Availability fresh", ok: !detail.availabilityStale, detail: detail.availability?.lastConfirmedAt ? `Last confirmed ${fmtRelative(detail.availability.lastConfirmedAt)}` : "Never confirmed" },
    { key: "sharing", label: "Sharing permission", ok: Boolean(detail.sharingConsent), detail: detail.sharingConsent ? `Granted ${fmtDate(detail.sharingConsent.grantedAt)} via ${detail.sharingConsent.channel}` : `Not granted for ${detail.accountName}` },
    { key: "contact", label: "Can contact", ok: detail.canCommunicate, detail: detail.canCommunicate ? "Communication consent on file" : "No communication consent — log manual tasks only" },
  ];

  return (
    <>
      <BreadcrumbLabel segment={s.id} label={`${name} · ${r.title}`} />
      <DetailLayout
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="icon-sm" asChild aria-label="Back to submissions">
              <Link href="/submissions">
                <ArrowLeftIcon />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                <Link href={`/candidates/${c.id}`} className="truncate hover:underline">
                  {name}
                </Link>
                <ArrowRightIcon className="size-4 text-muted-foreground" />
                <Link href={`/requisitions/${r.id}`} className="truncate hover:underline">
                  {r.title}
                </Link>
                <StatusBadge value={s.stage} />
                <StatusBadge value={s.eligibility} />
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {detail.accountName} · score {s.matchScore ? Math.round(Number(s.matchScore)) : "—"} · in stage {fmtRelative(s.stageChangedAt)} · requirements v{s.requirementVersion}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {canEdit ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setTaskOpen(true)}>
                    <ClipboardListIcon data-icon="inline-start" />
                    Task
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setMessageOpen(true)}>
                    <MessageSquareIcon data-icon="inline-start" />
                    Message
                  </Button>
                  {!isClosed && s.stage !== "placed" ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setInterestOpen(true)}>
                        <PhoneCallIcon data-icon="inline-start" />
                        Confirm interest
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setInterviewOpen(true)}>
                        <CalendarPlusIcon data-icon="inline-start" />
                        Interview
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDisclosureOpen(true)} disabled={!detail.sharingConsent || s.eligibility === "ineligible"} title={!detail.sharingConsent ? "Record customer-specific sharing permission first" : undefined}>
                        <Share2Icon data-icon="inline-start" />
                        Share with customer
                      </Button>
                    </>
                  ) : null}
                  {detail.allowedStages.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm">
                          Move stage
                          <ChevronDownIcon data-icon="inline-end" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        {forward.length ? (
                          <>
                            <DropdownMenuLabel>Forward</DropdownMenuLabel>
                            {forward.map((st) => (
                              <DropdownMenuItem key={st} onSelect={() => setStageTarget(st)}>
                                {humanize(st)}
                                {st === "accepted" ? <HandshakeIcon className="ml-auto size-3.5 text-muted-foreground" /> : null}
                              </DropdownMenuItem>
                            ))}
                          </>
                        ) : null}
                        {backward.length ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>Back to</DropdownMenuLabel>
                            {backward.map((st) => (
                              <DropdownMenuItem key={st} onSelect={() => setStageTarget(st)}>
                                {humanize(st)}
                              </DropdownMenuItem>
                            ))}
                          </>
                        ) : null}
                        {closing.length ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>Close</DropdownMenuLabel>
                            {closing.map((st) => (
                              <DropdownMenuItem key={st} onSelect={() => setStageTarget(st)} variant="destructive">
                                {humanize(st)}
                              </DropdownMenuItem>
                            ))}
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                  {!["accepted", "placed"].includes(s.stage) ? (
                    <ConfirmButton title="Remove this submission?" description="The candidate stays in the pool; only this pairing is hidden. History is kept for audit." confirmLabel="Remove" destructive variant="ghost" size="icon-sm" onConfirm={() => remove.run({ id: s.id })} pending={remove.pending}>
                      <Trash2Icon />
                    </ConfirmButton>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        }
        main={
          <>
            <div className="surface p-4">
              <ol className="flex flex-wrap items-center gap-1 text-xs">
                {OPEN_STAGE_ORDER.map((st, i) => {
                  const done = stageIndex > i || s.stage === "placed";
                  const current = s.stage === st;
                  return (
                    <li key={st} className="flex items-center gap-1">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1", current ? "bg-primary text-primary-foreground" : done ? "bg-success-soft text-success-foreground" : "bg-muted text-muted-foreground")}>
                        {done ? <CheckCircle2Icon className="size-3" /> : <CircleIcon className="size-3" />}
                        {humanize(st)}
                      </span>
                      {i < OPEN_STAGE_ORDER.length - 1 ? <span className="h-px w-2 bg-border" /> : null}
                    </li>
                  );
                })}
                <li>
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1", s.stage === "placed" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    <HandshakeIcon className="size-3" />
                    Placed
                  </span>
                </li>
              </ol>
              {isClosed ? (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-danger-foreground">
                  <XCircleIcon className="size-4" />
                  Closed as <strong>{humanize(s.stage).toLowerCase()}</strong>
                  {s.decisionReason ? ` — ${humanize(s.decisionReason).toLowerCase()}` : ""}
                  {s.decisionNotes ? `: ${s.decisionNotes}` : ""}
                  {s.closedAt ? <span className="text-xs text-muted-foreground">({fmtDateTime(s.closedAt)})</span> : null}
                </p>
              ) : STAGE_HELP[s.stage] ? (
                <p className="mt-3 text-sm text-muted-foreground">{STAGE_HELP[s.stage]}</p>
              ) : null}
            </div>

            {s.eligibility === "ineligible" ? (
              <Alert variant="destructive">
                <XCircleIcon />
                <AlertTitle>Fails a mandatory rule</AlertTitle>
                <AlertDescription>{snapshot?.ruleResults.filter((x) => x.kind === "mandatory" && x.outcome === "fail").map((x) => x.reason).join(" · ") ?? "See rule results below."} This submission cannot be presented or offered until the evidence changes.</AlertDescription>
              </Alert>
            ) : null}
            {s.eligibility === "review" && !isClosed ? (
              <Alert>
                <ShieldCheckIcon />
                <AlertTitle>Eligibility under review</AlertTitle>
                <AlertDescription>{snapshot?.ruleResults.filter((x) => x.kind === "mandatory" && x.outcome === "unknown").map((x) => x.reason).join(" · ") ?? "Missing or stale evidence."} Verify the evidence on the candidate profile, or record an explicit override when moving to presented/offered.</AlertDescription>
              </Alert>
            ) : null}

            <DetailSection title="Readiness" description="Everything checked before this candidate is presented or offered. Gates are enforced server-side on every stage move.">
              <ul className="grid gap-2 sm:grid-cols-2">
                {readiness.map((item) => (
                  <li key={item.key} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                    {item.ok ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success-foreground" /> : item.warn ? <CircleIcon className="mt-0.5 size-4 shrink-0 text-warning-foreground" /> : <XCircleIcon className="mt-0.5 size-4 shrink-0 text-danger-foreground" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    {canEdit && !item.ok && item.key === "sharing" ? (
                      <Button size="xs" variant="outline" onClick={() => setConsentOpen(true)}>
                        Record
                      </Button>
                    ) : null}
                    {canEdit && !item.ok && (item.key === "interest" || item.key === "availability") ? (
                      <Button size="xs" variant="outline" onClick={() => setInterestOpen(true)}>
                        Confirm
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </DetailSection>

            <DetailSection title={`Match snapshot · v${s.requirementVersion}`} description="Saved when the submission was created and refreshed at each gate. Every reason traces back to a stored fact." defaultOpen={Boolean(snapshot)}>
              {!snapshot ? (
                <p className="text-sm text-muted-foreground">No snapshot yet — the requisition had no valid requirements when this candidate was added.</p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rule results</p>
                    <ul className="space-y-1.5">
                      {snapshot.ruleResults.map((x) => (
                        <li key={x.requirementId} className="flex items-start gap-2 text-sm">
                          <span className={cn("mt-1 size-2 shrink-0 rounded-full", x.outcome === "pass" ? "bg-success" : x.outcome === "fail" ? "bg-danger" : "bg-warning")} />
                          <span>
                            <span className={cn("text-xs font-medium uppercase", x.kind === "preferred" && "text-muted-foreground")}>{x.kind === "mandatory" ? "Must" : "Prefer"}</span> {x.reason}
                            {x.evidence ? <span className="block text-xs text-muted-foreground">Evidence: {x.evidence.fact}{x.evidence.status ? ` · ${x.evidence.status}` : ""}{x.evidence.date ? ` · ${fmtDate(x.evidence.date)}` : ""}</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score components</p>
                    <ul className="space-y-1.5">
                      {snapshot.components.map((comp) => (
                        <li key={comp.name} className="text-xs">
                          <div className="flex justify-between">
                            <span className="font-medium capitalize">{comp.name}</span>
                            <span className="tabular-nums text-muted-foreground">{Math.round(comp.score * 100)}</span>
                          </div>
                          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(comp.score * 100)}%` }} />
                          </div>
                          <p className="text-muted-foreground">{comp.detail}</p>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-[11px] text-muted-foreground">Computed {fmtDateTime(snapshot.computedAt)} · ranking {snapshot.rankingVersion}</p>
                  </div>
                </div>
              )}
            </DetailSection>

            <DetailSection title="Interviews" count={detail.interviews.length} actions={canEdit && !isClosed ? <Button variant="outline" size="sm" onClick={() => setInterviewOpen(true)}><CalendarPlusIcon data-icon="inline-start" />Schedule</Button> : undefined}>
              {detail.interviews.length === 0 ? (
                <EmptyState compact icon={CalendarPlusIcon} title="No interviews yet" description="Screening calls, technical interviews and customer interviews are recorded here with a human outcome." className="border-dashed" />
              ) : (
                <ul className="divide-y">
                  {detail.interviews.map((iv) => (
                    <li key={iv.interview.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {humanize(iv.interview.type)}
                          <StatusBadge value={iv.interview.status} />
                          {iv.interview.status === "completed" ? <StatusBadge value={iv.interview.outcome} tone={iv.interview.outcome === "pass" ? "success" : iv.interview.outcome === "fail" ? "danger" : "warning"} /> : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDateTime(iv.interview.scheduledAt)} · {iv.interview.durationMinutes} min
                          {iv.interviewerName ? ` · ${iv.interviewerName}` : ""}
                          {iv.contactName ? ` · with ${iv.contactName}` : ""}
                          {iv.interview.location ? ` · ${iv.interview.location}` : ""}
                        </p>
                        {iv.interview.meetingLink ? <a href={iv.interview.meetingLink} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{iv.interview.meetingLink}</a> : null}
                        {iv.interview.summary ? <RichText html={iv.interview.summary} className="mt-1 text-xs" /> : null}
                      </div>
                      {canEdit && iv.interview.status === "scheduled" ? (
                        <Button size="sm" variant="outline" onClick={() => setOutcomeFor(iv)}>
                          Record outcome
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection title="Disclosures" count={detail.disclosures.length} description="Every time this candidate's approved summary was shared with the customer. Withdrawn permission blocks new disclosures; delivered copies cannot be recalled.">
              {detail.disclosures.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing shared with {detail.accountName} yet.</p>
              ) : (
                <ul className="divide-y">
                  {detail.disclosures.map((d) => (
                    <li key={d.disclosure.id} className="py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          {fmtDateTime(d.disclosure.sharedAt)} via {humanize(d.disclosure.channel).toLowerCase()}
                          {d.contactName ? ` to ${d.contactName}` : ""}
                          {d.disclosure.isRevoked ? <span className="ml-2 rounded-full bg-danger-soft px-1.5 text-[11px] text-danger-foreground">revoked</span> : null}
                        </p>
                        {canEdit && !d.disclosure.isRevoked ? (
                          <ConfirmButton title="Mark this disclosure revoked?" description="Records that the customer was asked to stop using the summary. Copies already delivered cannot be recalled." confirmLabel="Revoke" variant="ghost" size="xs" onConfirm={() => revoke.run({ id: d.disclosure.id, submissionId: s.id })}>
                            Revoke
                          </ConfirmButton>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {d.sharedByName ?? "System"} · fields: {d.disclosure.fieldsShared.map(humanize).join(", ")}
                        {d.disclosure.documentIds.length ? ` · ${d.disclosure.documentIds.length} document(s)` : ""}
                      </p>
                      {d.disclosure.summaryText ? <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-sans text-xs">{d.disclosure.summaryText}</pre> : null}
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection title="Stage history" count={detail.history.length} defaultOpen={false}>
              <ol className="relative ml-2 border-l pl-5">
                {detail.history.map((h) => (
                  <li key={h.history.id} className="relative pb-3 last:pb-0">
                    <span className="absolute -left-[23px] top-1.5 size-2.5 rounded-full border bg-background" />
                    <p className="text-sm">
                      {h.history.fromStage ? `${humanize(h.history.fromStage)} → ` : ""}
                      <span className="font-medium">{humanize(h.history.toStage)}</span>
                      {h.history.reason ? <span className="text-muted-foreground"> · {humanize(h.history.reason).toLowerCase()}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {h.changedByName ?? "System"} · {fmtDateTime(h.history.createdAt)}
                      {h.history.notes ? ` · ${h.history.notes}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </DetailSection>
          </>
        }
        side={
          <>
            {detail.placement ? (
              <SidePanel title="Placement">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/placements/${detail.placement.id}`} className="font-medium hover:underline">
                    {fmtDate(detail.placement.plannedStart)} → {detail.placement.plannedEnd ? fmtDate(detail.placement.plannedEnd) : "open"}
                  </Link>
                  <StatusBadge value={detail.placement.status} />
                </div>
                <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
                  <Link href={`/placements/${detail.placement.id}`}>
                    <HandshakeIcon data-icon="inline-start" />
                    Open placement
                  </Link>
                </Button>
              </SidePanel>
            ) : null}
            <SidePanel title="Candidate">
              <div className="space-y-1 text-sm">
                <Link href={`/candidates/${c.id}`} className="font-medium hover:underline">
                  {name}
                </Link>
                <p className="text-xs text-muted-foreground">{c.headline ?? "—"}</p>
                <FieldGrid cols={2}>
                  <FieldRow label="Status" className="mt-2"><StatusBadge value={c.status} /></FieldRow>
                  <FieldRow label="Location" className="mt-2">{[c.city, c.country].filter(Boolean).join(", ") || "—"}</FieldRow>
                  <FieldRow label="Available from">{detail.availability ? fmtDate(detail.availability.availableFrom) : "—"}</FieldRow>
                  <FieldRow label="Confirmed">{detail.availability?.lastConfirmedAt ? <span className={cn(detail.availabilityStale && "text-warning-foreground")}>{fmtRelative(detail.availability.lastConfirmedAt)}</span> : <span className="text-warning-foreground">never</span>}</FieldRow>
                </FieldGrid>
                {c.phone || c.email ? <p className="pt-1 text-xs text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ")}</p> : null}
              </div>
            </SidePanel>
            <SidePanel title="Requisition">
              <div className="space-y-1 text-sm">
                <Link href={`/requisitions/${r.id}`} className="font-medium hover:underline">
                  {r.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  <Link href={`/accounts/${detail.accountId}`} className="hover:underline">
                    {detail.accountName}
                  </Link>
                  {" · "}
                  {r.locationCity ? `${r.locationCity}, ` : ""}
                  {r.locationCountry}
                </p>
                <FieldGrid cols={2}>
                  <FieldRow label="Status" className="mt-2"><StatusBadge value={r.status} /></FieldRow>
                  <FieldRow label="Start" className="mt-2">{r.startDate ? fmtDate(r.startDate) : "TBD"}</FieldRow>
                  <FieldRow label="Seats">{r.headcountApproved}</FieldRow>
                  <FieldRow label="Requirements">v{r.currentVersion}{r.currentVersion !== s.requirementVersion ? <span className="ml-1 text-xs text-warning-foreground">(matched on v{s.requirementVersion})</span> : null}</FieldRow>
                </FieldGrid>
              </div>
            </SidePanel>
            <SidePanel title="Owner">
              <div className="flex items-center gap-3">
                <Avatar className="size-9">
                  {detail.owner?.avatarUrl ? <AvatarImage src={detail.owner.avatarUrl} alt="" /> : null}
                  <AvatarFallback>{initials(detail.owner?.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <InlineField label="Accountable" value={s.ownerId} kind="select" options={users} onSave={(v) => reassign.run({ id: s.id, ownerId: v ? String(v) : "" })} readOnly={!canEdit} placeholder="Unassigned" />
                </div>
              </div>
            </SidePanel>
            <SidePanel title="Messages" action={canEdit ? <Button variant="ghost" size="xs" onClick={() => setMessageOpen(true)}>Send</Button> : undefined}>
              {detail.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No outreach yet.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.messages.slice(0, 5).map((m) => (
                    <li key={m.id} className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {m.direction === "inbound" ? "← " : "→ "}
                          {humanize(m.channel)}
                        </span>
                        <StatusBadge value={m.status} className="text-[10px]" />
                      </div>
                      <p className="truncate text-muted-foreground">{m.body}</p>
                      <p className="text-muted-foreground">{fmtRelative(m.createdAt)}{m.errorMessage ? ` · ${m.errorMessage}` : ""}</p>
                    </li>
                  ))}
                </ul>
              )}
            </SidePanel>
            <SidePanel title="Activity">
              <ActivityTimeline items={detail.activities} link={{ submissionId: s.id, candidateId: c.id, requisitionId: r.id, accountId: detail.accountId }} canWrite={canEdit} limit={10} />
            </SidePanel>
          </>
        }
      />
      {canEdit ? (
        <>
          <CreateTaskSheet open={taskOpen} onOpenChange={setTaskOpen} link={{ submissionId: s.id, candidateId: c.id, requisitionId: r.id }} users={users} />
          <SendMessageSheet open={messageOpen} onOpenChange={setMessageOpen} candidateId={c.id} submissionId={s.id} candidateName={name} canCommunicate={detail.canCommunicate} defaults={{ role: r.title, customer: detail.accountName, start_date: r.startDate ?? "" }} />
          <ConfirmInterestSheet open={interestOpen} onOpenChange={setInterestOpen} submissionId={s.id} candidateName={name} />
          <ScheduleInterviewSheet open={interviewOpen} onOpenChange={setInterviewOpen} submissionId={s.id} users={users} contacts={contacts} />
          {outcomeFor ? <InterviewOutcomeSheet interview={outcomeFor.interview} onClose={() => setOutcomeFor(null)} /> : null}
          <DisclosureSheet open={disclosureOpen} onOpenChange={setDisclosureOpen} submissionId={s.id} candidateName={name} accountName={detail.accountName} contacts={contacts} documents={detail.documents} needsOverride={s.eligibility === "review" && ["interested", "screening", "interviewing"].includes(s.stage)} />
          <SharingConsentSheet open={consentOpen} onOpenChange={setConsentOpen} candidateId={c.id} accountId={detail.accountId} accountName={detail.accountName} />
          {stageTarget ? <StageDialog submission={s} requisition={r} toStage={stageTarget} eligibility={s.eligibility} onClose={() => setStageTarget(null)} /> : null}
        </>
      ) : null}
    </>
  );
}
