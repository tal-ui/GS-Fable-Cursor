"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SlideOver } from "@/components/app/slide-over";
import { COUNTRY_OPTIONS, CURRENCY_OPTIONS, Form, FormRow, FormSection, NumberField, SelectField, SubmitButton, TextField, TextareaField, enumOptions, useZodForm } from "@/components/app/form";
import { RichTextField } from "@/components/app/rich-text";
import { useAction } from "@/components/app/use-action";
import { createAccountAction } from "@/actions/crm";
import { accountSchema } from "@/lib/schemas/crm";

type Opt = { value: string; label: string };

export const ACCOUNT_TYPES = enumOptions(["employer", "agency_partner", "government", "subcontractor", "vendor", "other"]);
export const ACCOUNT_STATUSES = enumOptions(["prospect", "active", "inactive", "blocked"]);

export function NewAccountSheet({ open, onOpenChange, users }: { open: boolean; onOpenChange: (o: boolean) => void; users: Opt[] }) {
  const router = useRouter();
  const form = useZodForm(accountSchema, { name: "", type: "employer", status: "prospect", industry: "", website: "", country: "", city: "", addressLine: "", ownerId: "", currency: "EUR", paymentTermsDays: "", commercialTerms: "", notes: "", externalRef: "" });
  const { run, pending, fieldErrors } = useAction(createAccountAction, {
    successMessage: "Account created",
    onSuccess: (d) => {
      onOpenChange(false);
      form.reset();
      router.push(`/accounts/${d.id}`);
    },
  });
  return (
    <SlideOver open={open} onOpenChange={onOpenChange} title="New account" description="An employer, partner agency or other organisation. Contacts and requisitions hang off the account." size="md">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <FormSection title="Organisation">
          <TextField name="name" label="Account name" placeholder="e.g. Northsea Yards B.V." required autoFocus />
          <FormRow>
            <SelectField name="type" label="Type" options={ACCOUNT_TYPES} required />
            <SelectField name="status" label="Status" options={ACCOUNT_STATUSES} required />
          </FormRow>
          <FormRow>
            <TextField name="industry" label="Industry" placeholder="e.g. Shipbuilding" />
            <TextField name="website" label="Website" placeholder="https://" />
          </FormRow>
          <FormRow>
            <SelectField name="country" label="Country" options={COUNTRY_OPTIONS} allowEmpty />
            <TextField name="city" label="City" />
          </FormRow>
          <TextField name="addressLine" label="Address" />
        </FormSection>
        <FormSection title="Commercial">
          <FormRow>
            <SelectField name="currency" label="Billing currency" options={CURRENCY_OPTIONS} required />
            <NumberField name="paymentTermsDays" label="Payment terms (days)" min={0} placeholder="e.g. 30" />
          </FormRow>
          <RichTextField name="commercialTerms" label="Commercial terms" placeholder="Fee structure, rebates, replacement guarantee…" />
        </FormSection>
        <FormSection title="Ownership">
          <FormRow>
            <SelectField name="ownerId" label="Owner" options={users} allowEmpty emptyLabel="Me" />
            <TextField name="externalRef" label="External reference" placeholder="ERP / accounting ID" />
          </FormRow>
          <TextareaField name="notes" label="Internal notes" />
        </FormSection>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Create account</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}
