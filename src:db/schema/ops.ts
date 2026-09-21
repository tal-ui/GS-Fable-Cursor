import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { logColumns, systemColumns } from "./_system";
import { users } from "./auth";
import { candidates, sources } from "./candidates";
import { accounts, contacts } from "./crm";
import {
  activityTypeEnum,
  aiPurposeEnum,
  automationActionEnum,
  automationRunStatusEnum,
  automationTriggerEnum,
  importEntityEnum,
  importStatusEnum,
  jobStatusEnum,
  messageChannelEnum,
  messageDirectionEnum,
  messageStatusEnum,
  priorityEnum,
  taskStatusEnum,
  taskTypeEnum,
  templateStatusEnum,
} from "./enums";
import { placements, submissions } from "./pipeline";
import { requisitions } from "./requisitions";

export const activities = pgTable(
  "activities",
  {
    ...systemColumns,
    type: activityTypeEnum("type").notNull().default("note"),
    subject: text("subject").notNull(),
    /** Sanitized HTML. */
    body: text("body"),
    candidateId: uuid("candidate_id").references(() => candidates.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    requisitionId: uuid("requisition_id").references(() => requisitions.id, { onDelete: "set null" }),
    submissionId: uuid("submission_id").references(() => submissions.id, { onDelete: "set null" }),
    placementId: uuid("placement_id").references(() => placements.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("activities_candidate_idx").on(t.candidateId),
    index("activities_account_idx").on(t.accountId),
    index("activities_requisition_idx").on(t.requisitionId),
    index("activities_submission_idx").on(t.submissionId),
    index("activities_placement_idx").on(t.placementId),
    index("activities_occurred_idx").on(t.occurredAt),
    index("activities_actor_idx").on(t.actorId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    ...systemColumns,
    title: text("title").notNull(),
    description: text("description"),
    type: taskTypeEnum("type").notNull().default("other"),
    status: taskStatusEnum("status").notNull().default("open"),
    priority: priorityEnum("priority").notNull().default("medium"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    candidateId: uuid("candidate_id").references(() => candidates.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    requisitionId: uuid("requisition_id").references(() => requisitions.id, { onDelete: "set null" }),
    submissionId: uuid("submission_id").references(() => submissions.id, { onDelete: "set null" }),
    placementId: uuid("placement_id").references(() => placements.id, { onDelete: "set null" }),
    messageId: uuid("message_id").references((): AnyPgColumn => messages.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedById: uuid("completed_by_id").references(() => users.id, { onDelete: "set null" }),
    /** Loop guard: automations set this so the same event never creates the task twice. */
    dedupeKey: text("dedupe_key").unique(),
  },
  (t) => [
    index("tasks_owner_status_idx").on(t.ownerId, t.status),
    index("tasks_due_idx").on(t.dueAt),
    index("tasks_type_idx").on(t.type),
    index("tasks_candidate_idx").on(t.candidateId),
    index("tasks_account_idx").on(t.accountId),
    index("tasks_requisition_idx").on(t.requisitionId),
    index("tasks_submission_idx").on(t.submissionId),
    index("tasks_placement_idx").on(t.placementId),
  ],
);

export const messageTemplates = pgTable(
  "message_templates",
  {
    ...systemColumns,
    name: text("name").notNull(),
    channel: messageChannelEnum("channel").notNull(),
    language: text("language").notNull().default("en"),
    /** Provider-approved template identifier (required for business-initiated WhatsApp). */
    providerTemplateId: text("provider_template_id"),
    subject: text("subject"),
    body: text("body").notNull(),
    variables: jsonb("variables").$type<string[]>().notNull().default([]),
    status: templateStatusEnum("status").notNull().default("draft"),
    category: text("category"),
  },
  (t) => [index("message_templates_channel_status_idx").on(t.channel, t.status)],
);

export const messages = pgTable(
  "messages",
  {
    ...systemColumns,
    channel: messageChannelEnum("channel").notNull(),
    direction: messageDirectionEnum("direction").notNull().default("outbound"),
    status: messageStatusEnum("status").notNull().default("queued"),
    candidateId: uuid("candidate_id").references(() => candidates.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    submissionId: uuid("submission_id").references(() => submissions.id, { onDelete: "set null" }),
    templateId: uuid("template_id").references(() => messageTemplates.id, { onDelete: "set null" }),
    toAddress: text("to_address").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    variables: jsonb("variables").$type<Record<string, string>>(),
    providerMessageId: text("provider_message_id"),
    /** Stable idempotency key; retries reuse it so the provider never sends twice. */
    sendKey: text("send_key").notNull().unique(),
    errorMessage: text("error_message"),
    attempts: integer("attempts").notNull().default(0),
    consentId: uuid("consent_id"),
    fallbackTaskId: uuid("fallback_task_id").references((): AnyPgColumn => tasks.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
  },
  (t) => [
    index("messages_candidate_idx").on(t.candidateId),
    index("messages_status_idx").on(t.status),
    index("messages_submission_idx").on(t.submissionId),
    index("messages_provider_id_idx").on(t.providerMessageId),
    index("messages_created_idx").on(t.createdAt),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lastError: text("last_error"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    idempotencyKey: text("idempotency_key").unique(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("jobs_status_run_at_idx").on(t.status, t.runAt), index("jobs_type_idx").on(t.type)],
);

export type ImportRowError = { row: number; message: string };
export type ImportDuplicateProposal = {
  row: number;
  existingCandidateId: string;
  existingLabel: string;
  matchedOn: string[];
  decision?: "merge" | "create" | "skip";
};

export const importBatches = pgTable(
  "import_batches",
  {
    ...systemColumns,
    entity: importEntityEnum("entity").notNull(),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    status: importStatusEnum("status").notNull().default("previewed"),
    mapping: jsonb("mapping").$type<Record<string, string>>().notNull().default({}),
    rows: jsonb("rows").$type<Record<string, string>[]>().notNull().default([]),
    totalRows: integer("total_rows").notNull().default(0),
    importedRows: integer("imported_rows").notNull().default(0),
    errorRows: integer("error_rows").notNull().default(0),
    duplicateRows: integer("duplicate_rows").notNull().default(0),
    errors: jsonb("errors").$type<ImportRowError[]>().notNull().default([]),
    duplicates: jsonb("duplicates").$type<ImportDuplicateProposal[]>().notNull().default([]),
    createdRecordIds: jsonb("created_record_ids").$type<string[]>().notNull().default([]),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  },
  (t) => [index("import_batches_status_idx").on(t.status), index("import_batches_source_idx").on(t.sourceId)],
);

export type AutomationCondition = { field: string; operator: "equals" | "not_equals" | "gte" | "lte" | "in"; value: string | number | boolean | string[] };
export type AutomationActionConfig = {
  taskType?: string;
  title?: string;
  dueInHours?: number;
  priority?: "low" | "medium" | "high" | "urgent";
  templateName?: string;
  candidateStatus?: string;
  notificationTitle?: string;
};

export const automationRules = pgTable(
  "automation_rules",
  {
    ...systemColumns,
    name: text("name").notNull(),
    description: text("description"),
    trigger: automationTriggerEnum("trigger").notNull(),
    conditions: jsonb("conditions").$type<AutomationCondition[]>().notNull().default([]),
    action: automationActionEnum("action").notNull(),
    actionConfig: jsonb("action_config").$type<AutomationActionConfig>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    isSystem: boolean("is_system").notNull().default(false),
  },
  (t) => [index("automation_rules_trigger_active_idx").on(t.trigger, t.isActive)],
);

export const automationRuns = pgTable(
  "automation_runs",
  {
    ...logColumns,
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => automationRules.id, { onDelete: "cascade" }),
    triggerEvent: text("trigger_event").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    /** Unique per (rule, event, entity) so re-processing the same event is a no-op. */
    dedupeKey: text("dedupe_key").notNull().unique(),
    status: automationRunStatusEnum("status").notNull(),
    error: text("error"),
    details: jsonb("details").$type<Record<string, unknown>>(),
  },
  (t) => [index("automation_runs_rule_idx").on(t.ruleId), index("automation_runs_entity_idx").on(t.entityType, t.entityId)],
);

export const aiAuditLog = pgTable(
  "ai_audit_log",
  {
    ...logColumns,
    purpose: aiPurposeEnum("purpose").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    latencyMs: integer("latency_ms"),
    status: text("status").notNull(),
    error: text("error"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("ai_audit_entity_idx").on(t.entityType, t.entityId), index("ai_audit_created_idx").on(t.createdAt)],
);

export const integrationErrorLog = pgTable(
  "integration_error_log",
  {
    ...logColumns,
    integration: text("integration").notNull(),
    operation: text("operation").notNull(),
    errorMessage: text("error_message").notNull(),
    errorCode: text("error_code"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    attempts: integer("attempts").notNull().default(1),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("integration_error_integration_idx").on(t.integration), index("integration_error_created_idx").on(t.createdAt)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    ...logColumns,
    provider: text("provider").notNull(),
    externalEventId: text("external_event_id").notNull().unique(),
    signatureValid: boolean("signature_valid").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [index("webhook_events_provider_idx").on(t.provider)],
);
