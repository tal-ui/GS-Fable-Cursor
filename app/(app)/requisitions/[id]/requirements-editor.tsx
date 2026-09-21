"use client";

import * as React from "react";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, ShieldCheckIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SlideOver } from "@/components/app/slide-over";
import { Lookup } from "@/components/app/lookup-field";
import { COUNTRY_OPTIONS, CURRENCY_OPTIONS, LANGUAGE_OPTIONS, PERIOD_OPTIONS } from "@/components/app/form";
import { useAction } from "@/components/app/use-action";
import { saveRequirementsAction } from "@/actions/crm";
import { searchSkillsAction } from "@/actions/lookups";
import type { Requirement } from "@/lib/matching/types";
import { countryName, languageName } from "@/lib/format";

type Field = Requirement["field"];
type Operator = Requirement["operator"];
type Kind = Requirement["kind"];
type Evidence = Requirement["evidenceRequirement"];

export type RuleDraft = {
  key: string;
  id?: string;
  kind: Kind;
  field: Field;
  operator: Operator;
  value: unknown;
  skillId: string | null;
  skillName: string | null;
  evidenceRequirement: Evidence;
  justification: string;
  weight: number;
};

export const FIELD_META: Record<Field, { label: string; help: string; operators: { value: Operator; label: string }[]; evidence: boolean }> = {
  skill: { label: "Skill", help: "Candidate must hold this skill from the taxonomy.", operators: [{ value: "exists", label: "is held" }, { value: "gte", label: "at least proficiency" }], evidence: true },
  certification: { label: "Certification", help: "A certificate-type skill; usually requires verified evidence.", operators: [{ value: "exists", label: "is held" }], evidence: true },
  language: { label: "Language", help: "Language and minimum proficiency.", operators: [{ value: "gte", label: "at least" }], evidence: true },
  work_authorization: { label: "Work authorisation", help: "Permission to work in a country. Passport alone never satisfies this.", operators: [{ value: "exists", label: "is authorised for" }], evidence: true },
  citizenship: { label: "Citizenship", help: "Citizenship in (or not in) a list of countries.", operators: [{ value: "in", label: "is one of" }, { value: "not_in", label: "is none of" }], evidence: false },
  availability_from: { label: "Available by", help: "Available on or before a date (defaults to the requisition start).", operators: [{ value: "lte", label: "on or before" }], evidence: false },
  availability_duration_weeks: { label: "Accepts duration", help: "Willing to take an assignment of this length.", operators: [{ value: "gte", label: "at least (weeks)" }], evidence: false },
  relocation: { label: "Relocation", help: "Willing to relocate for the assignment.", operators: [{ value: "equals", label: "is" }], evidence: false },
  compensation_max: { label: "Compensation ceiling", help: "Candidate expectation must be at or below this amount.", operators: [{ value: "lte", label: "at most" }], evidence: false },
  experience_years: { label: "Years of experience", help: "Total declared professional experience.", operators: [{ value: "gte", label: "at least" }], evidence: false },
  military_role: { label: "Military role", help: "Declared role contains one of these keywords.", operators: [{ value: "in", label: "matches any of" }], evidence: false },
  location_country: { label: "Location", help: "Based in or prefers one of these countries.", operators: [{ value: "in", label: "is one of" }], evidence: false },
};

const PROFICIENCIES = ["basic", "intermediate", "advanced", "expert"];
const LANGUAGE_LEVELS = ["basic", "conversational", "professional", "fluent", "native"];
const EVIDENCE_OPTIONS: { value: Evidence; label: string; help: string }[] = [
  { value: "declared", label: "Declared is enough", help: "Candidate's own claim satisfies the rule." },
  { value: "verified", label: "Verified evidence", help: "A reviewer must have accepted proof; otherwise the rule is 'unknown' and the candidate lands in Review." },
  { value: "none", label: "Informational", help: "Never blocks; only displayed." },
];

let keyCounter = 0;
const nextKey = () => `rule-${Date.now()}-${keyCounter++}`;

