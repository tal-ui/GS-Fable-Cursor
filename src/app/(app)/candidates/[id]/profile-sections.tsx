"use client";

import * as React from "react";
import { BanknoteIcon, CalendarCheckIcon, CalendarClockIcon, DownloadIcon, FileIcon, FileUpIcon, LinkIcon, PlusIcon, ShieldIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { DetailSection, FieldGrid, FieldRow } from "@/components/app/detail-layout";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { SlideOver } from "@/components/app/slide-over";
import { ConfirmButton } from "@/components/app/confirm-button";
import { CURRENCY_OPTIONS, DateField, Form, FormRow, NumberField, PERIOD_OPTIONS, SelectField, SubmitButton, SwitchField, TextField, TextareaField, enumOptions, useFieldValue, useZodForm } from "@/components/app/form";
import { LookupField } from "@/components/app/lookup-field";
import { useAction } from "@/components/app/use-action";
import { confirmAvailabilityAction, grantConsentAction, removeCompensationAction, setAvailabilityAction, upsertCompensationAction, withdrawConsentAction } from "@/actions/candidates";
import { deleteDocumentAction, uploadDocumentAction } from "@/actions/documents";
import { searchAccountsAction } from "@/actions/lookups";
import { availabilitySchema, compensationSchema, consentSchema } from "@/lib/schemas/candidates";
import type { CandidateDetail } from "@/server/candidates/queries";
import { fmtDate, fmtDateTime, fmtMoney, fmtRelative, humanize, toDateInput } from "@/lib/format";
import { RequestDocumentsSheet } from "./upload-link-sheet";

const ROTATION = enumOptions(["no_preference", "short_rotation", "long_rotation", "fixed_term", "permanent"]);
const DOC_KINDS = enumOptions(["cv", "passport", "id_document", "certificate", "license", "contract", "photo", "transcript", "other"], { cv: "CV", id_document: "ID document" });

// ---------- Availability ----------

export function AvailabilitySection({ candidateId, rows, canEdit }: { candidateId: string; rows: CandidateDetail["availability"]; canEdit: boolean }) {
  const [open, setOpen] = React.useState(false);
  const current = rows.find((r) => r.isCurrent) ?? null;
  const history = rows.filter((r) => !r.isCurrent);
  const confirm = useAction(confirmAvailabilityAction, { successMessage: "Availability confirmed — matching snapshots refresh in the background" });
  return (
    <DetailSection
      title="Availability"
      description="Dated, with a last-confirmed timestamp. Stale availability moves the candidate into the review list instead of the eligible list."
      actions={
        canEdit ? (
          <>
            {current ? (
              <Button variant="outline" size="sm" onClick={() => confirm.run({ candidateId, channel: "phone" })} disabled={confirm.pending}>
                <CalendarCheckIcon data-icon="inline-start" />
                Still accurate
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              {current ? "Update" : "Set availability"}
            </Button>
          </>
        ) : undefined
      }
    >
      {!current ? (
        <EmptyState compact icon={CalendarClockIcon} title="Availability unknown" description="Without a dated availability the candidate cannot be matched against start dates." className="border-dashed" />
      ) : (
        <FieldGrid cols={3}>
          <FieldRow label="Available from">{fmtDate(current.availableFrom)}</FieldRow>
          <FieldRow label="Until">{current.availableUntil ? fmtDate(current.availableUntil) : "Open-ended"}</FieldRow>
          <FieldRow label="Rotation">{humanize(current.rotationPreference)}</FieldRow>
          <FieldRow label="Duration">
            {current.minDurationWeeks || current.maxDurationWeeks ? `${current.minDurationWeeks ?? "?"}–${current.maxDurationWeeks ?? "?"} weeks` : "Flexible"}
          </FieldRow>
          <FieldRow label="Relocation">{current.willingToRelocate ? "Willing" : "Not willing"}{current.relocationConstraints ? ` · ${current.relocationConstraints}` : ""}</FieldRow>
          <FieldRow label="Last confirmed" hint={current.confirmationChannel ? `via ${current.confirmationChannel}` : undefined}>
            {current.lastConfirmedAt ? <span title={fmtDateTime(current.lastConfirmedAt)}>{fmtRelative(current.lastConfirmedAt)}</span> : <span className="text-warning-foreground">Never confirmed</span>}
          </FieldRow>
          {current.notes ? (
            <FieldRow label="Notes" className="sm:col-span-3">
              {current.notes}
            </FieldRow>
          ) : null}
        </FieldGrid>
      )}
      {history.length ? (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Previous availability records ({history.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {history.map((h) => (
              <li key={h.id}>
                {fmtDate(h.availableFrom)} → {h.availableUntil ? fmtDate(h.availableUntil) : "open"} · recorded {fmtDate(h.createdAt)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {open ? <AvailabilitySheet candidateId={candidateId} current={current} onClose={() => setOpen(false)} /> : null}
    </DetailSection>
  );
}

function AvailabilitySheet({ candidateId, current, onClose }: { candidateId: string; current: CandidateDetail["availability"][number] | null; onClose: () => void }) {
  const form = useZodForm(availabilitySchema, {
    candidateId,
    availableFrom: toDateInput(current?.availableFrom) || toDateInput(new Date()),
    availableUntil: toDateInput(current?.availableUntil),
    minDurationWeeks: current?.minDurationWeeks ?? "",
    maxDurationWeeks: current?.maxDurationWeeks ?? "",
    rotationPreference: current?.rotationPreference ?? "no_preference",
    willingToRelocate: current?.willingToRelocate ?? true,
    relocationConstraints: current?.relocationConstraints ?? "",
    confirmedNow: true,
    confirmationChannel: "phone",
    notes: "",
  });
  const { run, pending, fieldErrors } = useAction(setAvailabilityAction, { successMessage: "Availability updated", onSuccess: onClose });
  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title="Update availability" description="A new dated record is created; the previous one is kept for history." size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <FormRow>
          <DateField name="availableFrom" label="Available from" required />
          <DateField name="availableUntil" label="Available until" />
        </FormRow>
        <FormRow>
          <NumberField name="minDurationWeeks" label="Min duration (weeks)" min={0} />
          <NumberField name="maxDurationWeeks" label="Max duration (weeks)" min={0} />
        </FormRow>
        <SelectField name="rotationPreference" label="Rotation preference" options={ROTATION} />
        <SwitchField name="willingToRelocate" label="Willing to relocate" />
        <TextField name="relocationConstraints" label="Relocation constraints" placeholder="e.g. EU only, family in NL" />
        <FormRow>
          <SwitchField name="confirmedNow" label="Confirmed with candidate now" />
          <TextField name="confirmationChannel" label="Via" placeholder="phone, WhatsApp, email…" />
        </FormRow>
        <TextareaField name="notes" label="Notes" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Save availability</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}

// ---------- Compensation ----------

export function CompensationSection({ candidateId, rows, canEdit }: { candidateId: string; rows: CandidateDetail["compensation"]; canEdit: boolean }) {
  const [editing, setEditing] = React.useState<CandidateDetail["compensation"][number] | null | "new">(null);
  const remove = useAction(removeCompensationAction, { successMessage: "Compensation record removed" });
  return (
    <DetailSection
      title="Compensation"
      count={rows.length}
      defaultOpen={rows.length > 0}
      description="Every figure carries currency, period and gross/net so it can be compared to a requisition without guessing."
      actions={
        canEdit ? (
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            <PlusIcon data-icon="inline-start" />
            Add
          </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState compact icon={BanknoteIcon} title="No compensation recorded" className="border-dashed" />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{r.type}</p>
                <p className="font-medium">
                  {fmtMoney(r.amount, r.currency, r.period)} <span className="text-xs font-normal text-muted-foreground">{r.grossNet}</span>
                </p>
                {r.effectiveDate ? <p className="text-xs text-muted-foreground">from {fmtDate(r.effectiveDate)}</p> : null}
                {r.notes ? <p className="text-xs text-muted-foreground">{r.notes}</p> : null}
              </div>
              {canEdit ? (
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                    Edit
                  </Button>
                  <ConfirmButton title="Remove this record?" description="It is soft-deleted and no longer used in matching." confirmLabel="Remove" destructive variant="ghost" size="icon-sm" onConfirm={() => remove.run({ id: r.id, candidateId })}>
                    <Trash2Icon />
                  </ConfirmButton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editing ? <CompensationSheet candidateId={candidateId} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </DetailSection>
  );
}

function CompensationSheet({ candidateId, row, onClose }: { candidateId: string; row: CandidateDetail["compensation"][number] | null; onClose: () => void }) {
  const form = useZodForm(compensationSchema, { id: row?.id ?? "", candidateId, type: row?.type ?? "expected", amount: row ? Number(row.amount) : "", currency: row?.currency ?? "EUR", period: row?.period ?? "hourly", grossNet: row?.grossNet ?? "gross", effectiveDate: toDateInput(row?.effectiveDate), notes: row?.notes ?? "" });
  const { run, pending, fieldErrors } = useAction(upsertCompensationAction, { successMessage: "Compensation saved", onSuccess: onClose });
  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title={row ? "Edit compensation" : "Add compensation"} size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <SelectField name="type" label="Type" options={enumOptions(["expected", "minimum", "current", "offered"])} required />
        <FormRow>
          <NumberField name="amount" label="Amount" step="0.01" min={0} required />
          <SelectField name="currency" label="Currency" options={CURRENCY_OPTIONS} required />
        </FormRow>
        <FormRow>
          <SelectField name="period" label="Period" options={PERIOD_OPTIONS} required />
          <SelectField name="grossNet" label="Gross / net" options={[{ value: "gross", label: "Gross" }, { value: "net", label: "Net" }]} required />
        </FormRow>
        <DateField name="effectiveDate" label="Effective date" />
        <TextareaField name="notes" label="Notes" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Save</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}

// ---------- Consents ----------

export function ConsentsSection({ candidateId, rows, canEdit }: { candidateId: string; rows: CandidateDetail["consents"]; canEdit: boolean }) {
  const [open, setOpen] = React.useState(false);
  const withdraw = useAction(withdrawConsentAction, { successMessage: "Consent withdrawn — open submissions are blocked from disclosure" });
  return (
    <DetailSection
      title="Permissions & consent"
      count={rows.filter((r) => !r.consent.withdrawnAt).length}
      description="Three scopes: process the profile, contact the person, share with a specific customer. Sharing requires an active per-customer consent."
      actions={
        canEdit ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Record consent
          </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState compact icon={ShieldIcon} title="No consent on file" description="Without processing consent this profile should not be kept." className="border-dashed" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Scope</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Granted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ consent, accountName, recordedByName }) => {
              const active = !consent.withdrawnAt;
              return (
                <TableRow key={consent.id} className={active ? undefined : "opacity-60"}>
                  <TableCell>
                    <p className="font-medium">{humanize(consent.scope)}</p>
                    <p className="text-xs text-muted-foreground">
                      via {humanize(consent.channel)} · {consent.noticeVersion}
                      {consent.evidence ? ` · ${consent.evidence}` : ""}
                    </p>
                  </TableCell>
                  <TableCell>{accountName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm">
                    {fmtDate(consent.grantedAt)}
                    <span className="block text-xs text-muted-foreground">{recordedByName ?? "System"}</span>
                  </TableCell>
                  <TableCell>{active ? <StatusBadge value="active" label="Active" /> : <StatusBadge value="withdrawn" label={`Withdrawn ${fmtDate(consent.withdrawnAt)}`} />}</TableCell>
                  <TableCell className="text-right">
                    {active && canEdit ? (
                      <ConfirmButton title="Withdraw this consent?" description="Takes effect immediately: outreach or disclosure that depends on it is blocked and any open submission is flagged." confirmLabel="Withdraw" destructive variant="ghost" size="sm" onConfirm={() => withdraw.run({ consentId: consent.id, reason: "Withdrawn by recruiter on candidate request" })}>
                        Withdraw
                      </ConfirmButton>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {open ? <ConsentSheet candidateId={candidateId} onClose={() => setOpen(false)} /> : null}
    </DetailSection>
  );
}

function ConsentSheet({ candidateId, onClose }: { candidateId: string; onClose: () => void }) {
  const form = useZodForm(consentSchema, { candidateId, scope: "communicate", accountId: "", channel: "phone", noticeVersion: "privacy-notice-v1", evidence: "", evidenceDocumentId: "" });
  const scope = useFieldValue(form, "scope");
  const { run, pending, fieldErrors } = useAction(grantConsentAction, { successMessage: "Consent recorded", onSuccess: onClose });
  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title="Record consent" description="Capture what the candidate agreed to, when and how. Sharing consent is per customer." size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <SelectField name="scope" label="Scope" options={[{ value: "process_profile", label: "Process profile" }, { value: "communicate", label: "Contact about roles" }, { value: "share_with_customer", label: "Share with a customer" }]} required />
        {scope === "share_with_customer" ? <LookupField name="accountId" label="Customer" fetcher={searchAccountsAction} placeholder="Search accounts…" required hint="Sharing consent is only valid for this customer." /> : null}
        <FormRow>
          <SelectField name="channel" label="Captured via" options={enumOptions(["web_form", "whatsapp", "email", "phone", "paper", "import"], { web_form: "Web form", whatsapp: "WhatsApp" })} required />
          <TextField name="noticeVersion" label="Notice version" required />
        </FormRow>
        <TextareaField name="evidence" label="Evidence" placeholder="e.g. WhatsApp message on 3 Mar: “yes, you can share my profile with Northsea Yards”" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Record consent</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}

// ---------- Documents ----------

export function DocumentsSection({ candidateId, candidateName, rows, links, canEdit }: { candidateId: string; candidateName: string; rows: CandidateDetail["documents"]; links: CandidateDetail["uploadLinks"]; canEdit: boolean }) {
  const [kind, setKind] = React.useState("cv");
  const [uploading, setUploading] = React.useState(false);
  const [requestOpen, setRequestOpen] = React.useState(false);
  const activeLinks = links.filter((l) => l.state === "active").length;
  const fileRef = React.useRef<HTMLInputElement>(null);
  const remove = useAction(deleteDocumentAction, { successMessage: "Document removed" });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", kind);
    fd.set("candidateId", candidateId);
    const result = await uploadDocumentAction(fd);
    setUploading(false);
    if (result.ok) toast.success(result.data.extractionQueued ? "CV uploaded — extraction suggestions will appear shortly" : "Document uploaded");
    else toast.error(result.error);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <DetailSection
      title="Documents"
      count={rows.length}
      description="Stored privately. Every download is authorization-checked and logged with who, when and why."
      actions={
        canEdit ? (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setRequestOpen(true)} title="Send the candidate a private link to upload identity documents or certificates">
              <LinkIcon data-icon="inline-start" />
              Request from candidate{activeLinks ? ` (${activeLinks})` : ""}
            </Button>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-8 w-[130px]" aria-label="Document type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_KINDS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Spinner data-icon="inline-start" /> : <FileUpIcon data-icon="inline-start" />}
              Upload
            </Button>
          </div>
        ) : links.length ? (
          <Button variant="outline" size="sm" onClick={() => setRequestOpen(true)}>
            <LinkIcon data-icon="inline-start" />
            Upload links{activeLinks ? ` (${activeLinks})` : ""}
          </Button>
        ) : undefined
      }
    >
      <RequestDocumentsSheet open={requestOpen} onOpenChange={setRequestOpen} candidateId={candidateId} candidateName={candidateName} links={links} canEdit={canEdit} />
      {rows.length === 0 ? (
        <EmptyState compact icon={FileIcon} title="No documents" description={canEdit ? "Upload a CV to extract skills, or send the candidate a secure link to collect passports and certificates." : "Upload a CV to extract skills, or certificates to back verifications."} className="border-dashed" />
      ) : (
        <ul className="divide-y">
          {rows.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {humanize(d.kind)} · {(d.sizeBytes / 1024).toFixed(0)} KB · v{d.version} · {fmtDate(d.createdAt)}
                  {d.isSensitive ? " · sensitive" : ""}
                  {d.uploadedById === null ? " · uploaded by the candidate" : ""}
                </p>
              </div>
              <StatusBadge value={d.scanStatus} />
              <Button variant="ghost" size="icon-sm" asChild aria-label={`Download ${d.filename}`}>
                <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">
                  <DownloadIcon />
                </a>
              </Button>
              {canEdit ? (
                <ConfirmButton title="Remove this document?" description="The file is soft-deleted and no longer downloadable. Verifications that reference it keep their history." confirmLabel="Remove" destructive variant="ghost" size="icon-sm" onConfirm={() => remove.run({ id: d.id, candidateId })}>
                  <Trash2Icon />
                </ConfirmButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
