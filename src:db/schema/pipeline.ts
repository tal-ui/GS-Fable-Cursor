import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { logColumns, systemColumns } from "./_system";
import { users } from "./auth";
import { candidates, consents, documents, sources } from "./candidates";
import { accounts, contacts } from "./crm";
import {
  cancellationReasonEnum,
  decisionReasonEnum,
  disclosureChannelEnum,
  eligibilityOutcomeEnum,
  grossNetEnum,
  interviewOutcomeEnum,
  interviewStatusEnum,
  interviewTypeEnum,
  matchFeedbackActionEnum,
  payPeriodEnum,
  placementStatusEnum,
  submissionStageEnum,
} from "./enums";
import { requisitions } from "./requisitions";

export type MatchSnapshot = {
  requirementVersion: number;
  rankingVersion: string;
  eligibility: "eligible" | "review" | "ineligible";
  score: number;
  components: { name: string; weight: number; score: number; detail: string }[];
  ruleResults: {
    requirementId: string;
    kind: "mandatory" | "preferred";
    field: string;
    operator: string;
    expected: unknown;
    outcome: "pass" | "fail" | "unknown";
    reason: string;
    evidence?: { fact: string; status?: string; date?: string | null } | null;
  }[];
  unmetPreferences: string[];
  supportingFacts: { label: string; value: string; verification?: string; date?: string | null }[];
  computedAt: string;
};

