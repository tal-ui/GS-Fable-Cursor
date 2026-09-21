"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, ShieldAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SlideOver } from "@/components/app/slide-over";
import { CheckboxField, DateField, Form, FormRow, NumberField, SelectField, SubmitButton, SwitchField, TextField, TextareaField, enumOptions, useFieldValue, useZodForm } from "@/components/app/form";
import { RichTextField } from "@/components/app/rich-text";
import { useAction } from "@/components/app/use-action";
import { changeStageAction, confirmInterestAction, discloseCandidateAction, interviewOutcomeAction, scheduleInterviewAction } from "@/actions/pipeline";
import { grantConsentAction } from "@/actions/candidates";
import { confirmInterestSchema, disclosureSchema, interviewOutcomeSchema, interviewSchema, stageChangeSchema } from "@/lib/schemas/pipeline";
import { consentSchema } from "@/lib/schemas/candidates";
import type { SubmissionDetail } from "@/server/pipeline/submissions";
import { humanize, toDateTimeInput } from "@/lib/format";

type Opt = { value: string; label: string };
type Stage = SubmissionDetail["submission"]["stage"];

const CHANNELS = enumOptions(["phone", "whatsapp", "email", "in_person"]);
const INTERVIEW_TYPES = enumOptions(["screening_call", "technical", "customer_interview", "reference_check"]);
const DECISION_REASONS = enumOptions(["compensation_mismatch", "availability_conflict", "location_mismatch", "missing_evidence", "failed_interview", "customer_preference", "candidate_withdrew", "duplicate", "seat_unavailable", "other"]);
const DISCLOSURE_CHANNELS = enumOptions(["email", "whatsapp", "phone", "in_person", "portal"]);
const SHAREABLE = [
  { key: "headline", label: "Headline" },
  { key: "summary", label: "Profile summary" },
  { key: "skills", label: "Skills and verification status" },
  { key: "languages", label: "Languages" },
  { key: "availability", label: "Availability window" },
  { key: "work_authorization", label: "Work authorization (destination)" },
  { key: "military_role", label: "Military role and service dates" },
  { key: "experience", label: "Years of experience" },
  { key: "location", label: "Current city / country" },
  { key: "compensation", label: "Expected compensation" },
];

