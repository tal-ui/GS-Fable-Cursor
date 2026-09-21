"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, CheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { updateSettingAction } from "@/actions/admin";
import { DetailSection, FieldRow, SidePanel } from "@/components/app/detail-layout";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { fmtRelative, humanize } from "@/lib/format";

type Row = { key: string; value: unknown; description: string; updatedAt: Date | null; isDefault: boolean };
type Runtime = { appUrl: string; sessionIdleHours: number; rateLimitUser: number; rateLimitIp: number; aiThreshold: number; integrationTimeoutMs: number; database: string; uploadsDir: string; devLogin: boolean; isProd: boolean };

const LABELS: Record<string, string> = {
  sharing_model: "Sharing model",
  availability_freshness_days: "Availability freshness (days)",
  verification_stale_days: "Verification validity (days)",
  submission_stall_days: "Submission stall threshold (days)",
  requisition_stall_days: "Requisition stall threshold (days)",
  task_default_due_hours: "Default task due window (hours)",
  disclosure_default_fields: "Default disclosure fields",
  whatsapp_service_window_hours: "WhatsApp service window (hours)",
  candidate_retention_months: "Candidate retention period (months)",
  retention_grace_days: "Grace before erasure (days)",
};

const GROUPS: { title: string; description: string; keys: string[] }[] = [
  { title: "Data visibility", description: "Controls the row-level scope applied to every query for Standard and Read Only users.", keys: ["sharing_model"] },
  { title: "Matching & evidence", description: "How long declared facts stay trustworthy before matching moves a candidate to review.", keys: ["availability_freshness_days", "verification_stale_days"] },
  { title: "Work queue", description: "When the daily maintenance job flags stalled work and how far out automation tasks are due.", keys: ["submission_stall_days", "requisition_stall_days", "task_default_due_hours"] },
  { title: "Privacy & outreach", description: "What is shared with customers by default and when free-form WhatsApp replies are allowed.", keys: ["disclosure_default_fields", "whatsapp_service_window_hours"] },
  { title: "Retention & erasure", description: "When inactive profiles fall due for review and how long owners have before a Super Admin may erase them. Withdrawn processing permission is due immediately.", keys: ["candidate_retention_months", "retention_grace_days"] },
];

const DISCLOSURE_FIELDS = ["headline", "summary", "skills", "languages", "availability", "work_authorization", "military_role", "experience", "compensation", "location", "certifications"];

export function SettingsView({ rows, runtime }: { rows: Row[]; runtime: Runtime }) {
  const router = useRouter();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const update = useAction(updateSettingAction, { silent: true, onSuccess: () => router.refresh() });

  const save = async (key: string, value: string | number | boolean | string[]) => {
    const result = await update.run({ key, value });
    if (result?.ok) toast.success(`${LABELS[key] ?? humanize(key)} updated`);
    else if (result) toast.error(result.error);
    return result;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        {GROUPS.map((g) => (
          <DetailSection key={g.title} title={g.title} description={g.description}>
            <div className="grid gap-5">
              {g.keys.map((key) => {
                const row = byKey.get(key);
                if (!row) return null;
                return <SettingField key={key} row={row} onSave={(v) => save(key, v)} pending={update.pending} />;
              })}
            </div>
          </DetailSection>
        ))}
      </div>

      <aside className="flex min-w-0 flex-col gap-5">
        <SidePanel title="Runtime (from environment)">
          <dl className="space-y-3">
            <FieldRow label="Environment">
              <div className="flex items-center gap-1.5">
                <StatusBadge value={runtime.isProd ? "active" : "draft"} label={runtime.isProd ? "Production" : "Development"} />
                {runtime.devLogin ? <StatusBadge value="pending" label="Dev sign-in on" /> : null}
              </div>
            </FieldRow>
            <FieldRow label="App URL">
              <span className="break-all font-mono text-xs">{runtime.appUrl}</span>
            </FieldRow>
            <FieldRow label="Database">{runtime.database}</FieldRow>
            <FieldRow label="Uploads directory">
              <span className="font-mono text-xs">{runtime.uploadsDir}</span>
            </FieldRow>
            <FieldRow label="Session idle timeout">{runtime.sessionIdleHours} hours</FieldRow>
            <FieldRow label="Rate limits">
              {runtime.rateLimitUser}/min per user · {runtime.rateLimitIp}/min per IP
            </FieldRow>
            <FieldRow label="AI confidence threshold">{runtime.aiThreshold} — below this, extraction goes to a recruiter</FieldRow>
            <FieldRow label="Integration timeout">{runtime.integrationTimeoutMs / 1000}s per outbound call</FieldRow>
          </dl>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
            These values come from environment variables and cannot be changed here. See <code className="font-mono">.env.example</code> for the full list.
          </p>
        </SidePanel>
      </aside>
    </div>
  );
}