export function toDraft(r: Requirement): RuleDraft {
  return { key: nextKey(), id: r.id.startsWith("new-") ? undefined : r.id, kind: r.kind, field: r.field, operator: r.operator, value: r.value ?? null, skillId: r.skillId ?? null, skillName: r.skillName ?? null, evidenceRequirement: r.evidenceRequirement, justification: r.justification ?? "", weight: r.weight };
}

function defaultsFor(field: Field): Pick<RuleDraft, "operator" | "value" | "evidenceRequirement"> {
  switch (field) {
    case "skill":
      return { operator: "exists", value: null, evidenceRequirement: "declared" };
    case "certification":
      return { operator: "exists", value: null, evidenceRequirement: "verified" };
    case "language":
      return { operator: "gte", value: { language: "en", minProficiency: "professional" }, evidenceRequirement: "declared" };
    case "work_authorization":
      return { operator: "exists", value: null, evidenceRequirement: "verified" };
    case "citizenship":
      return { operator: "in", value: [], evidenceRequirement: "none" };
    case "availability_from":
      return { operator: "lte", value: null, evidenceRequirement: "none" };
    case "availability_duration_weeks":
      return { operator: "gte", value: 12, evidenceRequirement: "none" };
    case "relocation":
      return { operator: "equals", value: true, evidenceRequirement: "none" };
    case "compensation_max":
      return { operator: "lte", value: { amount: "", currency: "EUR", period: "hourly", grossNet: "gross" }, evidenceRequirement: "none" };
    case "experience_years":
      return { operator: "gte", value: 3, evidenceRequirement: "none" };
    case "military_role":
      return { operator: "in", value: [], evidenceRequirement: "none" };
    case "location_country":
      return { operator: "in", value: [], evidenceRequirement: "none" };
  }
}

/** Human-readable summary of a rule, shared by the read-only list and the matching workspace. */
export function describeRule(r: Pick<Requirement, "field" | "operator" | "value" | "skillName">, fallbackCountry?: string): string {
  const v = r.value;
  const list = (x: unknown) => (Array.isArray(x) ? x.map(String) : typeof x === "string" ? x.split(",").map((s) => s.trim()).filter(Boolean) : []);
  switch (r.field) {
    case "skill":
    case "certification":
      return r.operator === "gte" ? `${r.skillName ?? "Skill"} at ${String(v)} level or above` : `${r.skillName ?? "Skill"} held`;
    case "language": {
      const o = (v ?? {}) as { language?: string; minProficiency?: string };
      return `${languageName(o.language ?? String(v ?? ""))} — ${o.minProficiency ?? "conversational"} or better`;
    }
    case "work_authorization": {
      const c = typeof v === "string" ? v : (v as { country?: string } | null)?.country ?? fallbackCountry;
      return `Authorised to work in ${countryName(c)}`;
    }
    case "citizenship":
      return `${r.operator === "not_in" ? "Not a citizen of" : "Citizen of"} ${list(v).map(countryName).join(", ") || "—"}`;
    case "availability_from":
      return v ? `Available on or before ${String(v)}` : "Available by the requisition start date";
    case "availability_duration_weeks":
      return `Accepts a ${String(v)}-week assignment`;
    case "relocation":
      return v === false ? "Not required to relocate" : "Willing to relocate";
    case "compensation_max": {
      const o = (v ?? {}) as { amount?: unknown; currency?: string; period?: string; grossNet?: string };
      return `Expects at most ${String(o.amount ?? "?")} ${o.currency ?? ""}/${o.period ?? ""}${o.grossNet ? ` ${o.grossNet}` : ""}`;
    }
    case "experience_years":
      return `At least ${String(v)} years of experience`;
    case "military_role":
      return `Military role matches ${list(v).join(", ") || "—"}`;
    case "location_country":
      return `Located in ${list(v).map(countryName).join(", ") || "—"}`;
  }
}

