"use client";

import * as React from "react";
import { GlobeIcon, LanguagesIcon, PlusIcon, ShieldCheckIcon, ShieldQuestionIcon, Trash2Icon, WrenchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DetailSection } from "@/components/app/detail-layout";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { SlideOver } from "@/components/app/slide-over";
import { ConfirmButton } from "@/components/app/confirm-button";
import { COUNTRY_OPTIONS, DateField, Form, FormRow, LANGUAGE_OPTIONS, NumberField, SelectField, SubmitButton, TextField, TextareaField, enumOptions, useZodForm } from "@/components/app/form";
import { LookupField } from "@/components/app/lookup-field";
import { useAction } from "@/components/app/use-action";
import { removeLanguageAction, removeSkillClaimAction, removeWorkAuthorizationAction, reviewSkillClaimAction, reviewWorkAuthorizationAction, upsertLanguageAction, upsertSkillClaimAction, upsertWorkAuthorizationAction } from "@/actions/candidates";
import { searchSkillsAction } from "@/actions/lookups";
import { languageSchema, reviewClaimSchema, reviewWorkAuthSchema, skillClaimSchema, workAuthorizationSchema } from "@/lib/schemas/candidates";
import type { CandidateDetail } from "@/server/candidates/queries";
import { countryName, fmtDate, languageName, toDateInput } from "@/lib/format";

type Doc = CandidateDetail["documents"][number];
const docOptions = (docs: Doc[]) => docs.map((d) => ({ value: d.id, label: `${d.filename} (${d.kind})` }));
const PROFICIENCY = enumOptions(["basic", "intermediate", "advanced", "expert"]);
const LANGUAGE_LEVELS = enumOptions(["basic", "conversational", "professional", "fluent", "native"]);
const AUTH_TYPES = enumOptions(["citizen", "permanent_resident", "work_permit", "visa_sponsorship_required", "none"], { none: "No authorization" });

// ---------- Skills ----------

