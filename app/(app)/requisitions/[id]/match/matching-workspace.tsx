"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, ArrowLeftIcon, CheckIcon, ChevronDownIcon, CircleHelpIcon, ExternalLinkIcon, MinusIcon, SearchIcon, ThumbsDownIcon, ThumbsUpIcon, UserPlusIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { useViewer } from "@/components/shell/viewer-context";
import { useAction } from "@/components/app/use-action";
import { bulkCreateSubmissionsAction, createSubmissionAction, matchFeedbackAction } from "@/actions/pipeline";
import type { MatchingWorkspace } from "@/server/matching";
import type { MatchResult } from "@/lib/matching/types";
import { fmtDate, fmtRelative, humanize } from "@/lib/format";
import { describeRule, FIELD_META } from "../requirements-editor";

type Bucket = "eligible" | "review" | "ineligible";
type FeedbackAction = "accepted" | "overridden_include" | "overridden_exclude" | "rejected";
type Feedback = Record<string, { action: string; reason: string | null; at: string }>;

const BUCKET_COPY: Record<Bucket, { title: string; description: string; empty: string }> = {
  eligible: { title: "Eligible", description: "Every mandatory rule passed. Ranked by the explainable baseline for this role family.", empty: "Nobody in the pool passes every mandatory rule yet. Check the Review list — missing evidence is often the reason." },
  review: { title: "Needs review", description: "At least one mandatory rule is unknown: missing, stale or unverified evidence. Never silently passes.", empty: "No candidates are waiting on evidence." },
  ineligible: { title: "Ineligible", description: "At least one mandatory rule failed. Shown with the reason so recruiters can see what excluded them.", empty: "No candidates fail a hard rule." },
};