export const submissions = pgTable(
  "submissions",
  {
    ...systemColumns,
    requisitionId: uuid("requisition_id")
      .notNull()
      .references(() => requisitions.id, { onDelete: "restrict" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "restrict" }),
    stage: submissionStageEnum("stage").notNull().default("sourced"),
    eligibility: eligibilityOutcomeEnum("eligibility").notNull().default("review"),
    matchScore: numeric("match_score", { precision: 6, scale: 3 }),
    matchSnapshot: jsonb("match_snapshot").$type<MatchSnapshot>(),
    requirementVersion: integer("requirement_version").notNull().default(1),
    rankingVersion: text("ranking_version"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    interestConfirmedAt: timestamp("interest_confirmed_at", { withTimezone: true }),
    availabilityConfirmedAt: timestamp("availability_confirmed_at", { withTimezone: true }),
    sharingConsentId: uuid("sharing_consent_id").references(() => consents.id, { onDelete: "set null" }),
    presentedAt: timestamp("presented_at", { withTimezone: true }),
    offeredAt: timestamp("offered_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    decisionReason: decisionReasonEnum("decision_reason"),
    decisionNotes: text("decision_notes"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("submissions_requisition_candidate_uq")
      .on(t.requisitionId, t.candidateId)
      .where(sql`${t.isDeleted} = false`),
    index("submissions_candidate_idx").on(t.candidateId),
    index("submissions_stage_idx").on(t.stage),
    index("submissions_owner_idx").on(t.ownerId),
    index("submissions_eligibility_idx").on(t.eligibility),
    index("submissions_stage_changed_idx").on(t.stageChangedAt),
  ],
);

export const submissionStageHistory = pgTable(
  "submission_stage_history",
  {
    ...logColumns,
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    fromStage: submissionStageEnum("from_stage"),
    toStage: submissionStageEnum("to_stage").notNull(),
    reason: decisionReasonEnum("reason"),
    notes: text("notes"),
    changedById: uuid("changed_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("submission_stage_history_submission_idx").on(t.submissionId)],
);

export const interviews = pgTable(
  "interviews",
  {
    ...systemColumns,
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    type: interviewTypeEnum("type").notNull(),
    status: interviewStatusEnum("status").notNull().default("scheduled"),
    outcome: interviewOutcomeEnum("outcome").notNull().default("pending"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    interviewerId: uuid("interviewer_id").references(() => users.id, { onDelete: "set null" }),
    customerContactId: uuid("customer_contact_id").references(() => contacts.id, { onDelete: "set null" }),
    location: text("location"),
    meetingLink: text("meeting_link"),
    notes: text("notes"),
    summary: text("summary"),
    transcriptDocumentId: uuid("transcript_document_id").references((): AnyPgColumn => documents.id, { onDelete: "set null" }),
    aiDisclosureShownAt: timestamp("ai_disclosure_shown_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("interviews_submission_idx").on(t.submissionId),
    index("interviews_scheduled_idx").on(t.scheduledAt),
    index("interviews_interviewer_idx").on(t.interviewerId),
    index("interviews_status_idx").on(t.status),
  ],
);

export const disclosures = pgTable(
  "disclosures",
  {
    ...systemColumns,
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    /** The customer-specific sharing consent that authorised this disclosure. */
    consentId: uuid("consent_id")
      .notNull()
      .references(() => consents.id, { onDelete: "restrict" }),
    channel: disclosureChannelEnum("channel").notNull(),
    fieldsShared: jsonb("fields_shared").$type<string[]>().notNull(),
    documentIds: jsonb("document_ids").$type<string[]>().notNull().default([]),
    summaryText: text("summary_text"),
    sharedById: uuid("shared_by_id").references(() => users.id, { onDelete: "set null" }),
    sharedAt: timestamp("shared_at", { withTimezone: true }).notNull().defaultNow(),
    isRevoked: boolean("is_revoked").notNull().default(false),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (t) => [
    index("disclosures_submission_idx").on(t.submissionId),
    index("disclosures_candidate_idx").on(t.candidateId),
    index("disclosures_account_idx").on(t.accountId),
    index("disclosures_consent_idx").on(t.consentId),
  ],
);

export type PlacementChecklistItem = { key: string; label: string; done: boolean; doneAt?: string | null };

export const placements = pgTable(
  "placements",
  {
    ...systemColumns,
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "restrict" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "restrict" }),
    requisitionId: uuid("requisition_id")
      .notNull()
      .references(() => requisitions.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    status: placementStatusEnum("status").notNull().default("reserved"),
    plannedStart: date("planned_start").notNull(),
    plannedEnd: date("planned_end"),
    actualStart: date("actual_start"),
    actualEnd: date("actual_end"),
    billRateAmount: numeric("bill_rate_amount", { precision: 12, scale: 2 }),
    billRateCurrency: text("bill_rate_currency"),
    billRatePeriod: payPeriodEnum("bill_rate_period"),
    payRateAmount: numeric("pay_rate_amount", { precision: 12, scale: 2 }),
    payRateCurrency: text("pay_rate_currency"),
    payRatePeriod: payPeriodEnum("pay_rate_period"),
    grossNet: grossNetEnum("gross_net").notNull().default("gross"),
    replacementOfId: uuid("replacement_of_id").references((): AnyPgColumn => placements.id, { onDelete: "set null" }),
    extensionOfId: uuid("extension_of_id").references((): AnyPgColumn => placements.id, { onDelete: "set null" }),
    cancellationReason: cancellationReasonEnum("cancellation_reason"),
    cancellationNotes: text("cancellation_notes"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    checklist: jsonb("checklist").$type<PlacementChecklistItem[]>().notNull().default([]),
    notes: text("notes"),
  },
  (t) => [
    index("placements_submission_idx").on(t.submissionId),
    index("placements_candidate_idx").on(t.candidateId),
    index("placements_requisition_idx").on(t.requisitionId),
    index("placements_account_idx").on(t.accountId),
    index("placements_status_idx").on(t.status),
    index("placements_owner_idx").on(t.ownerId),
    index("placements_candidate_dates_idx").on(t.candidateId, t.plannedStart, t.plannedEnd),
  ],
);

export const matchFeedback = pgTable(
  "match_feedback",
  {
    ...logColumns,
    requisitionId: uuid("requisition_id")
      .notNull()
      .references(() => requisitions.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id").references(() => submissions.id, { onDelete: "set null" }),
    action: matchFeedbackActionEnum("action").notNull(),
    reason: text("reason"),
    rankingVersion: text("ranking_version"),
    requirementVersion: integer("requirement_version"),
    score: numeric("score", { precision: 6, scale: 3 }),
    eligibility: eligibilityOutcomeEnum("eligibility"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
  },
  (t) => [index("match_feedback_requisition_idx").on(t.requisitionId), index("match_feedback_candidate_idx").on(t.candidateId)],
);
