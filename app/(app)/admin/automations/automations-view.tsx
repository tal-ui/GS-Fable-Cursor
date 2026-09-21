"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, PencilIcon, PlusIcon, Trash2Icon, WorkflowIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { deleteAutomationRuleAction, upsertAutomationRuleAction } from "@/actions/admin";
import { ConfirmButton } from "@/components/app/confirm-button";
import { EmptyState } from "@/components/app/empty-state";
import { Form, FormRow, FormSection, NumberField, SelectField, SubmitButton, SwitchField, TextField, TextareaField, enumOptions, useFieldValue, useZodForm } from "@/components/app/form";
import { KpiCard } from "@/components/app/kpi-card";
import { SlideOver } from "@/components/app/slide-over";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AutomationActionConfig, AutomationCondition } from "@/db/schema";
import { automationRuleSchema } from "@/lib/schemas/admin";
import { fmtDateTime, fmtRelative, humanize } from "@/lib/format";

type Trigger = "submission_stage_changed" | "placement_status_changed" | "message_failed" | "task_overdue" | "candidate_created" | "requisition_created" | "verification_changed" | "schedule_daily";
type Action = "create_task" | "notify_owner" | "queue_message" | "update_candidate_status";
type Rule = { id: string; name: string; description: string | null; trigger: Trigger; conditions: AutomationCondition[]; action: Action; actionConfig: AutomationActionConfig; isActive: boolean; isSystem: boolean; runs: number; failures: number; lastRunAt: Date | null };
type Run = { id: string; ruleId: string; ruleName: string; triggerEvent: string; entityType: string; entityId: string; status: "succeeded" | "failed" | "skipped"; error: string | null; details: Record<string, unknown> | null; createdAt: Date };

const TRIGGERS: Record<Trigger, { label: string; fields: { key: string; label: string; values?: string[] }[] }> = {
  submission_stage_changed: {
    label: "Submission stage changed",
    fields: [
      { key: "toStage", label: "New stage", values: ["sourced", "contacted", "interested", "screening", "interviewing", "presented", "customer_review", "offered", "accepted", "placed", "declined_by_candidate", "rejected_by_customer", "withdrawn", "not_eligible"] },
      { key: "fromStage", label: "Previous stage" },
      { key: "eligibility", label: "Eligibility", values: ["eligible", "review", "ineligible"] },
      { key: "reason", label: "Decision reason" },
    ],
  },
  placement_status_changed: {
    label: "Placement status changed",
    fields: [
      { key: "toStatus", label: "New status", values: ["reserved", "started", "active", "extended", "completed", "cancelled", "replaced"] },
      { key: "fromStatus", label: "Previous status" },
    ],
  },
  message_failed: { label: "Outbound message failed", fields: [{ key: "channel", label: "Channel", values: ["whatsapp", "email", "sms", "manual"] }, { key: "attempts", label: "Attempts" }] },
  task_overdue: { label: "Task became overdue", fields: [{ key: "type", label: "Task type" }, { key: "priority", label: "Priority", values: ["low", "medium", "high", "urgent"] }] },
  candidate_created: { label: "Candidate created", fields: [{ key: "status", label: "Status" }, { key: "hasCommunicationConsent", label: "Has communication consent", values: ["true", "false"] }, { key: "merged", label: "Created by merge", values: ["true", "false"] }] },
  requisition_created: { label: "Requisition created", fields: [{ key: "status", label: "Status" }, { key: "priority", label: "Priority", values: ["low", "medium", "high", "urgent"] }, { key: "headcount", label: "Headcount" }] },
  verification_changed: { label: "Skill verification decided", fields: [{ key: "decision", label: "Decision", values: ["verified", "rejected", "pending_review"] }, { key: "skill", label: "Skill name" }] },
  schedule_daily: { label: "Daily schedule", fields: [{ key: "overdueEvents", label: "Overdue tasks found" }, { key: "stalledSubmissions", label: "Stalled submissions found" }, { key: "stalledRequisitions", label: "Stalled requisitions found" }, { key: "expiringEvidence", label: "Expiring evidence found" }] },
};

const ACTIONS: Record<Action, { label: string; hint: string }> = {
  create_task: { label: "Create a task", hint: "Owner is the record owner; the task carries a dedupe key so it is never duplicated." },
  notify_owner: { label: "Notify the record owner", hint: "In-app notification with a link to the record. Respects mute preferences." },
  queue_message: { label: "Queue a template message", hint: "WhatsApp if approved and consented, else email, else a manual contact task." },
  update_candidate_status: { label: "Update candidate status", hint: "Sets the candidate's status. Use with care — it is applied without review." },
};