export function ConfirmInterestSheet({ open, onOpenChange, submissionId, candidateName }: { open: boolean; onOpenChange: (o: boolean) => void; submissionId: string; candidateName: string }) {
  const form = useZodForm(confirmInterestSchema, { submissionId, interest: true, availabilityConfirmed: true, channel: "phone", notes: "" });
  const { run, pending, fieldErrors } = useAction(confirmInterestAction, { successMessage: "Interest and availability recorded", onSuccess: () => onOpenChange(false) });
  return (
    <SlideOver open={open} onOpenChange={onOpenChange} title="Confirm interest" description={`Record that you spoke with ${candidateName} about this role. Confirming availability refreshes the candidate's last-confirmed date for every requisition.`} size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <SwitchField name="interest" label="Candidate is interested" description="Turn off to record that they declined interest (you can then close the submission)." />
        <SwitchField name="availabilityConfirmed" label="Availability re-confirmed" description="Candidate confirmed the availability window on their profile is still accurate." />
        <SelectField name="channel" label="How did you confirm?" options={CHANNELS} required />
        <TextareaField name="notes" label="Notes" placeholder="Anything relevant: preferred start, questions asked, concerns" />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Record</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}

export function ScheduleInterviewSheet({ open, onOpenChange, submissionId, users, contacts }: { open: boolean; onOpenChange: (o: boolean) => void; submissionId: string; users: Opt[]; contacts: Opt[] }) {
  const form = useZodForm(interviewSchema, { id: "", submissionId, type: "screening_call", scheduledAt: "", durationMinutes: 30, interviewerId: "", customerContactId: "", location: "", meetingLink: "", notes: "" });
  const type = useFieldValue(form, "type");
  const { run, pending, fieldErrors } = useAction(scheduleInterviewAction, {
    successMessage: "Interview scheduled — a reminder task was created",
    onSuccess: () => {
      onOpenChange(false);
      form.reset();
    },
  });
  return (
    <SlideOver open={open} onOpenChange={onOpenChange} title="Schedule interview" description="Human interviews only. AI chat screening is a later extension and always shows a disclosure first." size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <SelectField name="type" label="Type" options={INTERVIEW_TYPES} required />
        <FormRow>
          <DateField name="scheduledAt" label="When" withTime required />
          <NumberField name="durationMinutes" label="Duration (min)" min={5} required />
        </FormRow>
        <SelectField name="interviewerId" label="Interviewer (our side)" options={users} allowEmpty emptyLabel="Me" />
        {type === "customer_interview" ? <SelectField name="customerContactId" label="Customer contact" options={contacts} allowEmpty emptyLabel="Not specified" /> : null}
        <FormRow>
          <TextField name="location" label="Location" placeholder="Office, site, phone" />
          <TextField name="meetingLink" label="Meeting link" placeholder="https://" />
        </FormRow>
        <TextareaField name="notes" label="Preparation notes" />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Schedule</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}

export function InterviewOutcomeSheet({ interview, onClose }: { interview: SubmissionDetail["interviews"][number]["interview"]; onClose: () => void }) {
  const form = useZodForm(interviewOutcomeSchema, { id: interview.id, status: "completed", outcome: "pass", summary: "" });
  const status = useFieldValue(form, "status");
  const { run, pending, fieldErrors } = useAction(interviewOutcomeAction, { successMessage: "Interview outcome recorded", onSuccess: onClose });
  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title={`${humanize(interview.type)} · outcome`} description={`Scheduled ${toDateTimeInput(interview.scheduledAt).replace("T", " ")}. Outcomes are recorded by a person; nothing is inferred.`} size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <SelectField name="status" label="What happened" options={[{ value: "completed", label: "Completed" }, { value: "cancelled", label: "Cancelled" }, { value: "no_show", label: "No-show" }]} required />
        {status === "completed" ? <SelectField name="outcome" label="Outcome" options={[{ value: "pass", label: "Pass — proceed" }, { value: "hold", label: "Hold — need more information" }, { value: "fail", label: "Fail — do not proceed" }]} required /> : null}
        <RichTextField name="summary" label="Summary" placeholder="Evidence-linked notes: what was demonstrated, what remains unverified. Avoid inferences about personality or background." />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Save outcome</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}

export function SharingConsentSheet({ open, onOpenChange, candidateId, accountId, accountName }: { open: boolean; onOpenChange: (o: boolean) => void; candidateId: string; accountId: string; accountName: string }) {
  const form = useZodForm(consentSchema, { candidateId, scope: "share_with_customer", accountId, channel: "phone", noticeVersion: "privacy-notice-v1", evidence: "", evidenceDocumentId: "" });
  const { run, pending, fieldErrors } = useAction(grantConsentAction, { successMessage: `Sharing permission for ${accountName} recorded`, onSuccess: () => onOpenChange(false) });
  return (
    <SlideOver open={open} onOpenChange={onOpenChange} title="Record sharing permission" description={`Customer-specific: the candidate agrees that their approved summary may be shared with ${accountName}. Withdrawal later blocks new disclosures.`} size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <Alert>
          <ShieldAlertIcon />
          <AlertTitle>Scope: share with {accountName}</AlertTitle>
          <AlertDescription>This does not grant permission for other customers. Each employer needs its own record.</AlertDescription>
        </Alert>
        <SelectField name="channel" label="How was permission given?" options={enumOptions(["web_form", "whatsapp", "email", "phone", "paper"])} required />
        <TextField name="noticeVersion" label="Privacy notice version" required />
        <TextareaField name="evidence" label="Evidence" placeholder="e.g. Verbal consent on call 14 Sep, recorded by J. Smith; or paste the WhatsApp reply" required />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Record permission</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}

export function DisclosureSheet({
  open,
  onOpenChange,
  submissionId,
  candidateName,
  accountName,
  contacts,
  documents,
  needsOverride,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  submissionId: string;
  candidateName: string;
  accountName: string;
  contacts: (Opt & { receivesShortlists: boolean })[];
  documents: SubmissionDetail["documents"];
  /** Eligibility is "review" and sharing would move the submission to presented. */
  needsOverride: boolean;
}) {
  const defaultContact = contacts.find((c) => c.receivesShortlists)?.value ?? "";
  const form = useZodForm(disclosureSchema, { submissionId, contactId: defaultContact, channel: "email", fieldsShared: ["headline", "skills", "languages", "availability", "work_authorization", "experience", "location"], documentIds: [], notes: "", overrideReview: false });
  const fields = useFieldValue(form, "fieldsShared") ?? [];
  const docIds = useFieldValue(form, "documentIds") ?? [];
  const [summary, setSummary] = React.useState<string | null>(null);
  const { run, pending, fieldErrors } = useAction(discloseCandidateAction, {
    successMessage: "Disclosure logged and candidate presented",
    onSuccess: (d) => setSummary(d.summary),
  });
  const toggle = (key: string) => form.setValue("fieldsShared", fields.includes(key) ? fields.filter((f) => f !== key) : [...fields, key], { shouldValidate: true });
  const toggleDoc = (id: string) => form.setValue("documentIds", docIds.includes(id) ? docIds.filter((d) => d !== id) : [...docIds, id], { shouldValidate: true });
  const shareable = documents.filter((d) => !d.isSensitive && !["passport", "id_document"].includes(d.kind));

  return (
    <SlideOver open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSummary(null); }} title="Share with customer" description={`Only the approved fields below leave the system. The summary is logged against ${accountName} with who, what and through which channel.`} size="md">
      {summary ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Summary delivered content</AlertTitle>
            <AlertDescription>This is exactly what was shared. Copy it into the channel you chose if it was not sent automatically.</AlertDescription>
          </Alert>
          <pre className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 font-sans text-sm">{summary}</pre>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigator.clipboard?.writeText(summary)}>
              Copy
            </Button>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </div>
      ) : (
        <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
          {needsOverride ? (
            <Alert>
              <AlertTriangleIcon />
              <AlertTitle>Eligibility is under review</AlertTitle>
              <AlertDescription>Some mandatory evidence is missing or stale. Sharing will present the candidate, which needs an explicit, logged override.</AlertDescription>
            </Alert>
          ) : null}
          {needsOverride ? <CheckboxField name="overrideReview" label="I have checked the evidence and take responsibility for presenting" description="Recorded in the audit log with your name." /> : null}
          <FormRow>
            <SelectField name="contactId" label="Customer contact" options={contacts} allowEmpty emptyLabel="Not specified" hint="Contacts flagged 'receives shortlists' are preselected" />
            <SelectField name="channel" label="Channel" options={DISCLOSURE_CHANNELS} required />
          </FormRow>
          <div className="grid gap-1.5">
            <Label>Fields to share</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {SHAREABLE.map((f) => (
                <label key={f.key} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                  <Checkbox checked={fields.includes(f.key)} onCheckedChange={() => toggle(f.key)} />
                  {f.label}
                </label>
              ))}
            </div>
            {fieldErrors.fieldsShared ? <p className="text-xs text-destructive">{fieldErrors.fieldsShared}</p> : null}
          </div>
          <div className="grid gap-1.5">
            <Label>Documents (optional)</Label>
            {shareable.length === 0 ? (
              <p className="text-xs text-muted-foreground">No shareable documents. Identity documents and sensitive files are never included in a summary.</p>
            ) : (
              <div className="grid gap-1.5">
                {shareable.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                    <Checkbox checked={docIds.includes(d.id)} onCheckedChange={() => toggleDoc(d.id)} />
                    {d.filename} <span className="text-xs text-muted-foreground">({humanize(d.kind)})</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <TextareaField name="notes" label="Notes" placeholder="Context for the log, e.g. 'Sent as part of Friday shortlist of 3'" />
          <p className="text-xs text-muted-foreground">Name is reduced to first name and initial. Compensation is only included if you tick it. {candidateName} will appear as “{candidateName.split(" ")[0]} {candidateName.split(" ").slice(-1)[0]?.charAt(0)}.”</p>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pending={pending}>Share and log</SubmitButton>
          </div>
        </Form>
      )}
    </SlideOver>
  );
}

export function StageDialog({ submission, requisition, toStage, eligibility, onClose }: { submission: SubmissionDetail["submission"]; requisition: SubmissionDetail["requisition"]; toStage: Stage; eligibility: string; onClose: () => void }) {
  const router = useRouter();
  const closing = ["declined_by_candidate", "rejected_by_customer", "withdrawn", "not_eligible"].includes(toStage);
  const gate = ["presented", "customer_review", "offered", "accepted"].includes(toStage);
  const form = useZodForm(stageChangeSchema, { submissionId: submission.id, toStage, reason: "", notes: "", plannedStart: requisition.startDate ?? "", plannedEnd: requisition.endDate ?? "", overrideReview: false });
  const { run, pending, fieldErrors } = useAction(changeStageAction, {
    successMessage: (d) => (d.placementId ? "Offer accepted — seat reserved" : `Moved to ${humanize(d.stage).toLowerCase()}`),
    onSuccess: (d) => {
      onClose();
      if (d.placementId) router.push(`/placements/${d.placementId}`);
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Move to {humanize(toStage).toLowerCase()}</DialogTitle>
          <DialogDescription>
            {toStage === "accepted"
              ? "Accepting reserves one seat on the requisition atomically and checks for overlapping assignments."
              : closing
                ? "Closing this submission does not affect the candidate's other submissions. A structured reason is required."
                : gate
                  ? "Eligibility and customer sharing permission are re-checked now."
                  : "The stage change is logged with who and when."}
          </DialogDescription>
        </DialogHeader>
        <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
          {gate && eligibility === "review" ? (
            <Alert>
              <AlertTriangleIcon />
              <AlertTitle>Eligibility is under review</AlertTitle>
              <AlertDescription>Some mandatory evidence is missing or stale. You can proceed only with an explicit, logged override.</AlertDescription>
            </Alert>
          ) : null}
          {gate && eligibility === "review" ? <CheckboxField name="overrideReview" label="I have checked the evidence and take responsibility for proceeding" description="Recorded in the audit log with your name." /> : null}
          {closing ? <SelectField name="reason" label="Reason" options={DECISION_REASONS} required /> : null}
          {toStage === "accepted" || toStage === "offered" ? (
            <FormRow>
              <DateField name="plannedStart" label="Planned start" required={toStage === "accepted"} />
              <DateField name="plannedEnd" label="Planned end" />
            </FormRow>
          ) : null}
          <TextareaField name="notes" label="Notes" placeholder={closing ? "What was said, by whom" : "Optional context"} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pending={pending}>{toStage === "accepted" ? "Accept and reserve seat" : `Move to ${humanize(toStage).toLowerCase()}`}</SubmitButton>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
