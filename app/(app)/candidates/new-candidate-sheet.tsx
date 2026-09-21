"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, FileUpIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SlideOver } from "@/components/app/slide-over";
import { CheckboxField, COUNTRY_OPTIONS, CURRENCY_OPTIONS, DateField, Form, FormRow, FormSection, NumberField, PERIOD_OPTIONS, SelectField, SubmitButton, SwitchField, TextField, enumOptions, useFieldValue, useZodForm } from "@/components/app/form";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { createCandidateAction } from "@/actions/candidates";
import { checkDuplicatesAction } from "@/actions/lookups";
import { uploadDocumentAction } from "@/actions/documents";
import { intakeSchema } from "@/lib/schemas/candidates";
import { fmtDate, fullName } from "@/lib/format";

type Opt = { value: string; label: string };
type Duplicate = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; status: string; createdAt: Date; headline: string | null; matchedOn: string[] };

const ROTATION = enumOptions(["no_preference", "short_rotation", "long_rotation", "fixed_term", "permanent"]);
const CHANNELS = enumOptions(["web_form", "whatsapp", "email", "phone", "paper", "import"], { web_form: "Web form", whatsapp: "WhatsApp" });

export function NewCandidateSheet({ open, onOpenChange, users, sources, defaultSourceId }: { open: boolean; onOpenChange: (o: boolean) => void; users: Opt[]; sources: Opt[]; defaultSourceId?: string }) {
  const router = useRouter();
  const [duplicates, setDuplicates] = React.useState<Duplicate[]>([]);
  const [cv, setCv] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const form = useZodForm(intakeSchema, {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    city: "",
    country: "",
    headline: "",
    summary: "",
    status: "new",
    ownerId: "",
    primarySourceId: defaultSourceId ?? "",
    citizenships: "",
    passportCountry: "",
    passportExpiry: "",
    militaryRole: "",
    militaryUnit: "",
    militaryRank: "",
    yearsExperience: "",
    willingToRelocate: true,
    preferredCountries: "",
    processingConsent: undefined,
    communicationConsent: true,
    consentChannel: "phone",
    noticeVersion: "privacy-notice-v1",
    referrerName: "",
    availableFrom: "",
    availableUntil: "",
    minDurationWeeks: "",
    maxDurationWeeks: "",
    rotationPreference: "no_preference",
    expectedAmount: "",
    expectedCurrency: "",
    expectedPeriod: "",
    expectedGrossNet: "gross",
    forceCreate: false,
  });

  const { run, pending, fieldErrors } = useAction(createCandidateAction, {
    silent: true,
    onSuccess: async (data) => {
      if ("duplicates" in data) {
        setDuplicates(data.duplicates as Duplicate[]);
        toast.warning("Possible duplicates found — review before creating.");
        return;
      }
      const candidateId = data.candidateId;
      if (cv) {
        setUploading(true);
        const fd = new FormData();
        fd.set("file", cv);
        fd.set("kind", "cv");
        fd.set("candidateId", candidateId);
        const up = await uploadDocumentAction(fd);
        setUploading(false);
        if (up.ok) toast.success("Candidate created · CV uploaded and queued for extraction");
        else toast.warning(`Candidate created, but the CV could not be uploaded: ${up.error}`);
      } else {
        toast.success("Candidate created");
      }
      onOpenChange(false);
      form.reset();
      setDuplicates([]);
      setCv(null);
      router.push(`/candidates/${candidateId}`);
    },
    onError: (e) => toast.error(e.error),
  });

  const runDuplicateCheck = React.useCallback(async () => {
    const v = form.getValues();
    if (!v.email && !v.phone && !(v.firstName && v.lastName)) return;
    const result = await checkDuplicatesAction({ email: v.email || undefined, phone: v.phone || undefined, country: v.country || undefined, firstName: v.firstName || undefined, lastName: v.lastName || undefined });
    if (result.ok) setDuplicates(result.data as Duplicate[]);
  }, [form]);

  const forceCreate = useFieldValue(form, "forceCreate");

  return (
    <SlideOver open={open} onOpenChange={onOpenChange} title="Add candidate" description="Guided intake: identity, permission, availability and pay expectations. Everything can be refined later on the profile." size="lg">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <FormSection title="Identity" description="Duplicates are detected by email, phone and surname + first initial before anything is saved.">
          <FormRow>
            <TextField name="firstName" label="First name" placeholder="e.g. Daniel" required autoFocus />
            <TextField name="lastName" label="Last name" placeholder="e.g. Cohen" required />
          </FormRow>
          <FormRow>
            <div onBlur={runDuplicateCheck}>
              <TextField name="email" label="Email" type="email" placeholder="name@example.com" />
            </div>
            <div onBlur={runDuplicateCheck}>
              <TextField name="phone" label="Phone (WhatsApp)" placeholder="+972 50 000 0000" hint="International format so WhatsApp outreach works." />
            </div>
          </FormRow>
          <FormRow>
            <TextField name="city" label="City" placeholder="e.g. Haifa" />
            <SelectField name="country" label="Country of residence" options={COUNTRY_OPTIONS} allowEmpty placeholder="Choose a country" />
          </FormRow>
          <TextField name="headline" label="Headline" placeholder="e.g. Certified welder · 6 years offshore" />
          {duplicates.length ? (
            <div className="space-y-2 rounded-lg border border-warning/40 bg-warning-soft/60 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-warning-foreground">
                <AlertTriangleIcon className="size-4" />
                {duplicates.length} possible duplicate{duplicates.length === 1 ? "" : "s"}
              </p>
              <ul className="space-y-1.5">
                {duplicates.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 rounded-md bg-card px-2.5 py-1.5">
                    <div className="min-w-0">
                      <Link href={`/candidates/${d.id}`} className="font-medium hover:underline" target="_blank">
                        {fullName(d.firstName, d.lastName)}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {[d.email, d.phone, d.headline].filter(Boolean).join(" · ") || "No contact details"} · added {fmtDate(d.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {d.matchedOn.map((m) => (
                        <span key={m} className="rounded-full bg-warning-soft px-1.5 text-[11px] font-medium text-warning-foreground">
                          {m}
                        </span>
                      ))}
                      <StatusBadge value={d.status} />
                    </div>
                  </li>
                ))}
              </ul>
              <SwitchField name="forceCreate" label="Create anyway" description="I checked these profiles and this is a different person." className="bg-card" />
            </div>
          ) : null}
        </FormSection>

        <FormSection title="Background">
          <FormRow cols={3}>
            <TextField name="militaryRole" label="Military role" placeholder="e.g. Combat medic" />
            <TextField name="militaryUnit" label="Unit" placeholder="e.g. Golani" />
            <TextField name="militaryRank" label="Rank" placeholder="e.g. Sergeant" />
          </FormRow>
          <FormRow cols={3}>
            <NumberField name="yearsExperience" label="Years of experience" step="0.5" min={0} placeholder="e.g. 6" />
            <TextField name="citizenships" label="Citizenships" placeholder="IL, US" hint="Comma-separated 2-letter codes. Not the same as work authorization." />
            <SelectField name="passportCountry" label="Passport country" options={COUNTRY_OPTIONS} allowEmpty />
          </FormRow>
          <FormRow>
            <DateField name="passportExpiry" label="Passport expiry" />
            <TextField name="preferredCountries" label="Preferred destinations" placeholder="DE, NL" hint="Comma-separated 2-letter codes." />
          </FormRow>
        </FormSection>

        <FormSection title="Availability & mobility" description="Dated availability drives matching; it will be re-confirmed regularly.">
          <FormRow cols={3}>
            <DateField name="availableFrom" label="Available from" />
            <DateField name="availableUntil" label="Available until" />
            <SelectField name="rotationPreference" label="Rotation preference" options={ROTATION} />
          </FormRow>
          <FormRow cols={3}>
            <NumberField name="minDurationWeeks" label="Min duration (weeks)" min={0} />
            <NumberField name="maxDurationWeeks" label="Max duration (weeks)" min={0} />
            <SwitchField name="willingToRelocate" label="Willing to relocate" />
          </FormRow>
        </FormSection>

        <FormSection title="Expected compensation" description="Stored with currency, period and gross/net so matching never compares apples to oranges.">
          <FormRow cols={4}>
            <NumberField name="expectedAmount" label="Amount" step="0.01" min={0} placeholder="e.g. 28" />
            <SelectField name="expectedCurrency" label="Currency" options={CURRENCY_OPTIONS} allowEmpty />
            <SelectField name="expectedPeriod" label="Period" options={PERIOD_OPTIONS} allowEmpty />
            <SelectField name="expectedGrossNet" label="Gross / net" options={[{ value: "gross", label: "Gross" }, { value: "net", label: "Net" }]} />
          </FormRow>
        </FormSection>

        <FormSection title="Source & ownership">
          <FormRow cols={3}>
            <SelectField name="primarySourceId" label="Source" options={sources} allowEmpty placeholder="Where did this candidate come from?" />
            <TextField name="referrerName" label="Referrer" placeholder="Name of the person who referred" />
            <SelectField name="ownerId" label="Owner" options={users} allowEmpty emptyLabel="Me" />
          </FormRow>
        </FormSection>

        <FormSection title="CV" description="PDF, DOCX or TXT up to 15 MB. Fields are extracted as suggestions you accept or reject — nothing is overwritten automatically.">
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={(e) => setCv(e.target.files?.[0] ?? null)} />
          {cv ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <FileUpIcon className="size-4 shrink-0 text-primary" />
                <span className="truncate">{cv.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{(cv.size / 1024).toFixed(0)} KB</span>
              </span>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setCv(null)} aria-label="Remove file">
                <XIcon />
              </Button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary-soft/30 hover:text-foreground">
              <FileUpIcon className="size-5" />
              Click to attach a CV
            </button>
          )}
        </FormSection>

        <FormSection title="Permission" description="Nothing about a person is stored or shared without their permission. Record how it was obtained.">
          <CheckboxField name="processingConsent" label="The candidate agreed that we store and process their profile" description="Required. Reference the privacy notice version below." required />
          <CheckboxField name="communicationConsent" label="The candidate agreed to be contacted by WhatsApp / email about roles" />
          <FormRow>
            <SelectField name="consentChannel" label="How consent was captured" options={CHANNELS} />
            <TextField name="noticeVersion" label="Privacy notice version" placeholder="privacy-notice-v1" />
          </FormRow>
        </FormSection>

        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending || uploading}>{uploading ? <Spinner /> : null}{duplicates.length && !forceCreate ? "Review duplicates" : "Create candidate"}</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}