function SettingField({ row, onSave, pending }: { row: Row; onSave: (value: string | number | boolean | string[]) => Promise<unknown>; pending: boolean }) {
  const label = LABELS[row.key] ?? humanize(row.key);
  const meta = (
    <span className="text-[11px] text-muted-foreground">
      {row.isDefault ? "Default" : `Changed ${row.updatedAt ? fmtRelative(row.updatedAt) : ""}`}
    </span>
  );

  if (row.key === "sharing_model") {
    const value = String(row.value);
    return (
      <div className="min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{label}</p>
          {meta}
        </div>
        <p className="text-xs text-muted-foreground">{row.description}</p>
        <RadioGroup value={value} onValueChange={(v) => onSave(v)} className="mt-3 grid gap-2 sm:grid-cols-2" disabled={pending}>
          {[
            { value: "team", title: "Team", body: "Every active user sees the whole candidate pool and CRM. Ownership still drives tasks and notifications." },
            { value: "owner", title: "Owner", body: "Standard and Read Only users see only records they own, plus unassigned records. Super Admins see everything." },
          ].map((o) => (
            <label key={o.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${value === o.value ? "border-primary bg-primary-soft/40" : "hover:bg-muted"}`}>
              <RadioGroupItem value={o.value} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">{o.title}</span>
                <span className="block text-xs text-muted-foreground">{o.body}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>
    );
  }

  if (row.key === "disclosure_default_fields") {
    const selected = Array.isArray(row.value) ? (row.value as string[]) : [];
    return (
      <div className="min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{label}</p>
          {meta}
        </div>
        <p className="text-xs text-muted-foreground">{row.description} Personal identifiers (name, contact details, documents) are never included by default.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DISCLOSURE_FIELDS.map((f) => {
            const checked = selected.includes(f);
            return (
              <label key={f} className="flex items-center gap-2 text-sm">
                <Checkbox checked={checked} disabled={pending} onCheckedChange={(c) => onSave(c === true ? [...selected, f] : selected.filter((x) => x !== f))} />
                {humanize(f)}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  return <NumberSetting key={String(row.value)} label={label} row={row} meta={meta} onSave={onSave} pending={pending} />;
}

function NumberSetting({ label, row, meta, onSave, pending }: { label: string; row: Row; meta: React.ReactNode; onSave: (value: number) => Promise<unknown>; pending: boolean }) {
  const current = Number(row.value);
  const [draft, setDraft] = React.useState(String(current));
  const dirty = draft !== "" && Number(draft) !== current;
  const commit = async () => {
    if (!dirty) return;
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) {
      toast.warning("Enter a positive number.");
      return;
    }
    await onSave(n);
  };
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_200px] sm:items-start">
      <div className="min-w-0">
        <div className="flex items-center justify-between sm:justify-start sm:gap-3">
          <p className="text-sm font-medium">{label}</p>
          {meta}
        </div>
        <p className="text-xs text-muted-foreground">{row.description}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") setDraft(String(current));
          }}
          className="h-9"
          aria-label={label}
        />
        {dirty ? (
          <>
            <Button type="button" size="icon-sm" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={commit} disabled={pending} aria-label="Save">
              {pending ? <Spinner /> : <CheckIcon />}
            </Button>
            <Button type="button" size="icon-sm" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => setDraft(String(current))} aria-label="Cancel">
              <XIcon />
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