const OPERATORS = [
  { value: "equals", label: "is" },
  { value: "not_equals", label: "is not" },
  { value: "in", label: "is one of" },
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
] as const;

const TASK_TYPES = enumOptions(["follow_up", "verification", "availability_check", "eligibility_review", "message_failed", "stalled_request", "manual_contact", "placement_checklist", "import_review", "other"]);
const PRIORITIES = enumOptions(["low", "medium", "high", "urgent"]);
const CANDIDATE_STATUSES = enumOptions(["new", "screening", "active", "placed", "unavailable", "withdrawn", "archived"]);

function describeCondition(c: AutomationCondition, trigger: Trigger): string {
  const field = TRIGGERS[trigger]?.fields.find((f) => f.key === c.field)?.label ?? humanize(c.field);
  const op = OPERATORS.find((o) => o.value === c.operator)?.label ?? c.operator;
  const value = Array.isArray(c.value) ? c.value.map((v) => humanize(String(v))).join(", ") : humanize(String(c.value));
  return `${field} ${op} ${value}`;
}

function describeAction(rule: Rule): string {
  const c = rule.actionConfig;
  switch (rule.action) {
    case "create_task":
      return `Task “${c.title ?? rule.name}”${c.taskType ? ` (${humanize(c.taskType)})` : ""}${c.dueInHours ? `, due in ${c.dueInHours}h` : ""}${c.priority ? `, ${c.priority}` : ""}`;
    case "notify_owner":
      return `Notify owner: “${c.notificationTitle ?? c.title ?? rule.name}”`;
    case "queue_message":
      return `Send template “${c.templateName ?? "—"}”`;
    case "update_candidate_status":
      return `Set candidate status → ${humanize(c.candidateStatus ?? "—")}`;
  }
}

function linkForRun(run: Run): string | null {
  switch (run.entityType) {
    case "submission":
      return `/submissions/${run.entityId}`;
    case "placement":
      return `/placements/${run.entityId}`;
    case "candidate":
      return `/candidates/${run.entityId}`;
    case "requisition":
      return `/requisitions/${run.entityId}`;
    case "task":
      return `/work-queue?task=${run.entityId}`;
    default:
      return null;
  }
}

