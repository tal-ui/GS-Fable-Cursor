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
import {
  candidateStatusEnum,
  claimOriginEnum,
  compensationTypeEnum,
  consentChannelEnum,
  consentScopeEnum,
  documentAccessActionEnum,
  documentKindEnum,
  grossNetEnum,
  languageProficiencyEnum,
  payPeriodEnum,
  proficiencyLevelEnum,
  rotationPreferenceEnum,
  scanStatusEnum,
  sourceEventTypeEnum,
  sourceTypeEnum,
  verificationStatusEnum,
  workAuthTypeEnum,
} from "./enums";
import { skills } from "./taxonomy";
import { accounts } from "./crm";
import { placements, submissions } from "./pipeline";
import { importBatches } from "./ops";

export const sources = pgTable(
  "sources",
  {
    ...systemColumns,
    name: text("name").notNull(),
    type: sourceTypeEnum("type").notNull().default("other"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    /** Free-text commission / referral terms; commission rules engine is a later extension. */
    commissionTerms: text("commission_terms"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("sources_name_idx").on(t.name), index("sources_type_idx").on(t.type)],
);

export type ExtractionSuggestion = {
  field: string;
  value: unknown;
  confidence: number;
  evidence?: string;
  accepted?: boolean | null;
};

export const candidates = pgTable(
  "candidates",
  {
    ...systemColumns,
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    /** E.164 digits only, used for duplicate detection. */
    phoneNormalized: text("phone_normalized"),
    city: text("city"),
    country: text("country"),
    dateOfBirth: date("date_of_birth"),
    headline: text("headline"),
    summary: text("summary"),
    status: candidateStatusEnum("status").notNull().default("new"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    primarySourceId: uuid("primary_source_id").references(() => sources.id, { onDelete: "set null" }),
    citizenships: text("citizenships")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    passportCountry: text("passport_country"),
    passportExpiry: date("passport_expiry"),
    passportVerificationStatus: verificationStatusEnum("passport_verification_status").notNull().default("unverified"),
    militaryRole: text("military_role"),
    militaryUnit: text("military_unit"),
    militaryRank: text("military_rank"),
    militaryServiceStart: date("military_service_start"),
    militaryServiceEnd: date("military_service_end"),
    yearsExperience: numeric("years_experience", { precision: 4, scale: 1 }),
    willingToRelocate: boolean("willing_to_relocate"),
    relocationConstraints: text("relocation_constraints"),
    preferredCountries: text("preferred_countries")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    externalRef: text("external_ref"),
    mergedIntoId: uuid("merged_into_id").references((): AnyPgColumn => candidates.id, { onDelete: "set null" }),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    extractionSuggestions: jsonb("extraction_suggestions").$type<ExtractionSuggestion[]>(),
    extractionReviewedAt: timestamp("extraction_reviewed_at", { withTimezone: true }),
    /** A documented, time-boxed reason to keep the profile past the retention period (legal claim, open dispute, audit). */
    retentionHoldReason: text("retention_hold_reason"),
    retentionHoldUntil: date("retention_hold_until"),
    /** Set when personal data was erased; the row stays so submissions and placements still reconcile. */
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  },
  (t) => [
    index("candidates_email_idx").on(t.email),
    index("candidates_anonymized_idx").on(t.anonymizedAt),
    index("candidates_phone_idx").on(t.phoneNormalized),
    index("candidates_last_name_idx").on(t.lastName),
    index("candidates_status_idx").on(t.status),
    index("candidates_owner_idx").on(t.ownerId),
    index("candidates_source_idx").on(t.primarySourceId),
    index("candidates_merged_idx").on(t.mergedIntoId),
    index("candidates_created_idx").on(t.createdAt),
    index("candidates_external_ref_idx").on(t.externalRef),
  ],
);

export const candidateSkillClaims = pgTable(
  "candidate_skill_claims",
  {
    ...systemColumns,
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "restrict" }),
    originalWording: text("original_wording"),
    declaredProficiency: proficiencyLevelEnum("declared_proficiency").notNull().default("intermediate"),
    yearsExperience: numeric("years_experience", { precision: 4, scale: 1 }),
    lastUsedYear: integer("last_used_year"),
    origin: claimOriginEnum("origin").notNull().default("recruiter_entered"),
    aiConfidence: numeric("ai_confidence", { precision: 4, scale: 3 }),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
    evidenceDocumentId: uuid("evidence_document_id").references((): AnyPgColumn => documents.id, { onDelete: "set null" }),
    evidenceNotes: text("evidence_notes"),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    expiresAt: date("expires_at"),
  },
  (t) => [
    uniqueIndex("candidate_skill_claims_uq")
      .on(t.candidateId, t.skillId)
      .where(sql`${t.isDeleted} = false`),
    index("candidate_skill_claims_skill_idx").on(t.skillId),
    index("candidate_skill_claims_verification_idx").on(t.verificationStatus),
    index("candidate_skill_claims_expires_idx").on(t.expiresAt),
  ],
);

export const candidateLanguages = pgTable(
  "candidate_languages",
  {
    ...systemColumns,
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    /** ISO 639-1 code, e.g. "he", "en". */
    language: text("language").notNull(),
    proficiency: languageProficiencyEnum("proficiency").notNull(),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("candidate_languages_uq")
      .on(t.candidateId, t.language)
      .where(sql`${t.isDeleted} = false`),
    index("candidate_languages_language_idx").on(t.language),
  ],
);

export const candidateWorkAuthorizations = pgTable(
  "candidate_work_authorizations",
  {
    ...systemColumns,
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    country: text("country").notNull(),
    type: workAuthTypeEnum("type").notNull(),
    validFrom: date("valid_from"),
    validUntil: date("valid_until"),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
    evidenceDocumentId: uuid("evidence_document_id").references((): AnyPgColumn => documents.id, { onDelete: "set null" }),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (t) => [
    index("candidate_work_auth_candidate_country_idx").on(t.candidateId, t.country),
    index("candidate_work_auth_valid_until_idx").on(t.validUntil),
  ],
);

export const candidateAvailability = pgTable(
  "candidate_availability",
  {
    ...systemColumns,
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    availableFrom: date("available_from").notNull(),
    availableUntil: date("available_until"),
    minDurationWeeks: integer("min_duration_weeks"),
    maxDurationWeeks: integer("max_duration_weeks"),
    rotationPreference: rotationPreferenceEnum("rotation_preference").notNull().default("no_preference"),
    willingToRelocate: boolean("willing_to_relocate").notNull().default(true),
    relocationConstraints: text("relocation_constraints"),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),
    confirmedById: uuid("confirmed_by_id").references(() => users.id, { onDelete: "set null" }),
    confirmationChannel: text("confirmation_channel"),
    isCurrent: boolean("is_current").notNull().default(true),
    notes: text("notes"),
  },
  (t) => [
    index("candidate_availability_candidate_current_idx").on(t.candidateId, t.isCurrent),
    index("candidate_availability_from_idx").on(t.availableFrom),
    index("candidate_availability_confirmed_idx").on(t.lastConfirmedAt),
  ],
);

export const candidateCompensation = pgTable(
  "candidate_compensation",
  {
    ...systemColumns,
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    type: compensationTypeEnum("type").notNull().default("expected"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    period: payPeriodEnum("period").notNull(),
    grossNet: grossNetEnum("gross_net").notNull().default("gross"),
    effectiveDate: date("effective_date"),
    notes: text("notes"),
  },
  (t) => [index("candidate_compensation_candidate_idx").on(t.candidateId)],
);

export const consents = pgTable(
  "consents",
  {
    ...systemColumns,
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    scope: consentScopeEnum("scope").notNull(),
    /** Required when scope = share_with_customer: the named customer. */
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    noticeVersion: text("notice_version").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    channel: consentChannelEnum("channel").notNull(),
    evidence: text("evidence"),
    evidenceDocumentId: uuid("evidence_document_id").references((): AnyPgColumn => documents.id, { onDelete: "set null" }),
    recordedById: uuid("recorded_by_id").references(() => users.id, { onDelete: "set null" }),
    withdrawnById: uuid("withdrawn_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("consents_candidate_scope_idx").on(t.candidateId, t.scope),
    index("consents_account_idx").on(t.accountId),
    index("consents_withdrawn_idx").on(t.withdrawnAt),
  ],
);

export const documents = pgTable(
  "documents",
  {
    ...systemColumns,
    candidateId: uuid("candidate_id").references(() => candidates.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    submissionId: uuid("submission_id").references((): AnyPgColumn => submissions.id, { onDelete: "set null" }),
    placementId: uuid("placement_id").references((): AnyPgColumn => placements.id, { onDelete: "set null" }),
    kind: documentKindEnum("kind").notNull().default("other"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    sha256: text("sha256").notNull(),
    version: integer("version").notNull().default(1),
    previousVersionId: uuid("previous_version_id").references((): AnyPgColumn => documents.id, { onDelete: "set null" }),
    scanStatus: scanStatusEnum("scan_status").notNull().default("pending"),
    isSensitive: boolean("is_sensitive").notNull().default(false),
    extractedText: text("extracted_text"),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("documents_candidate_idx").on(t.candidateId),
    index("documents_account_idx").on(t.accountId),
    index("documents_submission_idx").on(t.submissionId),
    index("documents_placement_idx").on(t.placementId),
    index("documents_kind_idx").on(t.kind),
    index("documents_sha_idx").on(t.sha256),
  ],
);

/**
 * One-time, expiring links a recruiter sends so a candidate can upload identity documents or
 * certificates themselves instead of over chat. Only the token hash is stored; the link pins the
 * candidate and the allowed document kinds, and every upload through it is logged and reviewed.
 */
export const uploadLinks = pgTable(
  "upload_links",
  {
    ...systemColumns,
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    kinds: documentKindEnum("kinds").array().notNull(),
    purpose: text("purpose"),
    maxFiles: integer("max_files").notNull().default(3),
    usedCount: integer("used_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    lastUsedIp: text("last_used_ip"),
  },
  (t) => [index("upload_links_candidate_idx").on(t.candidateId), index("upload_links_expires_idx").on(t.expiresAt)],
);

export const documentAccessLog = pgTable(
  "document_access_log",
  {
    ...logColumns,
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: documentAccessActionEnum("action").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    details: jsonb("details").$type<Record<string, unknown>>(),
  },
  (t) => [index("document_access_document_idx").on(t.documentId), index("document_access_user_idx").on(t.userId)],
);

export const sourceEvents = pgTable(
  "source_events",
  {
    ...systemColumns,
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    eventType: sourceEventTypeEnum("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    importBatchId: uuid("import_batch_id").references((): AnyPgColumn => importBatches.id, { onDelete: "set null" }),
    referrerName: text("referrer_name"),
    /** Candidate id this event belonged to before a merge, for attribution history. */
    originalCandidateId: uuid("original_candidate_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
  },
  (t) => [
    index("source_events_candidate_idx").on(t.candidateId),
    index("source_events_source_idx").on(t.sourceId),
    index("source_events_batch_idx").on(t.importBatchId),
    index("source_events_occurred_idx").on(t.occurredAt),
  ],
);

export const candidateMerges = pgTable(
  "candidate_merges",
  {
    ...logColumns,
    primaryCandidateId: uuid("primary_candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    mergedCandidateId: uuid("merged_candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    mergedById: uuid("merged_by_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    /** Full pre-merge copy of the merged record and its child rows so the merge can be recovered. */
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    undoneById: uuid("undone_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("candidate_merges_primary_idx").on(t.primaryCandidateId), index("candidate_merges_merged_idx").on(t.mergedCandidateId)],
);
