import { z } from "zod";
import {
  countryCode,
  currency,
  payPeriod,
  csvList,
  optionalCurrency,
  grossNet,
  isoDate,
  languageProficiency,
  money,
  optionalBool,
  optionalCountry,
  optionalDate,
  optionalEmail,
  optionalNumber,
  optionalPhone,
  optionalText,
  optionalUuid,
  optionalPayPeriod,
  proficiency,
  requiredText,
  uuid,
  verificationDecision,
} from "./common";

export const candidateStatus = z.enum(["new", "screening", "active", "placed", "unavailable", "withdrawn", "archived"]);

export const candidateCoreSchema = z.object({
  firstName: requiredText("First name", 80),
  lastName: requiredText("Last name", 80),
  email: optionalEmail,
  phone: optionalPhone,
  city: optionalText(80),
  country: optionalCountry,
  dateOfBirth: optionalDate,
  headline: optionalText(160),
  summary: optionalText(4000),
  status: candidateStatus.default("new"),
  ownerId: optionalUuid,
  primarySourceId: optionalUuid,
  citizenships: csvList.default([]),
  passportCountry: optionalCountry,
  passportExpiry: optionalDate,
  militaryRole: optionalText(120),
  militaryUnit: optionalText(120),
  militaryRank: optionalText(60),
  militaryServiceStart: optionalDate,
  militaryServiceEnd: optionalDate,
  yearsExperience: optionalNumber,
  willingToRelocate: optionalBool,
  relocationConstraints: optionalText(500),
  preferredCountries: csvList.default([]),
  externalRef: optionalText(80),
});

export const intakeSchema = candidateCoreSchema.extend({
  processingConsent: z.literal(true, { error: "Permission to process the profile is required" }),
  communicationConsent: z.boolean().default(false),
  consentChannel: z.enum(["web_form", "whatsapp", "email", "phone", "paper", "import"]).default("web_form"),
  noticeVersion: z.string().trim().min(1).default("privacy-notice-v1"),
  referrerName: optionalText(120),
  availableFrom: optionalDate,
  availableUntil: optionalDate,
  minDurationWeeks: optionalNumber,
  maxDurationWeeks: optionalNumber,
  rotationPreference: z.enum(["no_preference", "short_rotation", "long_rotation", "fixed_term", "permanent"]).default("no_preference"),
  expectedAmount: optionalNumber,
  expectedCurrency: optionalCurrency,
  expectedPeriod: optionalPayPeriod,
  expectedGrossNet: grossNet.default("gross"),
  forceCreate: z.boolean().default(false),
});

export const candidatePatchSchema = candidateCoreSchema.partial().extend({ id: uuid });

export const skillClaimSchema = z.object({
  id: optionalUuid,
  candidateId: uuid,
  skillId: uuid,
  originalWording: optionalText(200),
  declaredProficiency: proficiency.default("intermediate"),
  yearsExperience: optionalNumber,
  lastUsedYear: optionalNumber,
  evidenceNotes: optionalText(500),
  evidenceDocumentId: optionalUuid,
  expiresAt: optionalDate,
});

export const reviewClaimSchema = z.object({
  claimId: uuid,
  decision: verificationDecision,
  evidenceDocumentId: optionalUuid,
  evidenceNotes: optionalText(500),
  expiresAt: optionalDate,
});

export const languageSchema = z.object({
  id: optionalUuid,
  candidateId: uuid,
  language: z.string().trim().length(2, "Use a 2-letter language code").transform((v) => v.toLowerCase()),
  proficiency: languageProficiency,
});

export const workAuthorizationSchema = z.object({
  id: optionalUuid,
  candidateId: uuid,
  country: countryCode,
  type: z.enum(["citizen", "permanent_resident", "work_permit", "visa_sponsorship_required", "none"]),
  validFrom: optionalDate,
  validUntil: optionalDate,
  evidenceDocumentId: optionalUuid,
  notes: optionalText(500),
});

export const reviewWorkAuthSchema = z.object({
  id: uuid,
  decision: verificationDecision,
  evidenceDocumentId: optionalUuid,
  notes: optionalText(500),
});

export const availabilitySchema = z.object({
  candidateId: uuid,
  availableFrom: isoDate,
  availableUntil: optionalDate,
  minDurationWeeks: optionalNumber,
  maxDurationWeeks: optionalNumber,
  rotationPreference: z.enum(["no_preference", "short_rotation", "long_rotation", "fixed_term", "permanent"]).default("no_preference"),
  willingToRelocate: z.boolean().default(true),
  relocationConstraints: optionalText(500),
  confirmedNow: z.boolean().default(true),
  confirmationChannel: optionalText(40),
  notes: optionalText(500),
});

export const confirmAvailabilitySchema = z.object({ candidateId: uuid, channel: z.string().trim().min(1).max(40).default("phone") });

export const compensationSchema = z.object({
  id: optionalUuid,
  candidateId: uuid,
  type: z.enum(["expected", "minimum", "current", "offered"]).default("expected"),
  amount: money,
  currency,
  period: payPeriod,
  grossNet: grossNet.default("gross"),
  effectiveDate: optionalDate,
  notes: optionalText(300),
});

export const consentSchema = z.object({
  candidateId: uuid,
  scope: z.enum(["process_profile", "communicate", "share_with_customer"]),
  accountId: optionalUuid,
  channel: z.enum(["web_form", "whatsapp", "email", "phone", "paper", "import"]).default("phone"),
  noticeVersion: z.string().trim().min(1).max(60).default("privacy-notice-v1"),
  evidence: optionalText(500),
  evidenceDocumentId: optionalUuid,
});

export const withdrawConsentSchema = z.object({ consentId: uuid, reason: optionalText(300) });

export const extractionDecisionSchema = z.object({
  candidateId: uuid,
  index: z.number().int().nonnegative(),
  accept: z.boolean(),
});

export const mergeSchema = z.object({ primaryId: uuid, mergedId: uuid, reason: optionalText(300) });

export type IntakeInput = z.input<typeof intakeSchema>;