export function AutomationsView({ rules, runs, templateNames, runs24h }: { rules: Rule[]; runs: Run[]; templateNames: string[]; runs24h: number }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"rules" | "runs">("rules");
  const [sheet, setSheet] = React.useState<{ open: boolean; rule: Rule | null }>({ open: false, rule: null });
  const toggle = useAction(upsertAutomationRuleAction, { successMessage: "Rule updated", onSuccess: () => router.refresh() });
  const remove = useAction(deleteAutomationRuleAction, { successMessage: "Rule deleted", onSuccess: () => router.refresh() });

  const active = rules.filter((r) => r.isActive).length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active rules" value={active} hint={`${rules.length - active} inactive · ${rules.filter((r) => r.isSystem).length} system`} icon={WorkflowIcon} />
        <KpiCard label="Runs (24h)" value={runs24h} hint="Across all rules" />
        <KpiCard label="Failed runs (recent)" value={failedRuns} hint={failedRuns ? "Open the Runs tab for the error" : "No failures in the recent window"} />
        <KpiCard label="Rules with failures" value={rules.filter((r) => r.failures > 0).length} hint="Lifetime failure count > 0" />
      </div>

      <div className="surface">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="rules">Rules ({rules.length})</TabsTrigger>
              <TabsTrigger value="runs">Recent runs ({runs.length})</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button className="ml-auto" size="sm" onClick={() => setSheet({ open: true, rule: null })}>
            <PlusIcon data-icon="inline-start" />
            New rule
          </Button>
        </div>

        {tab === "rules" ? (
          rules.length === 0 ? (
            <EmptyState icon={WorkflowIcon} title="No automation rules" description="Start with the essentials: a follow-up task when a message fails, a checklist when a placement is reserved, a nudge when a submission stalls." action={<Button onClick={() => setSheet({ open: true, rule: null })}>Create a rule</Button>} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Active</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Then</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id} className={cn(!r.isActive && "opacity-60")}>
                    <TableCell>
                      <Switch checked={r.isActive} disabled={toggle.pending} aria-label={`Toggle ${r.name}`} onCheckedChange={(isActive) => toggle.run({ id: r.id, name: r.name, description: r.description ?? "", trigger: r.trigger, conditions: r.conditions, action: r.action, actionConfig: r.actionConfig, isActive })} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.name}</span>
                        {r.isSystem ? <StatusBadge value="primary" tone="primary" label="System" /> : null}
                      </div>
                      {r.description ? <p className="max-w-xs text-xs text-muted-foreground">{r.description}</p> : null}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{TRIGGERS[r.trigger]?.label ?? humanize(r.trigger)}</p>
                      {r.conditions.length ? (
                        <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                          {r.conditions.map((c, i) => (
                            <li key={i}>· {describeCondition(c, r.trigger)}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">Always</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="flex items-center gap-1.5 text-sm">
                        <ArrowRightIcon className="size-3.5 text-muted-foreground" />
                        {describeAction(r)}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.runs}
                      {r.failures ? <span className="ml-1 text-xs text-danger-foreground">({r.failures} failed)</span> : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.lastRunAt ? fmtRelative(r.lastRunAt) : "Never"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.name}`} onClick={() => setSheet({ open: true, rule: r })}>
                          <PencilIcon />
                        </Button>
                        {!r.isSystem ? (
                          <ConfirmButton title={`Delete “${r.name}”?`} description="The rule stops running immediately. Its run history is kept." confirmLabel="Delete" variant="ghost" size="icon-sm" destructive pending={remove.pending} onConfirm={() => remove.run({ id: r.id })}>
                            <Trash2Icon />
                          </ConfirmButton>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        ) : runs.length === 0 ? (
          <EmptyState icon={WorkflowIcon} title="No runs yet" description="A run is recorded every time a trigger fires and a rule's conditions match — including skipped and failed ones." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => {
                const href = linkForRun(r);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <StatusBadge value={r.status} />
                    </TableCell>
                    <TableCell className="font-medium">{r.ruleName}</TableCell>
                    <TableCell className="text-sm">{humanize(r.triggerEvent)}</TableCell>
                    <TableCell className="text-sm">
                      {href ? (
                        <Link href={href} className="hover:underline">
                          {humanize(r.entityType)} ↗
                        </Link>
                      ) : (
                        humanize(r.entityType)
                      )}
                    </TableCell>
                    <TableCell className="max-w-sm text-xs text-muted-foreground">
                      {r.error ? <span className="text-danger-foreground">{r.error}</span> : r.details ? Object.entries(r.details).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground" title={fmtDateTime(r.createdAt)}>
                      {fmtRelative(r.createdAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {sheet.open ? <RuleSheet key={sheet.rule?.id ?? "new"} rule={sheet.rule} templateNames={templateNames} onClose={() => setSheet({ open: false, rule: null })} /> : null}
    </>
  );
}

type ConditionDraft = { field: string; operator: (typeof OPERATORS)[number]["value"]; value: string };

function RuleSheet({ rule, templateNames, onClose }: { rule: Rule | null; templateNames: string[]; onClose: () => void }) {
  const router = useRouter();
  const [conditions, setConditions] = React.useState<ConditionDraft[]>(rule?.conditions.map((c) => ({ field: c.field, operator: c.operator, value: Array.isArray(c.value) ? c.value.join(", ") : String(c.value) })) ?? []);
  const form = useZodForm(automationRuleSchema, {
    id: rule?.id ?? "",
    name: rule?.name ?? "",
    description: rule?.description ?? "",
    trigger: rule?.trigger ?? "submission_stage_changed",
    conditions: rule?.conditions ?? [],
    action: rule?.action ?? "create_task",
    actionConfig: {
      taskType: rule?.actionConfig.taskType ?? "follow_up",
      title: rule?.actionConfig.title ?? "",
      dueInHours: rule?.actionConfig.dueInHours ?? "",
      priority: rule?.actionConfig.priority ?? "medium",
      templateName: rule?.actionConfig.templateName ?? "",
      candidateStatus: rule?.actionConfig.candidateStatus ?? "",
      notificationTitle: rule?.actionConfig.notificationTitle ?? "",
    },
    isActive: rule?.isActive ?? true,
  });
  const { run, pending, fieldErrors } = useAction(upsertAutomationRuleAction, {
    successMessage: rule ? "Rule updated" : "Rule created",
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  const trigger = useFieldValue(form, "trigger") as Trigger;
  const action = useFieldValue(form, "action") as Action;
  const fields = TRIGGERS[trigger]?.fields ?? [];

  const serialize = (drafts: ConditionDraft[]): AutomationCondition[] =>
    drafts
      .filter((c) => c.field && c.value.trim() !== "")
      .map((c) => ({ field: c.field, operator: c.operator, value: c.operator === "in" ? c.value.split(",").map((s) => s.trim()).filter(Boolean) : c.operator === "gte" || c.operator === "lte" ? Number(c.value) : c.value.trim() }));

  const updateCondition = (i: number, patch: Partial<ConditionDraft>) => {
    const next = conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    setConditions(next);
    form.setValue("conditions", serialize(next), { shouldDirty: true });
  };
  const addCondition = () => {
    const next = [...conditions, { field: fields[0]?.key ?? "", operator: "equals" as const, value: "" }];
    setConditions(next);
  };
  const removeCondition = (i: number) => {
    const next = conditions.filter((_, idx) => idx !== i);
    setConditions(next);
    form.setValue("conditions", serialize(next), { shouldDirty: true });
  };

  const submit = (values: Parameters<typeof run>[0]) => {
    const cfg = { ...(values.actionConfig ?? {}) } as Record<string, unknown>;
    for (const k of Object.keys(cfg)) if (cfg[k] === "" || cfg[k] === undefined) delete cfg[k];
    return run({ ...values, conditions: serialize(conditions), actionConfig: cfg });
  };

  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title={rule ? `Edit ${rule.name}` : "New automation rule"} description="Rules are evaluated synchronously when the event happens. Actions are idempotent per (rule, event, record)." size="lg">
      <Form form={form} onSubmit={submit} fieldErrors={fieldErrors}>
        <FormRow>
          <TextField name="name" label="Rule name" placeholder="e.g. Follow up on failed WhatsApp" required autoFocus />
          <SwitchField name="isActive" label="Active" description="Inactive rules are kept but never run." />
        </FormRow>
        <TextareaField name="description" label="Description" placeholder="Why this rule exists — shown on tasks it creates." rows={2} />

        <FormSection title="When" description="The event that starts the rule, plus optional conditions on the event's fields. All conditions must match.">
          <SelectField
            name="trigger"
            label="Trigger"
            options={(Object.keys(TRIGGERS) as Trigger[]).map((t) => ({ value: t, label: TRIGGERS[t].label }))}
            required
            disabled={rule?.isSystem}
          />
          <div className="flex flex-col gap-2">
            {conditions.map((c, i) => {
              const fieldMeta = fields.find((f) => f.key === c.field);
              return (
                <div key={i} className="grid grid-cols-[1fr_120px_1fr_32px] items-center gap-2">
                  <Select value={c.field} onValueChange={(field) => updateCondition(i, { field, value: "" })}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Field" />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={c.operator} onValueChange={(operator) => updateCondition(i, { operator: operator as ConditionDraft["operator"] })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldMeta?.values && c.operator !== "in" && c.operator !== "gte" && c.operator !== "lte" ? (
                    <Select value={c.value} onValueChange={(value) => updateCondition(i, { value })}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Value" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldMeta.values.map((v) => (
                          <SelectItem key={v} value={v}>
                            {humanize(v)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input className="h-9" value={c.value} onChange={(e) => updateCondition(i, { value: e.target.value })} placeholder={c.operator === "in" ? "value1, value2" : fieldMeta?.values ? fieldMeta.values.slice(0, 3).join(" / ") : "Value"} />
                  )}
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove condition" onClick={() => removeCondition(i)}>
                    <XIcon />
                  </Button>
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={addCondition} disabled={fields.length === 0}>
              <PlusIcon data-icon="inline-start" />
              Add condition
            </Button>
          </div>
        </FormSection>

        <FormSection title="Then" description={ACTIONS[action]?.hint}>
          <SelectField name="action" label="Action" options={(Object.keys(ACTIONS) as Action[]).map((a) => ({ value: a, label: ACTIONS[a].label }))} required />
          {action === "create_task" ? (
            <>
              <TextField name="actionConfig.title" label="Task title" placeholder="e.g. Call {{label}} — message failed" hint="Use {{field}} placeholders from the event; {{label}} is the record's display name." />
              <FormRow cols={3}>
                <SelectField name="actionConfig.taskType" label="Task type" options={TASK_TYPES} />
                <SelectField name="actionConfig.priority" label="Priority" options={PRIORITIES} />
                <NumberField name="actionConfig.dueInHours" label="Due in (hours)" placeholder="Default from settings" min={1} />
              </FormRow>
            </>
          ) : null}
          {action === "notify_owner" ? <TextField name="actionConfig.notificationTitle" label="Notification title" placeholder="e.g. {{label}} moved to {{toStage}}" hint="Placeholders from the event payload are filled in." /> : null}
          {action === "queue_message" ? (
            templateNames.length ? (
              <SelectField name="actionConfig.templateName" label="Template" options={templateNames.map((n) => ({ value: n, label: n }))} required hint="Only approved templates are listed. WhatsApp is used when the candidate consented and the template is provider-approved." />
            ) : (
              <p className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
                No approved templates yet. <Link href="/admin/templates" className="underline">Create and approve one</Link> first.
              </p>
            )
          ) : null}
          {action === "update_candidate_status" ? <SelectField name="actionConfig.candidateStatus" label="New candidate status" options={CANDIDATE_STATUSES} required /> : null}
        </FormSection>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>{rule ? "Save rule" : "Create rule"}</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}
