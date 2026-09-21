"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SlideOver } from "@/components/app/slide-over";
import { COUNTRY_OPTIONS, CURRENCY_OPTIONS, DateField, Form, FormRow, FormSection, NumberField, PERIOD_OPTIONS, SelectField, SubmitButton, TextField, enumOptions, useFieldValue, useZodForm } from "@/components/app/form";
import { LookupField, type LookupOption } from "@/components/app/lookup-field";
import { RichTextField } from "@/components/app/rich-text";
import { useAction } from "@/components/app/use-action";
import { createRequisitionAction } from "@/actions/crm";
import { contactsForAccountAction, searchAccountsAction } from "@/actions/lookups";
import { requisitionSchema } from "@/lib/schemas/requisitions";

type Opt = { value: string; label: string };

export const REQUISITION_STATUSES = enumOptions(["draft", "open", "on_hold", "filled", "closed", "cancelled"]);
export const PRIORITIES = enumOptions(["low", "medium", "high", "urgent"]);

export function NewRequisitionSheet({
  open,
  onOpenChange,
  users,
  roleFamilies,
  presetAccount,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  users: Opt[];
  roleFamilies: Opt[];
  presetAccount?: { id: string; label: string } | null;
}) {
  const router = useRouter();
  const form = useZodForm(requisitionSchema, {
    accountId: presetAccount?.id ?? "",
    contactId: "",
    roleFamilyId: "",
    title: "",
    description: "",
    locationCountry: "",
    locationCity: "",
    siteName: "",
    startDate: "",
    endDate: "",
    durationWeeks: "",
    headcountApproved: 1,
    status: "draft",
    priority: "medium",
    ownerId: "",
    billRateAmount: "",
    billRateCurrency: "EUR",
    billRatePeriod: "hourly",
    payRateAmount: "",
    payRateCurrency: "EUR",
    payRatePeriod: "hourly",
    externalRef: "",
  });
  const accountId = useFieldValue(form, "accountId");
  const [contactsByAccount, setContactsByAccount] = React.useState<Record<string, LookupOption[]>>({});
  const contacts = accountId ? contactsByAccount[accountId] ?? [] : [];

  React.useEffect(() => {
    if (!accountId || contactsByAccount[accountId]) return;
    let cancelled = false;
    contactsForAccountAction({ accountId }).then((r) => {
      if (cancelled) return;
      const options = r.ok ? r.data.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, sub: c.title })) : [];
      setContactsByAccount((prev) => ({ ...prev, [accountId]: options }));
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, contactsByAccount]);

  const { run, pending, fieldErrors } = useAction(createRequisitionAction, {
    successMessage: "Requisition created — add requirements before opening it",
    onSuccess: (d) => {
      onOpenChange(false);
      form.reset();
      router.push(`/requisitions/${d.id}`);
    },
  });

  return (
    <SlideOver open={open} onOpenChange={onOpenChange} title="New requisition" description="Capture the demand first. Requirements (the rules matching runs against) are added on the requisition page and versioned." size="md">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <FormSection title="Customer">
          <LookupField name="accountId" label="Account" required fetcher={searchAccountsAction} placeholder="Search accounts…" initialLabel={presetAccount?.label} />
          <LookupField name="contactId" label="Hiring contact" staticOptions={contacts} placeholder={accountId ? (contacts.length ? "Choose a contact" : "No contacts on this account yet") : "Choose an account first"} disabled={!accountId || contacts.length === 0} />
        </FormSection>
        <FormSection title="Role">
          <TextField name="title" label="Title" placeholder="e.g. Pipe Welder (6G) — offshore rotation" required autoFocus />
          <FormRow>
            <SelectField name="roleFamilyId" label="Role family" options={roleFamilies} allowEmpty emptyLabel="Unclassified" />
            <SelectField name="priority" label="Priority" options={PRIORITIES} required />
          </FormRow>
          <RichTextField name="description" label="Description" placeholder="Scope of work, shift pattern, site conditions, what makes someone succeed here…" />
        </FormSection>
        <FormSection title="Location & timing">
          <FormRow cols={3}>
            <SelectField name="locationCountry" label="Country" options={COUNTRY_OPTIONS} required />
            <TextField name="locationCity" label="City" />
            <TextField name="siteName" label="Site" placeholder="Yard, plant, project" />
          </FormRow>
          <FormRow cols={3}>
            <DateField name="startDate" label="Start date" hint="Used for availability rules" />
            <DateField name="endDate" label="End date" />
            <NumberField name="durationWeeks" label="Duration (weeks)" min={1} />
          </FormRow>
        </FormSection>
        <FormSection title="Seats & rates">
          <FormRow>
            <NumberField name="headcountApproved" label="Approved seats" min={1} required hint="Each placement takes one seat" />
            <SelectField name="status" label="Initial status" options={REQUISITION_STATUSES.filter((s) => ["draft", "on_hold"].includes(s.value))} hint="Open it once a mandatory rule exists" />
          </FormRow>
          <FormRow cols={3}>
            <NumberField name="billRateAmount" label="Bill rate" min={0} step="0.01" />
            <SelectField name="billRateCurrency" label="Currency" options={CURRENCY_OPTIONS} />
            <SelectField name="billRatePeriod" label="Period" options={PERIOD_OPTIONS} />
          </FormRow>
          <FormRow cols={3}>
            <NumberField name="payRateAmount" label="Pay rate" min={0} step="0.01" />
            <SelectField name="payRateCurrency" label="Currency" options={CURRENCY_OPTIONS} />
            <SelectField name="payRatePeriod" label="Period" options={PERIOD_OPTIONS} />
          </FormRow>
        </FormSection>
        <FormSection title="Ownership">
          <FormRow>
            <SelectField name="ownerId" label="Owner" options={users} allowEmpty emptyLabel="Me" />
            <TextField name="externalRef" label="Customer reference" placeholder="PO / job number" />
          </FormRow>
        </FormSection>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Create requisition</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}