export function MatchingWorkspaceView({ requisition, workspace, latestFeedback }: { requisition: { id: string; title: string; status: string; locationCountry: string; startDate: string | null; headcount: number }; workspace: MatchingWorkspace; latestFeedback: Feedback }) {
  const viewer = useViewer();
  const router = useRouter();
  const canWrite = viewer.permissions.write;
  const canBulk = viewer.permissions.bulk;
  const [bucket, setBucket] = React.useState<Bucket>(workspace.eligible.length || !workspace.review.length ? "eligible" : "review");
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [feedbackFor, setFeedbackFor] = React.useState<{ candidate: MatchResult; action: FeedbackAction } | null>(null);

  const bulk = useAction(bulkCreateSubmissionsAction, {
    successMessage: (d) => `${d.created.length} submitted${d.skipped.length ? `, ${d.skipped.length} skipped` : ""}`,
    onSuccess: () => {
      setSelected([]);
      router.refresh();
    },
  });

  const list = workspace[bucket].filter((m) => !q || m.candidateName.toLowerCase().includes(q.toLowerCase()));
  const selectable = list.filter((m) => !workspace.existingSubmissions[m.candidateId]).map((m) => m.candidateId);
  const allSelected = selectable.length > 0 && selectable.every((id) => selected.includes(id));

  return (
    <>
      <BreadcrumbLabel segment={requisition.id} label={requisition.title} />
      <BreadcrumbLabel segment="match" label="Matching" />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild aria-label="Back to requisition">
          <Link href={`/requisitions/${requisition.id}`}>
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            Matching for <span className="truncate">{requisition.title}</span>
            <StatusBadge value={requisition.status} />
          </h1>
          <p className="text-xs text-muted-foreground">
            Searched the entire active pool ({workspace.poolSize} candidates) against requirements v{workspace.context.requirementVersion} · ranking {workspace.context.rankingVersion}
            {requisition.startDate ? ` · start ${fmtDate(requisition.startDate)}` : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/requisitions/${requisition.id}`}>Edit requirements</Link>
        </Button>
      </div>

      {workspace.issues.length > 0 ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Matching did not run — fix the requirements first</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {workspace.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : workspace.context.requirements.filter((r) => r.kind === "mandatory").length === 0 ? (
        <Alert>
          <CircleHelpIcon />
          <AlertTitle>No mandatory rules</AlertTitle>
          <AlertDescription>Without eligibility rules everyone in the pool is technically eligible. Add work authorisation, availability and the core skill so the list means something.</AlertDescription>
        </Alert>
      ) : null}

      <div className="surface p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rules in force (v{workspace.context.requirementVersion})</p>
        <div className="flex flex-wrap gap-1.5">
          {workspace.context.requirements.map((r) => (
            <span key={r.id} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", r.kind === "mandatory" ? "border-danger/30 bg-danger-soft/40 text-danger-foreground" : "border-primary/20 bg-primary-soft/40 text-primary")}>
              {r.kind === "mandatory" ? "Must" : "Prefer"}: {describeRule(r, requisition.locationCountry)}
              {r.evidenceRequirement === "verified" ? " (verified)" : ""}
            </span>
          ))}
          {workspace.context.requirements.length === 0 ? <span className="text-sm text-muted-foreground">No rules.</span> : null}
        </div>
      </div>

      <div className="surface">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <Tabs value={bucket} onValueChange={(v) => { setBucket(v as Bucket); setSelected([]); }}>
            <TabsList>
              {(["eligible", "review", "ineligible"] as Bucket[]).map((b) => (
                <TabsTrigger key={b} value={b} className="gap-1.5">
                  {BUCKET_COPY[b].title}
                  <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", b === "eligible" ? "bg-success-soft text-success-foreground" : b === "review" ? "bg-warning-soft text-warning-foreground" : "bg-danger-soft text-danger-foreground")}>{workspace[b].length}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name" className="h-9 w-56 pl-8" />
          </div>
          {canBulk && bucket !== "ineligible" && selectable.length > 0 ? (
            <div className="ml-auto flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={allSelected} onCheckedChange={(c) => setSelected(c ? selectable : [])} aria-label="Select all" />
                Select all not yet submitted
              </label>
              <Button size="sm" disabled={selected.length === 0 || bulk.pending} onClick={() => bulk.run({ requisitionId: requisition.id, candidateIds: selected })}>
                <UserPlusIcon data-icon="inline-start" />
                Submit {selected.length || ""} selected
              </Button>
            </div>
          ) : null}
        </div>
        <p className="border-b px-4 py-2 text-xs text-muted-foreground">{BUCKET_COPY[bucket].description}</p>
        {list.length === 0 ? (
          <EmptyState icon={bucket === "eligible" ? ThumbsUpIcon : bucket === "review" ? CircleHelpIcon : ThumbsDownIcon} title={q ? "No candidates match your filter" : `Nobody in ${BUCKET_COPY[bucket].title.toLowerCase()}`} description={q ? "Clear the name filter to see the full list." : BUCKET_COPY[bucket].empty} />
        ) : (
          <ol className="divide-y">
            {list.map((m, i) => (
              <MatchRow
                key={m.candidateId}
                rank={i + 1}
                match={m}
                bucket={bucket}
                requisition={requisition}
                existing={workspace.existingSubmissions[m.candidateId]}
                feedback={latestFeedback[m.candidateId]}
                canWrite={canWrite}
                selectable={canBulk && bucket !== "ineligible" && !workspace.existingSubmissions[m.candidateId]}
                selected={selected.includes(m.candidateId)}
                onSelect={(c) => setSelected((s) => (c ? [...s, m.candidateId] : s.filter((x) => x !== m.candidateId)))}
                onFeedback={(action) => setFeedbackFor({ candidate: m, action })}
              />
            ))}
          </ol>
        )}
      </div>

      {feedbackFor ? <FeedbackDialog requisitionId={requisition.id} candidate={feedbackFor.candidate} action={feedbackFor.action} onClose={() => setFeedbackFor(null)} /> : null}
    </>
  );
}

function outcomeIcon(outcome: "pass" | "fail" | "unknown") {
  if (outcome === "pass") return <CheckIcon className="size-3.5 text-success-foreground" />;
  if (outcome === "fail") return <XIcon className="size-3.5 text-danger-foreground" />;
  return <MinusIcon className="size-3.5 text-warning-foreground" />;
}

function MatchRow({
  rank,
  match: m,
  bucket,
  requisition,
  existing,
  feedback,
  canWrite,
  selectable,
  selected,
  onSelect,
  onFeedback,
}: {
  rank: number;
  match: MatchResult;
  bucket: Bucket;
  requisition: { id: string };
  existing?: { id: string; stage: string };
  feedback?: { action: string; reason: string | null; at: string };
  canWrite: boolean;
  selectable: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onFeedback: (action: FeedbackAction) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const submit = useAction(createSubmissionAction, { successMessage: `${m.candidateName} added to the pipeline`, onSuccess: () => router.refresh() });
  const mandatory = m.ruleResults.filter((r) => r.kind === "mandatory");
  const blockers = mandatory.filter((r) => r.outcome !== "pass");

  return (
    <li className={cn("px-4 py-3", selected && "bg-primary-soft/30")}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-start gap-3">
          {selectable ? <Checkbox checked={selected} onCheckedChange={(c) => onSelect(c === true)} className="mt-1.5" aria-label={`Select ${m.candidateName}`} /> : <span className="mt-1 w-4 text-center text-xs text-muted-foreground">{bucket === "eligible" ? rank : ""}</span>}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/candidates/${m.candidateId}`} className="font-medium hover:underline">
                {m.candidateName}
              </Link>
              <StatusBadge value={m.eligibility} />
              {existing ? (
                <Link href={`/submissions/${existing.id}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs hover:underline">
                  In pipeline · {humanize(existing.stage)}
                  <ExternalLinkIcon className="size-3" />
                </Link>
              ) : null}
              {feedback ? (
                <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground" title={feedback.reason ?? ""}>
                  Recruiter: {humanize(feedback.action)} {fmtRelative(feedback.at)}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {bucket === "eligible"
                ? `${mandatory.length}/${mandatory.length} hard rules pass${m.unmetPreferences.length ? ` · ${m.unmetPreferences.length} preference${m.unmetPreferences.length > 1 ? "s" : ""} unmet` : " · all preferences met"}`
                : blockers.map((b) => b.reason).join(" · ")}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {m.ruleResults.map((r) => (
                <Tooltip key={r.requirementId}>
                  <TooltipTrigger asChild>
                    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs", r.outcome === "pass" ? "border-success/30 bg-success-soft/40" : r.outcome === "fail" ? "border-danger/30 bg-danger-soft/40" : "border-warning/40 bg-warning-soft/40", r.kind === "preferred" && "border-dashed")}>
                      {outcomeIcon(r.outcome)}
                      {FIELD_META[r.field as keyof typeof FIELD_META]?.label ?? r.field}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="font-medium">{r.kind === "mandatory" ? "Mandatory" : "Preferred"} · {r.outcome}</p>
                    <p>{r.reason}</p>
                    {r.evidence ? <p className="mt-1 text-xs opacity-80">Evidence: {r.evidence.fact}{r.evidence.status ? ` (${r.evidence.status}${r.evidence.date ? `, ${fmtDate(r.evidence.date)}` : ""})` : ""}</p> : null}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums leading-none">{Math.round(m.score)}</p>
              <p className="text-[11px] text-muted-foreground">match score</p>
            </div>
            <div className="flex items-center gap-1">
              {canWrite && !existing && bucket !== "ineligible" ? (
                <Button size="sm" variant={bucket === "eligible" ? "default" : "outline"} onClick={() => submit.run({ requisitionId: requisition.id, candidateId: m.candidateId, ownerId: "", sourceId: "", notes: "" })} disabled={submit.pending}>
                  <UserPlusIcon data-icon="inline-start" />
                  Submit
                </Button>
              ) : null}
              {canWrite ? (
                <>
                  {bucket === "eligible" ? (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon-sm" variant="ghost" aria-label="Good suggestion" onClick={() => onFeedback("accepted")}>
                            <ThumbsUpIcon />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Good suggestion</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon-sm" variant="ghost" aria-label="Not relevant" onClick={() => onFeedback("rejected")}>
                            <ThumbsDownIcon />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Not relevant — record why</TooltipContent>
                      </Tooltip>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => onFeedback("overridden_include")}>
                      Override
                    </Button>
                  )}
                </>
              ) : null}
              <CollapsibleTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="Show evidence">
                  <ChevronDownIcon className={cn("transition-transform", open && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </div>
        <CollapsibleContent>
          <div className="mt-3 grid gap-4 rounded-lg border bg-muted/30 p-4 lg:grid-cols-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score components</p>
              <ul className="space-y-1.5">
                {m.components.map((c) => (
                  <li key={c.name} className="text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium capitalize">{c.name}</span>
                      <span className="tabular-nums text-muted-foreground">{Math.round(c.score * 100)} × {c.weight}</span>
                    </div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(c.score * 100)}%` }} />
                    </div>
                    <p className="text-muted-foreground">{c.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rule results</p>
              <ul className="space-y-1">
                {m.ruleResults.map((r) => (
                  <li key={r.requirementId} className="flex items-start gap-1.5 text-xs">
                    <span className="mt-0.5">{outcomeIcon(r.outcome)}</span>
                    <span>
                      <span className={cn("font-medium", r.kind === "preferred" && "text-muted-foreground")}>{r.kind === "mandatory" ? "Must" : "Prefer"}</span> · {r.reason}
                      {r.evidence?.date ? <span className="text-muted-foreground"> — {fmtDate(r.evidence.date)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
              {m.unmetPreferences.length ? (
                <>
                  <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unmet preferences</p>
                  <ul className="list-disc pl-4 text-xs text-muted-foreground">
                    {m.unmetPreferences.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supporting facts</p>
              {m.supportingFacts.length === 0 ? (
                <p className="text-xs text-muted-foreground">No relevant facts recorded.</p>
              ) : (
                <ul className="space-y-1">
                  {m.supportingFacts.map((f, i) => (
                    <li key={`${f.label}-${i}`} className="flex items-start justify-between gap-2 text-xs">
                      <span>
                        <span className="font-medium">{f.label}</span>: {f.value}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {f.verification ? <StatusBadge value={f.verification} className="text-[10px]" /> : null}
                        {f.date ? <span className="ml-1">{fmtDate(f.date)}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                Computed {fmtRelative(m.computedAt)} · requirements v{m.requirementVersion} · ranking {m.rankingVersion}
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

const FEEDBACK_REASONS: Record<FeedbackAction, { title: string; description: string; reasons: string[] }> = {
  accepted: { title: "Good suggestion", description: "Records that the ranking surfaced a relevant candidate. Used to compare ranking versions.", reasons: ["Strong skill fit", "Right availability", "Customer asked for this profile", "Other"] },
  rejected: { title: "Not relevant", description: "Tell us what the ranking missed so weights can be tuned per role family.", reasons: ["Skills overstated", "Wrong seniority", "Location impractical", "Customer would not accept", "Other"] },
  overridden_include: { title: "Override — include anyway", description: "You are choosing to consider a candidate the rules did not clear. The reason is logged and shown on the submission.", reasons: ["Evidence in hand, not yet uploaded", "Rule too strict for this customer", "Candidate known to the team", "Other"] },
  overridden_exclude: { title: "Override — exclude", description: "Exclude an eligible candidate; the reason is logged.", reasons: ["Do not present to this customer", "Recent poor outcome", "Other"] },
};

function FeedbackDialog({ requisitionId, candidate, action, onClose }: { requisitionId: string; candidate: MatchResult; action: FeedbackAction; onClose: () => void }) {
  const router = useRouter();
  const copy = FEEDBACK_REASONS[action];
  const [reason, setReason] = React.useState(copy.reasons[0] ?? "Other");
  const [notes, setNotes] = React.useState("");
  const feedback = useAction(matchFeedbackAction, { successMessage: "Feedback recorded", onSuccess: onClose });
  const submit = useAction(createSubmissionAction, { successMessage: `${candidate.candidateName} added to the pipeline with an override`, onSuccess: () => { onClose(); router.refresh(); } });
  const needsNotes = reason === "Other" || action.startsWith("overridden");

  const go = async () => {
    const result = await feedback.run({ requisitionId, candidateId: candidate.candidateId, action, reason, notes });
    if (result?.ok && action === "overridden_include") {
      await submit.run({ requisitionId, candidateId: candidate.candidateId, ownerId: "", sourceId: "", notes: `Override include: ${reason}${notes ? ` — ${notes}` : ""}` });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {copy.title} · {candidate.candidateName}
          </DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {copy.reasons.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fb-notes">Notes{needsNotes ? <span className="ml-0.5 text-destructive">*</span> : null}</Label>
            <Textarea id="fb-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={action === "overridden_include" ? "What evidence or context justifies including this candidate?" : "Optional detail"} maxLength={1000} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={go} disabled={feedback.pending || submit.pending || (needsNotes && notes.trim().length < 3)}>
            {action === "overridden_include" ? "Record and submit" : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
