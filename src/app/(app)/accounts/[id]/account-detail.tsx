"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, BriefcaseIcon, ClipboardListIcon, ContactIcon, MailIcon, PhoneIcon, PlusIcon, StarIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DetailLayout, DetailSection, FieldGrid, FieldRow, SidePanel } from "@/components/app/detail-layout";
import { InlineField } from "@/components/app/inline-field";
import { StatusBadge } from "@/components/app/status-badge";
import { ConfirmButton } from "@/components/app/confirm-button";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { EmptyState } from "@/components/app/empty-state";
import { SlideOver } from "@/components/app/slide-over";
import { RichText, RichTextEditor } from "@/components/app/rich-text";
import { CreateTaskSheet } from "@/components/app/create-task-sheet";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { COUNTRY_OPTIONS, CURRENCY_OPTIONS, Form, FormRow, SubmitButton, SwitchField, TextField, TextareaField, useZodForm } from "@/components/app/form";
import { useAction } from "@/components/app/use-action";
import { deleteAccountAction, removeContactAction, updateAccountAction, upsertContactAction } from "@/actions/crm";
import { contactSchema } from "@/lib/schemas/crm";
import type { AccountDetail } from "@/server/accounts";
import { fmtDate, fmtDateTime, fmtRelative, fullName, initials } from "@/lib/format";
import { ACCOUNT_STATUSES, ACCOUNT_TYPES } from "../account-form";

type Opt = { value: string; label: string };
type Patch = Parameters<typeof updateAccountAction>[0];