function RequirementGroup({ title, icon: Icon, rules, tone, fallbackCountry, compact }: { title: string; icon: typeof ShieldCheckIcon; rules: Requirement[]; tone: string; fallbackCountry?: string; compact?: boolean }) {
  return (
    <div>
      <p className={cn("mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide", tone)}>
        <Icon className="size-3.5" />
        {title} <span className="font-normal text-muted-foreground">({rules.length})</span>
      </p>
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className={cn("divide-y rounded-lg border", compact && "text-sm")}>
          {rules.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{describeRule(r, fallbackCountry)}</p>
                <p className="text-xs text-muted-foreground">
                  {FIELD_META[r.field].label}
                  {FIELD_META[r.field].evidence ? ` · ${r.evidenceRequirement === "verified" ? "verified evidence required" : r.evidenceRequirement === "declared" ? "declared is enough" : "informational"}` : ""}
                  {r.kind === "preferred" ? ` · weight ${r.weight}` : ""}
                </p>
                {r.justification ? <p className="mt-0.5 text-xs italic text-muted-foreground">“{r.justification}”</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RequirementList({ requirements, fallbackCountry, compact }: { requirements: Requirement[]; fallbackCountry?: string; compact?: boolean }) {
  const mandatory = requirements.filter((r) => r.kind === "mandatory");
  const preferred = requirements.filter((r) => r.kind === "preferred");
  return (
    <div className="grid gap-4">
      <RequirementGroup title="Mandatory — eligibility" icon={ShieldCheckIcon} rules={mandatory} tone="text-danger-foreground" fallbackCountry={fallbackCountry} compact={compact} />
      <RequirementGroup title="Preferred — ranking" icon={SparklesIcon} rules={preferred} tone="text-primary" fallbackCountry={fallbackCountry} compact={compact} />
    </div>
  );
}

export function RequirementsEditor({
  open,
  onOpenChange,
  requisitionId,
  requisitionCountry,
  currentVersion,
  requirements,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  requisitionId: string;
  requisitionCountry: string;
  currentVersion: number;
  requirements: Requirement[];
}) {
  const [rules, setRules] = React.useState<RuleDraft[]>(() => requirements.map(toDraft));
  const [summary, setSummary] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const save = useAction(saveRequirementsAction, {
    successMessage: (d) => `Requirements version ${d.version} saved — matches are being recomputed`,
    onSuccess: () => onOpenChange(false),
  });

  const update = (key: string, patch: Partial<RuleDraft>) => setRules((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRules((rs) => rs.filter((r) => r.key !== key));
  const move = (key: string, dir: -1 | 1) =>
    setRules((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= rs.length) return rs;
      const copy = [...rs];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });
  const add = (kind: Kind) => {
    const field: Field = kind === "mandatory" ? "work_authorization" : "skill";
    setRules((rs) => [...rs, { key: nextKey(), kind, field, ...defaultsFor(field), skillId: null, skillName: null, justification: "", weight: 1 }]);
  };

  const localProblems = React.useMemo(() => {
    const problems: Record<string, string> = {};
    for (const r of rules) {
      if (r.kind === "mandatory" && !r.justification.trim()) problems[r.key] = "Mandatory rules need a business justification (it is shown to reviewers and auditors).";
      else if ((r.field === "skill" || r.field === "certification") && !r.skillId) problems[r.key] = "Choose a skill from the taxonomy.";
      else if (r.field === "skill" && r.operator === "gte" && !r.value) problems[r.key] = "Choose the minimum proficiency.";
      else if (r.field === "language" && !(r.value as { language?: string })?.language) problems[r.key] = "Choose a language.";
      else if (["citizenship", "location_country", "military_role"].includes(r.field) && !(Array.isArray(r.value) && r.value.length)) problems[r.key] = "Add at least one value.";
      else if (["availability_duration_weeks", "experience_years"].includes(r.field) && (r.value === "" || r.value === null || Number.isNaN(Number(r.value)))) problems[r.key] = "Enter a number.";
      else if (r.field === "compensation_max") {
        const v = r.value as { amount?: unknown; currency?: string; period?: string };
        if (!v?.amount || !v.currency || !v.period) problems[r.key] = "Amount, currency and period are all required.";
      }
    }
    return problems;
  }, [rules]);

  const mandatoryCount = rules.filter((r) => r.kind === "mandatory").length;
  const canSave = Object.keys(localProblems).length === 0 && !save.pending;

  const submit = () => {
    setErrors(localProblems);
    if (Object.keys(localProblems).length) return;
    void save.run({
      requisitionId,
      changeSummary: summary,
      requirements: rules.map((r, i) => ({
        id: r.id ?? "",
        kind: r.kind,
        field: r.field,
        operator: r.operator,
        value: normalizeValue(r),
        skillId: r.skillId ?? "",
        evidenceRequirement: r.evidenceRequirement,
        justification: r.justification,
        weight: r.weight,
        sortOrder: i,
      })),
    });
  };

  return (
    <SlideOver
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit requirements — saving creates v${currentVersion + 1}`}
      description="Mandatory rules decide eligibility (pass/fail/unknown). Preferred rules only affect ranking. Existing submissions keep the version they were matched against."
      size="xl"
      footer={
        <>
          <span className="mr-auto self-center text-xs text-muted-foreground">
            {mandatoryCount} mandatory · {rules.length - mandatoryCount} preferred{mandatoryCount === 0 ? " · at least one mandatory rule is needed to open the requisition" : ""}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSave}>
            Save as v{currentVersion + 1}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {save.fieldErrors._ || save.fieldErrors.requirements ? (
          <Alert variant="destructive">
            <AlertDescription>{save.fieldErrors._ ?? save.fieldErrors.requirements}</AlertDescription>
          </Alert>
        ) : null}
        {rules.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No rules yet. Start with the eligibility basics: work authorisation for {countryName(requisitionCountry)}, availability by the start date, and the core skill.
          </div>
        ) : null}
        {rules.map((r, i) => (
          <RuleCard key={r.key} rule={r} index={i} total={rules.length} error={errors[r.key] ?? (save.fieldErrors[`requirements.${i}`] as string | undefined)} requisitionCountry={requisitionCountry} onChange={(patch) => update(r.key, patch)} onRemove={() => remove(r.key)} onMove={(d) => move(r.key, d)} />
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => add("mandatory")}>
            <ShieldCheckIcon data-icon="inline-start" />
            Add mandatory rule
          </Button>
          <Button variant="outline" size="sm" onClick={() => add("preferred")}>
            <SparklesIcon data-icon="inline-start" />
            Add preferred rule
          </Button>
        </div>
        <div className="grid gap-1.5 border-t pt-4">
          <Label htmlFor="change-summary">What changed and why</Label>
          <Input id="change-summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Customer now accepts declared 6G, added Dutch B1 as preferred" maxLength={300} />
          <p className="text-xs text-muted-foreground">Stored on the version record so anyone can see why the rules moved.</p>
        </div>
      </div>
    </SlideOver>
  );
}

function normalizeValue(r: RuleDraft): unknown {
  switch (r.field) {
    case "skill":
      return r.operator === "gte" ? r.value : null;
    case "certification":
    case "work_authorization":
      return r.value && typeof r.value === "object" && !(r.value as { country?: string }).country ? null : r.value;
    case "availability_from":
      return r.value || null;
    case "availability_duration_weeks":
    case "experience_years":
      return Number(r.value);
    case "compensation_max": {
      const v = r.value as { amount?: unknown; currency?: string; period?: string; grossNet?: string };
      return { ...v, amount: Number(v.amount) };
    }
    default:
      return r.value;
  }
}

function RuleCard({
  rule,
  index,
  total,
  error,
  requisitionCountry,
  onChange,
  onRemove,
  onMove,
}: {
  rule: RuleDraft;
  index: number;
  total: number;
  error?: string;
  requisitionCountry: string;
  onChange: (patch: Partial<RuleDraft>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const meta = FIELD_META[rule.field];
  const setField = (field: Field) => onChange({ field, skillId: null, skillName: null, ...defaultsFor(field) });
  return (
    <div className={cn("rounded-xl border p-4", rule.kind === "mandatory" ? "border-danger/30 bg-danger-soft/20" : "border-primary/20 bg-primary-soft/20", error && "ring-2 ring-destructive/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">#{index + 1}</span>
        <ToggleGroup type="single" value={rule.kind} onValueChange={(v) => v && onChange({ kind: v as Kind })} variant="outline" size="sm">
          <ToggleGroupItem value="mandatory" aria-label="Mandatory" className="data-[state=on]:bg-danger-soft data-[state=on]:text-danger-foreground">
            Mandatory
          </ToggleGroupItem>
          <ToggleGroupItem value="preferred" aria-label="Preferred" className="data-[state=on]:bg-primary-soft data-[state=on]:text-primary">
            Preferred
          </ToggleGroupItem>
        </ToggleGroup>
        <Select value={rule.field} onValueChange={(v) => setField(v as Field)}>
          <SelectTrigger className="h-8 w-[200px]" aria-label="Requirement field">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(FIELD_META) as Field[]).map((f) => (
              <SelectItem key={f} value={f}>
                {FIELD_META[f].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {meta.operators.length > 1 ? (
          <Select value={rule.operator} onValueChange={(v) => onChange({ operator: v as Operator, value: rule.field === "skill" && v === "gte" ? "intermediate" : rule.field === "skill" ? null : rule.value })}>
            <SelectTrigger className="h-8 w-[180px]" aria-label="Operator">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {meta.operators.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm text-muted-foreground">{meta.operators[0]?.label}</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUpIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ArrowDownIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Remove rule" onClick={onRemove}>
            <Trash2Icon />
          </Button>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{meta.help}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="min-w-0">
          <ValueEditor rule={rule} requisitionCountry={requisitionCountry} onChange={onChange} />
        </div>
        <div className="grid gap-3">
          {meta.evidence ? (
            <div className="grid gap-1">
              <Label className="text-xs">Evidence</Label>
              <Select value={rule.evidenceRequirement} onValueChange={(v) => onChange({ evidenceRequirement: v as Evidence })}>
                <SelectTrigger className="h-8" aria-label="Evidence requirement">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVIDENCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] leading-tight text-muted-foreground">{EVIDENCE_OPTIONS.find((o) => o.value === rule.evidenceRequirement)?.help}</p>
            </div>
          ) : null}
          {rule.kind === "preferred" ? (
            <div className="grid gap-1">
              <Label className="text-xs" htmlFor={`${rule.key}-weight`}>
                Weight (0–10)
              </Label>
              <Input id={`${rule.key}-weight`} type="number" min={0} max={10} step="0.5" className="h-8" value={rule.weight} onChange={(e) => onChange({ weight: Math.min(10, Math.max(0, Number(e.target.value) || 0)) })} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-1">
        <Label className="text-xs" htmlFor={`${rule.key}-why`}>
          Business justification{rule.kind === "mandatory" ? <span className="ml-0.5 text-destructive">*</span> : null}
        </Label>
        <Textarea id={`${rule.key}-why`} rows={1} className="min-h-8 text-sm" value={rule.justification} onChange={(e) => onChange({ justification: e.target.value })} placeholder={rule.kind === "mandatory" ? "Why is this a hard requirement? e.g. site is a controlled facility; customer's HSE policy §4.2" : "Optional — why this matters for ranking"} maxLength={500} />
      </div>
      {error ? <p className="mt-2 text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}

function ValueEditor({ rule, requisitionCountry, onChange }: { rule: RuleDraft; requisitionCountry: string; onChange: (patch: Partial<RuleDraft>) => void }) {
  switch (rule.field) {
    case "skill":
    case "certification":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label className="text-xs">{rule.field === "certification" ? "Certification" : "Skill"} from taxonomy</Label>
            <Lookup value={rule.skillId} initialLabel={rule.skillName} fetcher={searchSkillsAction} placeholder="Search skills or synonyms…" onChange={(id, opt) => onChange({ skillId: id, skillName: opt?.label ?? null })} />
          </div>
          {rule.field === "skill" && rule.operator === "gte" ? (
            <div className="grid gap-1">
              <Label className="text-xs">Minimum proficiency</Label>
              <Select value={String(rule.value ?? "intermediate")} onValueChange={(v) => onChange({ value: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROFICIENCIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      );
    case "language": {
      const v = (rule.value ?? {}) as { language?: string; minProficiency?: string };
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label className="text-xs">Language</Label>
            <Select value={v.language ?? ""} onValueChange={(lang) => onChange({ value: { ...v, language: lang } })}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Minimum level</Label>
            <Select value={v.minProficiency ?? "conversational"} onValueChange={(p) => onChange({ value: { ...v, minProficiency: p } })}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_LEVELS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }
    case "work_authorization": {
      const country = typeof rule.value === "string" ? rule.value : (rule.value as { country?: string } | null)?.country ?? "";
      return (
        <div className="grid gap-1">
          <Label className="text-xs">Country</Label>
          <Select value={country || "__req"} onValueChange={(c) => onChange({ value: c === "__req" ? null : { country: c } })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__req">Requisition country ({countryName(requisitionCountry)})</SelectItem>
              {COUNTRY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    case "citizenship":
    case "location_country":
      return <CountryMulti values={Array.isArray(rule.value) ? (rule.value as string[]) : []} onChange={(v) => onChange({ value: v })} />;
    case "military_role":
      return (
        <div className="grid gap-1">
          <Label className="text-xs">Keywords (comma-separated)</Label>
          <Input className="h-9" value={Array.isArray(rule.value) ? (rule.value as string[]).join(", ") : ""} onChange={(e) => onChange({ value: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="e.g. combat engineer, sapper, EOD" />
        </div>
      );
    case "availability_from":
      return (
        <div className="grid gap-1">
          <Label className="text-xs">Date (leave empty to use the requisition start)</Label>
          <Input type="date" className="h-9 max-w-[220px]" value={typeof rule.value === "string" ? rule.value : ""} onChange={(e) => onChange({ value: e.target.value || null })} />
        </div>
      );
    case "availability_duration_weeks":
      return (
        <div className="grid gap-1">
          <Label className="text-xs">Assignment length (weeks)</Label>
          <Input type="number" min={1} className="h-9 max-w-[160px]" value={rule.value === null || rule.value === undefined ? "" : String(rule.value)} onChange={(e) => onChange({ value: e.target.value })} />
        </div>
      );
    case "experience_years":
      return (
        <div className="grid gap-1">
          <Label className="text-xs">Years</Label>
          <Input type="number" min={0} step="0.5" className="h-9 max-w-[160px]" value={rule.value === null || rule.value === undefined ? "" : String(rule.value)} onChange={(e) => onChange({ value: e.target.value })} />
        </div>
      );
    case "relocation":
      return (
        <div className="grid gap-1">
          <Label className="text-xs">Candidate must be</Label>
          <Select value={rule.value === false ? "false" : "true"} onValueChange={(v) => onChange({ value: v === "true" })}>
            <SelectTrigger className="h-9 max-w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Willing to relocate</SelectItem>
              <SelectItem value="false">Not required to relocate</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    case "compensation_max": {
      const v = (rule.value ?? {}) as { amount?: unknown; currency?: string; period?: string; grossNet?: string };
      const set = (patch: Partial<typeof v>) => onChange({ value: { ...v, ...patch } });
      return (
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="grid gap-1">
            <Label className="text-xs">Max amount</Label>
            <Input type="number" min={0} step="0.01" className="h-9" value={v.amount === undefined || v.amount === null ? "" : String(v.amount)} onChange={(e) => set({ amount: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Currency</Label>
            <Select value={v.currency ?? "EUR"} onValueChange={(c) => set({ currency: c })}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Period</Label>
            <Select value={v.period ?? "hourly"} onValueChange={(p) => set({ period: p })}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Basis</Label>
            <Select value={v.grossNet ?? "gross"} onValueChange={(g) => set({ grossNet: g })}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gross">Gross</SelectItem>
                <SelectItem value="net">Net</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }
  }
}

function CountryMulti({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [adding, setAdding] = React.useState("");
  return (
    <div className="grid gap-1">
      <Label className="text-xs">Countries</Label>
      <div className="flex flex-wrap items-center gap-1.5">
        {values.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs">
            {countryName(c)}
            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${c}`} onClick={() => onChange(values.filter((x) => x !== c))}>
              ×
            </button>
          </span>
        ))}
        <Select
          value={adding}
          onValueChange={(c) => {
            if (c && !values.includes(c)) onChange([...values, c]);
            setAdding("");
          }}
        >
          <SelectTrigger className="h-8 w-[180px]" aria-label="Add country">
            <SelectValue placeholder={<span className="inline-flex items-center gap-1"><PlusIcon className="size-3" />Add country</span>} />
          </SelectTrigger>
          <SelectContent>
            {COUNTRY_OPTIONS.filter((o) => !values.includes(o.value)).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