export function SkillsSection({ candidateId, claims, documents, canEdit, canVerify }: { candidateId: string; claims: CandidateDetail["skillClaims"]; documents: Doc[]; canEdit: boolean; canVerify: boolean }) {
  const [editing, setEditing] = React.useState<CandidateDetail["skillClaims"][number] | null | "new">(null);
  const [reviewing, setReviewing] = React.useState<CandidateDetail["skillClaims"][number] | null>(null);
  const remove = useAction(removeSkillClaimAction, { successMessage: "Skill removed" });
  return (
    <DetailSection
      title="Skills"
      count={claims.length}
      description="Declared by the candidate or extracted from the CV; verified only when a reviewer confirms evidence. Verification expires and must be renewed."
      actions={
        canEdit ? (
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            <PlusIcon data-icon="inline-start" />
            Add skill
          </Button>
        ) : undefined
      }
    >
      {claims.length === 0 ? (
        <EmptyState compact icon={WrenchIcon} title="No skills recorded" description="Add skills from the taxonomy or upload a CV to extract them." className="border-dashed" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Skill</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Years</TableHead>
              <TableHead>Verification</TableHead>
              <TableHead>Evidence</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {claims.map((row) => (
              <TableRow key={row.claim.id}>
                <TableCell>
                  <p className="font-medium">{row.skillName}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.claim.origin.replace(/_/g, " ")}
                    {row.claim.originalWording && row.claim.originalWording !== row.skillName ? ` · “${row.claim.originalWording}”` : ""}
                  </p>
                </TableCell>
                <TableCell className="capitalize">{row.claim.declaredProficiency}</TableCell>
                <TableCell className="tabular-nums">{row.claim.yearsExperience ? Number(row.claim.yearsExperience) : "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <StatusBadge value={row.claim.verificationStatus} />
                    {row.claim.reviewedAt ? (
                      <span className="text-[11px] text-muted-foreground">
                        {row.reviewerName ?? "Reviewer"} · {fmtDate(row.claim.reviewedAt)}
                        {row.claim.expiresAt ? ` · expires ${fmtDate(row.claim.expiresAt)}` : ""}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="max-w-[200px]">
                  {row.evidenceFilename ? (
                    <a href={`/api/documents/${row.claim.evidenceDocumentId}`} className="truncate text-xs text-primary hover:underline" target="_blank" rel="noreferrer">
                      {row.evidenceFilename}
                    </a>
                  ) : null}
                  {row.claim.evidenceNotes ? <p className="truncate text-xs text-muted-foreground">{row.claim.evidenceNotes}</p> : null}
                  {!row.evidenceFilename && !row.claim.evidenceNotes ? <span className="text-xs text-muted-foreground">—</span> : null}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {canVerify ? (
                      <Button size="icon-sm" variant="ghost" aria-label="Review verification" onClick={() => setReviewing(row)}>
                        {row.claim.verificationStatus === "verified" ? <ShieldCheckIcon className="text-success" /> : <ShieldQuestionIcon />}
                      </Button>
                    ) : null}
                    {canEdit ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                          Edit
                        </Button>
                        <ConfirmButton title="Remove this skill?" description="The claim and its verification history are soft-deleted." confirmLabel="Remove" destructive variant="ghost" size="icon-sm" onConfirm={() => remove.run({ id: row.claim.id, candidateId })}>
                          <Trash2Icon />
                        </ConfirmButton>
                      </>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing ? <SkillClaimSheet candidateId={candidateId} claim={editing === "new" ? null : editing} documents={documents} onClose={() => setEditing(null)} /> : null}
      {reviewing ? <ReviewClaimSheet claim={reviewing} documents={documents} onClose={() => setReviewing(null)} /> : null}
    </DetailSection>
  );
}

function SkillClaimSheet({ candidateId, claim, documents, onClose }: { candidateId: string; claim: CandidateDetail["skillClaims"][number] | null; documents: Doc[]; onClose: () => void }) {
  const form = useZodForm(skillClaimSchema, {
    id: claim?.claim.id ?? "",
    candidateId,
    skillId: claim?.claim.skillId ?? "",
    originalWording: claim?.claim.originalWording ?? "",
    declaredProficiency: claim?.claim.declaredProficiency ?? "intermediate",
    yearsExperience: claim?.claim.yearsExperience ? Number(claim.claim.yearsExperience) : "",
    lastUsedYear: claim?.claim.lastUsedYear ?? "",
    evidenceNotes: claim?.claim.evidenceNotes ?? "",
    evidenceDocumentId: claim?.claim.evidenceDocumentId ?? "",
    expiresAt: toDateInput(claim?.claim.expiresAt),
  });
  const { run, pending, fieldErrors } = useAction(upsertSkillClaimAction, { successMessage: claim ? "Skill updated" : "Skill added", onSuccess: onClose });
  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title={claim ? `Edit ${claim.skillName}` : "Add skill"} description="Skills come from the controlled taxonomy so matching is exact. Editing a claim resets it to unverified." size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <LookupField name="skillId" label="Skill" fetcher={searchSkillsAction} placeholder="Search the taxonomy…" initialLabel={claim?.skillName} required disabled={Boolean(claim)} />
        <TextField name="originalWording" label="Original wording" placeholder="How the candidate or CV phrased it" />
        <FormRow>
          <SelectField name="declaredProficiency" label="Declared level" options={PROFICIENCY} required />
          <NumberField name="yearsExperience" label="Years" step="0.5" min={0} />
        </FormRow>
        <FormRow>
          <NumberField name="lastUsedYear" label="Last used (year)" min={1980} />
          <DateField name="expiresAt" label="Certification expiry" />
        </FormRow>
        <SelectField name="evidenceDocumentId" label="Evidence document" options={docOptions(documents)} allowEmpty emptyLabel="None yet" />
        <TextareaField name="evidenceNotes" label="Evidence notes" placeholder="Where the evidence came from" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>{claim ? "Save" : "Add skill"}</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}

function ReviewClaimSheet({ claim, documents, onClose }: { claim: CandidateDetail["skillClaims"][number]; documents: Doc[]; onClose: () => void }) {
  const form = useZodForm(reviewClaimSchema, { claimId: claim.claim.id, decision: "verified", evidenceDocumentId: claim.claim.evidenceDocumentId ?? "", evidenceNotes: claim.claim.evidenceNotes ?? "", expiresAt: toDateInput(claim.claim.expiresAt) });
  const { run, pending, fieldErrors } = useAction(reviewSkillClaimAction, { successMessage: (d) => `Skill marked ${d.status.replace(/_/g, " ")}`, onSuccess: onClose });
  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title={`Verify ${claim.skillName}`} description="Your decision, the evidence and the date are recorded on the claim. Verified evidence unlocks mandatory requirements that ask for it." size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <SelectField name="decision" label="Decision" options={enumOptions(["verified", "rejected", "pending_review"])} required />
        <SelectField name="evidenceDocumentId" label="Evidence document" options={docOptions(documents)} allowEmpty emptyLabel="No document" hint="Certificates and licences uploaded to this profile." />
        <DateField name="expiresAt" label="Valid until" hint="Leave empty to use the skill's default validity." />
        <TextareaField name="evidenceNotes" label="Notes" placeholder="What you checked and how" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Record decision</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}

// ---------- Work authorization ----------

export function WorkAuthSection({ candidateId, rows, documents, canEdit, canVerify }: { candidateId: string; rows: CandidateDetail["workAuths"]; documents: Doc[]; canEdit: boolean; canVerify: boolean }) {
  const [editing, setEditing] = React.useState<CandidateDetail["workAuths"][number] | null | "new">(null);
  const [reviewing, setReviewing] = React.useState<CandidateDetail["workAuths"][number] | null>(null);
  const remove = useAction(removeWorkAuthorizationAction, { successMessage: "Work authorization removed" });
  return (
    <DetailSection
      title="Work authorization"
      count={rows.length}
      description="Per destination country: what the candidate may legally do there, with validity dates and evidence. Independent of citizenship."
      actions={
        canEdit ? (
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            <PlusIcon data-icon="inline-start" />
            Add country
          </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState compact icon={GlobeIcon} title="No work authorization recorded" description="Matching treats missing authorization as unknown, so eligible roles land in the review list until this is filled in." className="border-dashed" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Country</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Valid</TableHead>
              <TableHead>Verification</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ auth, reviewerName }) => (
              <TableRow key={auth.id}>
                <TableCell className="font-medium">{countryName(auth.country)}</TableCell>
                <TableCell>{auth.type.replace(/_/g, " ")}</TableCell>
                <TableCell className="text-sm">
                  {auth.validFrom || auth.validUntil ? `${auth.validFrom ? fmtDate(auth.validFrom) : "…"} → ${auth.validUntil ? fmtDate(auth.validUntil) : "open"}` : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <StatusBadge value={auth.verificationStatus} />
                    {auth.reviewedAt ? <span className="text-[11px] text-muted-foreground">{reviewerName ?? "Reviewer"} · {fmtDate(auth.reviewedAt)}</span> : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {canVerify ? (
                      <Button size="icon-sm" variant="ghost" aria-label="Review" onClick={() => setReviewing({ auth, reviewerName })}>
                        {auth.verificationStatus === "verified" ? <ShieldCheckIcon className="text-success" /> : <ShieldQuestionIcon />}
                      </Button>
                    ) : null}
                    {canEdit ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ auth, reviewerName })}>
                          Edit
                        </Button>
                        <ConfirmButton title="Remove this authorization?" description="The record is soft-deleted." confirmLabel="Remove" destructive variant="ghost" size="icon-sm" onConfirm={() => remove.run({ id: auth.id, candidateId })}>
                          <Trash2Icon />
                        </ConfirmButton>
                      </>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing ? <WorkAuthSheet candidateId={candidateId} row={editing === "new" ? null : editing.auth} documents={documents} onClose={() => setEditing(null)} /> : null}
      {reviewing ? <ReviewWorkAuthSheet row={reviewing.auth} documents={documents} onClose={() => setReviewing(null)} /> : null}
    </DetailSection>
  );
}

function WorkAuthSheet({ candidateId, row, documents, onClose }: { candidateId: string; row: CandidateDetail["workAuths"][number]["auth"] | null; documents: Doc[]; onClose: () => void }) {
  const form = useZodForm(workAuthorizationSchema, { id: row?.id ?? "", candidateId, country: row?.country ?? "", type: row?.type ?? "work_permit", validFrom: toDateInput(row?.validFrom), validUntil: toDateInput(row?.validUntil), evidenceDocumentId: row?.evidenceDocumentId ?? "", notes: row?.notes ?? "" });
  const { run, pending, fieldErrors } = useAction(upsertWorkAuthorizationAction, { successMessage: row ? "Work authorization updated" : "Work authorization added", onSuccess: onClose });
  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title={row ? `Edit authorization · ${countryName(row.country)}` : "Add work authorization"} size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <FormRow>
          <SelectField name="country" label="Destination country" options={COUNTRY_OPTIONS} required disabled={Boolean(row)} />
          <SelectField name="type" label="Type" options={AUTH_TYPES} required />
        </FormRow>
        <FormRow>
          <DateField name="validFrom" label="Valid from" />
          <DateField name="validUntil" label="Valid until" />
        </FormRow>
        <SelectField name="evidenceDocumentId" label="Evidence document" options={docOptions(documents)} allowEmpty emptyLabel="None yet" />
        <TextareaField name="notes" label="Notes" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>{row ? "Save" : "Add"}</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}

function ReviewWorkAuthSheet({ row, documents, onClose }: { row: CandidateDetail["workAuths"][number]["auth"]; documents: Doc[]; onClose: () => void }) {
  const form = useZodForm(reviewWorkAuthSchema, { id: row.id, decision: "verified", evidenceDocumentId: row.evidenceDocumentId ?? "", notes: row.notes ?? "" });
  const { run, pending, fieldErrors } = useAction(reviewWorkAuthorizationAction, { successMessage: "Decision recorded", onSuccess: onClose });
  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title={`Verify authorization · ${countryName(row.country)}`} size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <SelectField name="decision" label="Decision" options={enumOptions(["verified", "rejected", "pending_review"])} required />
        <SelectField name="evidenceDocumentId" label="Evidence document" options={docOptions(documents)} allowEmpty emptyLabel="No document" />
        <TextareaField name="notes" label="Notes" placeholder="Permit number checked, issuing authority…" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Record decision</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}

// ---------- Languages ----------

export function LanguagesSection({ candidateId, rows, canEdit }: { candidateId: string; rows: CandidateDetail["languages"]; canEdit: boolean }) {
  const [open, setOpen] = React.useState(false);
  const remove = useAction(removeLanguageAction, { successMessage: "Language removed" });
  const upsert = useAction(upsertLanguageAction, { successMessage: "Language saved" });
  return (
    <DetailSection
      title="Languages"
      count={rows.length}
      defaultOpen={rows.length > 0}
      actions={
        canEdit ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add language
          </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState compact icon={LanguagesIcon} title="No languages recorded" className="border-dashed" />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {rows.map((l) => (
            <li key={l.id} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm">
              <span className="font-medium">{languageName(l.language)}</span>
              {canEdit ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground">
                      {l.proficiency}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {LANGUAGE_LEVELS.map((o) => (
                      <DropdownMenuItem key={o.value} onSelect={() => upsert.run({ id: l.id, candidateId, language: l.language, proficiency: o.value as never })}>
                        {o.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="text-xs text-muted-foreground">{l.proficiency}</span>
              )}
              {canEdit ? (
                <button type="button" className="text-muted-foreground hover:text-danger" aria-label={`Remove ${languageName(l.language)}`} onClick={() => remove.run({ id: l.id, candidateId })}>
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {open ? <LanguageSheet candidateId={candidateId} onClose={() => setOpen(false)} /> : null}
    </DetailSection>
  );
}

function LanguageSheet({ candidateId, onClose }: { candidateId: string; onClose: () => void }) {
  const form = useZodForm(languageSchema, { candidateId, language: "", proficiency: "professional" });
  const { run, pending, fieldErrors } = useAction(upsertLanguageAction, { successMessage: "Language added", onSuccess: onClose });
  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title="Add language" size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <SelectField name="language" label="Language" options={LANGUAGE_OPTIONS} required />
        <SelectField name="proficiency" label="Level" options={LANGUAGE_LEVELS} required />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Add</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}
