import { z } from "zod";
import { grossNet, isoDate, optionalCurrency, optionalDate, optionalNumber, optionalPayPeriod, optionalText, optionalUuid, uuid } from "./common";

export const submissionStage = z.enum([
  "sourced",
  "contacted",
  "interested",
  "screening",
  "interviewing",
  "presented",
  "customer_review",
  "offered",
  "accepted",
  "placed",
  "declined_by_candidate",
  "rejected_by_customer",
  "withdrawn",
  "not_eligible",
]);

export const decisionReason = z.enum([
  "compensation_mismatch",
  "availability_conflict",
  "location_mismatch",
  "missing_evidence",
  "failed_interview",
  "customer_preference",
  "candidate_withdrew",
  "duplicate",
  "seat_unavailable",
  "other",
]);

export const createSubmissionSchema = z.object({
  requisitionId: uuid,
  candidateId: uuid,
  ownerId: optionalUuid,
  sourceId: optionalUuid,
  notes: optionalText(2000),
});

export const bulkCreateSubmissionsSchema = z.object({
  requisitionId: uuid,
  candidateIds: z.array(uuid).min(1).max(100),
});

export const stageChangeSchema = z
  .object({
    submissionId: uuid,
    toStage: submissionStage,
    reason: z.union([decisionReason, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)),
    notes: optionalText(2000),
    /** Required when accepting an offer (reserves a seat). */
    plannedStart: optionalDate,
    plannedEnd: optionalDate,
    /** Confirms the recruiter re-checked eligibility/permission before presenting or offering. */
    overrideReview: z.boolean().default(false),
  })
  .superRefine((s, ctx) => {
    const closing = ["declined_by_candidate", "rejected_by_customer", "withdrawn", "not_eligible"].includes(s.toStage);
    if (closing && !s.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "Choose a structured reason" });
    if (s.toStage === "accepted" && !s.plannedStart) ctx.addIssue({ code: "custom", path: ["plannedStart"], message: "Planned start is required to reserve a seat" });
  });

export const confirmInterestSchema = z.object({
  submissionId: uuid,
  interest: z.boolean().default(true),
  availabilityConfirmed: z.boolean().default(false),
  channel: z.string().trim().min(1).max(40).default("phone"),
  notes: optionalText(1000),
});

export const interviewSchema = z.object({
  id: optionalUuid,
  submissionId: uuid,
  type: z.enum(["screening_call", "technical", "customer_interview", "ai_chat_screening", "reference_check"]),
  scheduledAt: z.string().min(1, "Choose a date and time"),
  durationMinutes: z.coerce.number().int().min(5).max(480).default(30),
  interviewerId: optionalUuid,
  customerContactId: optionalUuid,
  location: optionalText(200),
  meetingLink: optionalText(300),
  notes: optionalText(4000),
});

export const interviewOutcomeSchema = z.object({
  id: uuid,
  status: z.enum(["completed", "cancelled", "no_show"]),
  outcome: z.enum(["pending", "pass", "fail", "hold"]).default("pending"),
  summary: optionalText(8000),
});

export const disclosureSchema = z.object({
  submissionId: uuid,
  contactId: optionalUuid,
  channel: z.enum(["email", "whatsapp", "phone", "in_person", "portal"]).default("email"),
  fieldsShared: z.array(z.string().trim().min(1)).min(1, "Choose at least one field to share"),
  documentIds: z.array(uuid).default([]),
  notes: optionalText(1000),
  /** Required when eligibility is "review": the recruiter confirms the evidence gap and is named in the audit log. */
  overrideReview: z.boolean().default(false),
});

export const matchFeedbackSchema = z.object({
  requisitionId: uuid,
  candidateId: uuid,
  action: z.enum(["accepted", "overridden_include", "overridden_exclude", "rejected"]),
  reason: optionalText(300),
  notes: optionalText(1000),
});

export const placementUpdateSchema = z.object({
  id: uuid,
  plannedStart: optionalDate,
  plannedEnd: optionalDate,
  billRateAmount: optionalNumber,
  billRateCurrency: optionalCurrency,
  billRatePeriod: optionalPayPeriod,
  payRateAmount: optionalNumber,
  payRateCurrency: optionalCurrency,
  payRatePeriod: optionalPayPeriod,
  grossNet: grossNet.optional(),
  ownerId: optionalUuid,
  notes: optionalText(4000),
});

export const placementStartSchema = z.object({ id: uuid, actualStart: isoDate });
export const placementCompleteSchema = z.object({ id: uuid, actualEnd: isoDate, notes: optionalText(1000) });
export const placementExtendSchema = z.object({ id: uuid, newPlannedEnd: isoDate, notes: optionalText(1000) });
export const placementCancelSchema = z.object({
  id: uuid,
  reason: z.enum(["candidate_withdrew", "customer_cancelled", "failed_start", "performance", "compliance", "other"]),
  notes: optionalText(1000),
});
export const placementReplaceSchema = z.object({
  id: uuid,
  replacementSubmissionId: uuid,
  plannedStart: isoDate,
  reason: z.enum(["candidate_withdrew", "customer_cancelled", "failed_start", "performance", "compliance", "other"]),
  notes: optionalText(1000),
});
export const placementChecklistSchema = z.object({ id: uuid, key: z.string().trim().min(1).max(60), done: z.boolean() });