export function AccountDetailView({ detail, users, canEdit }: { detail: AccountDetail; users: Opt[]; canEdit: boolean }) {
  const router = useRouter();
  const a = detail.account;
  const [taskOpen, setTaskOpen] = React.useState(false);
  const [contact, setContact] = React.useState<AccountDetail["contacts"][number] | null | "new">(null);
  const [termsDraft, setTermsDraft] = React.useState<string | null>(null);
  const readOnly = !canEdit;

  const update = useAction(updateAccountAction, { silent: true });
  const patch = (field: keyof Omit<Patch, "id">) => (value: string | number | boolean | null) => update.run({ id: a.id, [field]: value === null ? "" : value } as Patch);
  const saveTerms = useAction(updateAccountAction, { successMessage: "Commercial terms saved", onSuccess: () => setTermsDraft(null) });
  const remove = useAction(deleteAccountAction, { successMessage: "Account archived", onSuccess: () => router.push("/accounts") });
  const removeContact = useAction(removeContactAction, { successMessage: "Contact removed" });

  const openSeats = detail.requisitions.filter((r) => r.requisition.status === "open").reduce((s, r) => s + Math.max(0, r.requisition.headcountApproved - r.filledSeats), 0);

  return (
    <>
      <BreadcrumbLabel segment={a.id} label={a.name} />
      <DetailLayout
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="icon-sm" asChild aria-label="Back to accounts">
              <Link href="/accounts">
                <ArrowLeftIcon />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 truncate text-lg font-semibold">
                {a.name}
                <StatusBadge value={a.status} />
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {ACCOUNT_TYPES.find((t) => t.value === a.type)?.label} · {a.industry ?? "No industry"} · updated {fmtRelative(a.updatedAt)}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {canEdit ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setTaskOpen(true)}>
                    <ClipboardListIcon data-icon="inline-start" />
                    Task
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setContact("new")}>
                    <ContactIcon data-icon="inline-start" />
                    Add contact
                  </Button>
                  <Button size="sm" asChild>
                    <Link href={`/requisitions?new=1&account=${a.id}`}>
                      <BriefcaseIcon data-icon="inline-start" />
                      New requisition
                    </Link>
                  </Button>
                  <ConfirmButton title="Archive this account?" description="The account is hidden from lists and search; its contacts, requisitions and history are kept. Open requisitions must be closed first. A Super Admin can restore it from Setup → Archived records." confirmLabel="Archive" destructive variant="ghost" size="icon-sm" onConfirm={() => remove.run({ id: a.id })} pending={remove.pending}>
                    <Trash2Icon />
                  </ConfirmButton>
                </>
              ) : null}
            </div>
          </div>
        }
        main={
          <>
            <DetailSection title="Account">
              <FieldGrid>
                <InlineField label="Name" value={a.name} onSave={patch("name")} readOnly={readOnly} />
                <InlineField label="Type" value={a.type} kind="select" options={ACCOUNT_TYPES} onSave={patch("type")} readOnly={readOnly} />
                <InlineField label="Status" value={a.status} kind="select" options={ACCOUNT_STATUSES} display={<StatusBadge value={a.status} />} onSave={patch("status")} readOnly={readOnly} />
                <InlineField label="Owner" value={a.ownerId} kind="select" options={users} onSave={patch("ownerId")} readOnly={readOnly} placeholder="Unassigned" />
                <InlineField label="Industry" value={a.industry} onSave={patch("industry")} readOnly={readOnly} />
                <InlineField label="Website" value={a.website} onSave={patch("website")} readOnly={readOnly} display={a.website ? <a href={a.website.startsWith("http") ? a.website : `https://${a.website}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{a.website}</a> : undefined} />
                <InlineField label="Country" value={a.country} kind="select" options={COUNTRY_OPTIONS} onSave={patch("country")} readOnly={readOnly} />
                <InlineField label="City" value={a.city} onSave={patch("city")} readOnly={readOnly} />
                <InlineField label="Address" value={a.addressLine} onSave={patch("addressLine")} readOnly={readOnly} className="sm:col-span-2" />
                <InlineField label="External reference" value={a.externalRef} onSave={patch("externalRef")} readOnly={readOnly} />
              </FieldGrid>
            </DetailSection>

            <DetailSection title="Commercial terms" description="Currency, payment terms and the negotiated fee structure. Requisitions inherit the currency by default.">
              <FieldGrid cols={3}>
                <InlineField label="Billing currency" value={a.currency} kind="select" options={CURRENCY_OPTIONS} onSave={patch("currency")} readOnly={readOnly} />
                <InlineField label="Payment terms (days)" value={a.paymentTermsDays} kind="number" onSave={patch("paymentTermsDays")} readOnly={readOnly} />
              </FieldGrid>
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Terms</p>
                  {canEdit && termsDraft === null ? (
                    <Button variant="ghost" size="xs" onClick={() => setTermsDraft(a.commercialTerms ?? "")}>
                      Edit
                    </Button>
                  ) : null}
                </div>
                {termsDraft !== null ? (
                  <div className="space-y-2">
                    <RichTextEditor value={termsDraft} onChange={setTermsDraft} placeholder="Fee %, rebate window, replacement guarantee, invoicing cadence…" />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setTermsDraft(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => saveTerms.run({ id: a.id, commercialTerms: termsDraft })} disabled={saveTerms.pending}>
                        Save terms
                      </Button>
                    </div>
                  </div>
                ) : a.commercialTerms ? (
                  <RichText html={a.commercialTerms} />
                ) : (
                  <p className="text-sm text-muted-foreground">No commercial terms recorded yet.</p>
                )}
              </div>
            </DetailSection>

            <DetailSection
              title="Contacts"
              count={detail.contacts.length}
              description="Who receives shortlists and who signs off. Disclosures are logged against a contact."
              actions={canEdit ? <Button variant="outline" size="sm" onClick={() => setContact("new")}><PlusIcon data-icon="inline-start" />Add</Button> : undefined}
            >
              {detail.contacts.length === 0 ? (
                <EmptyState compact icon={ContactIcon} title="No contacts yet" description="Add the hiring manager or HR contact who receives candidate shortlists." className="border-dashed" />
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {detail.contacts.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-2 rounded-lg border p-3 text-sm">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium">
                          {fullName(c.firstName, c.lastName)}
                          {c.isPrimary ? <StarIcon className="size-3.5 fill-warning text-warning" aria-label="Primary contact" /> : null}
                        </p>
                        <p className="text-xs text-muted-foreground">{c.title ?? "—"}</p>
                        <div className="mt-1 flex flex-col gap-0.5 text-xs">
                          {c.email ? <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:underline"><MailIcon className="size-3" />{c.email}</a> : null}
                          {c.phone ? <span className="inline-flex items-center gap-1"><PhoneIcon className="size-3" />{c.phone}</span> : null}
                        </div>
                        {c.receivesShortlists ? <span className="mt-1 inline-block rounded-full bg-info-soft px-1.5 text-[11px] text-info-foreground">Receives shortlists</span> : null}
                      </div>
                      {canEdit ? (
                        <div className="flex shrink-0 gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setContact(c)}>
                            Edit
                          </Button>
                          <ConfirmButton title="Remove this contact?" description="Past disclosures keep referencing the contact for audit purposes." confirmLabel="Remove" destructive variant="ghost" size="icon-sm" onConfirm={() => removeContact.run({ id: c.id, accountId: a.id })}>
                            <Trash2Icon />
                          </ConfirmButton>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection title="Requisitions" count={detail.requisitions.length}>
              {detail.requisitions.length === 0 ? (
                <EmptyState compact icon={BriefcaseIcon} title="No requisitions" description="Open a requisition to define seats and requirements for this account." action={canEdit ? <Button variant="outline" asChild><Link href={`/requisitions?new=1&account=${a.id}`}>New requisition</Link></Button> : undefined} className="border-dashed" />
              ) : (
                <ul className="divide-y">
                  {detail.requisitions.map((r) => (
                    <li key={r.requisition.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <Link href={`/requisitions/${r.requisition.id}`} className="font-medium hover:underline">
                          {r.requisition.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {r.requisition.locationCity ? `${r.requisition.locationCity}, ` : ""}
                          {r.requisition.locationCountry} · {r.filledSeats}/{r.requisition.headcountApproved} seats · {r.submissionCount} submissions · {r.ownerName ?? "Unassigned"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <StatusBadge value={r.requisition.priority} />
                        <StatusBadge value={r.requisition.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection title="Placements" count={detail.placements.length} defaultOpen={detail.placements.length > 0}>
              {detail.placements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No placements with this account yet.</p>
              ) : (
                <ul className="divide-y">
                  {detail.placements.map((p) => (
                    <li key={p.placement.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <Link href={`/placements/${p.placement.id}`} className="font-medium hover:underline">
                          {p.candidateName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {p.requisitionTitle} · {fmtDate(p.placement.plannedStart)} → {p.placement.plannedEnd ? fmtDate(p.placement.plannedEnd) : "open"}
                        </p>
                      </div>
                      <StatusBadge value={p.placement.status} />
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection title="Disclosure log" count={detail.disclosures.length} defaultOpen={false} description="Every time candidate information was shared with this customer: who, what fields, through which channel.">
              {detail.disclosures.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing has been shared with this customer yet.</p>
              ) : (
                <ul className="divide-y">
                  {detail.disclosures.map((d) => (
                    <li key={d.disclosure.id} className="py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/submissions/${d.disclosure.submissionId}`} className="font-medium hover:underline">
                          {d.candidateName}
                        </Link>
                        <span className="text-xs text-muted-foreground">{fmtDateTime(d.disclosure.sharedAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {d.sharedByName ?? "System"} via {d.disclosure.channel} · {d.disclosure.fieldsShared.join(", ")}
                        {d.disclosure.revokedAt ? " · revoked" : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>
          </>
        }
        side={
          <>
            <SidePanel title="At a glance">
              <FieldGrid cols={2}>
                <FieldRow label="Open seats">{openSeats}</FieldRow>
                <FieldRow label="Open requisitions">{detail.requisitions.filter((r) => r.requisition.status === "open").length}</FieldRow>
                <FieldRow label="Working">{detail.placements.filter((p) => ["started", "active", "extended"].includes(p.placement.status)).length}</FieldRow>
                <FieldRow label="Sharing consents">{detail.sharingConsentCount}</FieldRow>
              </FieldGrid>
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
            <SidePanel title="Notes">
              <InlineField label="Internal notes" value={a.notes} kind="textarea" onSave={patch("notes")} readOnly={readOnly} placeholder="Anything the team should know" />
            </SidePanel>
            <SidePanel title="Activity">
              <ActivityTimeline items={detail.activities} link={{ accountId: a.id }} canWrite={canEdit} limit={10} />
            </SidePanel>
          </>
        }
      />
      {canEdit ? (
        <>
          <CreateTaskSheet open={taskOpen} onOpenChange={setTaskOpen} link={{ accountId: a.id }} users={users} />
          {contact ? <ContactSheet accountId={a.id} contact={contact === "new" ? null : contact} onClose={() => setContact(null)} /> : null}
        </>
      ) : null}
    </>
  );
}

function ContactSheet({ accountId, contact, onClose }: { accountId: string; contact: AccountDetail["contacts"][number] | null; onClose: () => void }) {
  const form = useZodForm(contactSchema, { id: contact?.id ?? "", accountId, firstName: contact?.firstName ?? "", lastName: contact?.lastName ?? "", email: contact?.email ?? "", phone: contact?.phone ?? "", title: contact?.title ?? "", isPrimary: contact?.isPrimary ?? false, receivesShortlists: contact?.receivesShortlists ?? true, notes: contact?.notes ?? "" });
  const { run, pending, fieldErrors } = useAction(upsertContactAction, { successMessage: contact ? "Contact updated" : "Contact added", onSuccess: onClose });
  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title={contact ? "Edit contact" : "Add contact"} size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <FormRow>
          <TextField name="firstName" label="First name" required autoFocus />
          <TextField name="lastName" label="Last name" required />
        </FormRow>
        <TextField name="title" label="Job title" placeholder="e.g. HR Business Partner" />
        <FormRow>
          <TextField name="email" label="Email" type="email" />
          <TextField name="phone" label="Phone" />
        </FormRow>
        <SwitchField name="isPrimary" label="Primary contact" />
        <SwitchField name="receivesShortlists" label="Receives shortlists" description="Default recipient when presenting candidates." />
        <TextareaField name="notes" label="Notes" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>{contact ? "Save" : "Add contact"}</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}
