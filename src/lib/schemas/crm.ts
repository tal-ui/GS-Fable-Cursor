import { z } from "zod";
import { currency, optionalCountry, optionalEmail, optionalNumber, optionalPhone, optionalText, optionalUuid, requiredText, uuid } from "./common";

export const accountType = z.enum(["employer", "agency_partner", "government", "subcontractor", "vendor", "other"]);
export const accountStatus = z.enum(["prospect", "active", "inactive", "blocked"]);

export const accountSchema = z.object({
  name: requiredText("Account name", 160),
  type: accountType.default("employer"),
  status: accountStatus.default("prospect"),
  industry: optionalText(80),
  website: optionalText(200),
  country: optionalCountry,
  city: optionalText(80),
  addressLine: optionalText(200),
  ownerId: optionalUuid,
  currency: currency.default("USD"),
  paymentTermsDays: optionalNumber,
  commercialTerms: optionalText(8000),
  notes: optionalText(4000),
  externalRef: optionalText(80),
});

export const accountPatchSchema = accountSchema.partial().extend({ id: uuid });

export const contactSchema = z.object({
  id: optionalUuid,
  accountId: uuid,
  firstName: requiredText("First name", 80),
  lastName: requiredText("Last name", 80),
  email: optionalEmail,
  phone: optionalPhone,
  title: optionalText(120),
  isPrimary: z.boolean().default(false),
  receivesShortlists: z.boolean().default(false),
  notes: optionalText(2000),
});

export const sourceSchema = z.object({
  id: optionalUuid,
  name: requiredText("Source name", 120),
  type: z.enum(["agency", "referral", "job_board", "website", "social", "import", "walk_in", "partner", "other"]).default("other"),
  contactName: optionalText(120),
  contactEmail: optionalEmail,
  contactPhone: optionalPhone,
  commissionTerms: optionalText(2000),
  isActive: z.boolean().default(true),
});

export const activityNoteSchema = z.object({
  type: z.enum(["note", "call", "email", "whatsapp", "meeting"]).default("note"),
  subject: requiredText("Subject", 200),
  body: optionalText(8000),
  candidateId: optionalUuid,
  accountId: optionalUuid,
  contactId: optionalUuid,
  requisitionId: optionalUuid,
  submissionId: optionalUuid,
  placementId: optionalUuid,
});
