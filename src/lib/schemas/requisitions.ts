import { z } from "zod";
import { countryCode, optionalCurrency, optionalDate, optionalNumber, optionalPayPeriod, optionalText, optionalUuid, priority, requiredText, uuid } from "./common";

export const requisitionStatus = z.enum(["draft", "open", "on_hold", "filled", "closed", "cancelled"]);
export const requirementField = z.enum([
  "skill",
  "language",
  "work_authorization",
  "citizenship",
  "availability_from",
  "availability_duration_weeks",
  "relocation",
  "compensation_max",
  "experience_years",
  "military_role",
  "certification",
  "location_country",
]);
export const requirementOperator = z.enum(["equals", "not_equals", "gte", "lte", "in", "not_in", "contains", "before", "after", "exists"]);
export const evidenceRequirement = z.enum(["none", "declared", "verified"]);

export const requirementSchema = z
  .object({
    id: optionalUuid,
    kind: z.enum(["mandatory", "preferred"]),
    field: requirementField,
    operator: requirementOperator,
    /** Free-form value; validated per field by the engine's validateRequirements. */
    value: z.unknown().optional(),
    skillId: optionalUuid,
    evidenceRequirement: evidenceRequirement.default("declared"),
    justification: optionalText(500),
    weight: z.coerce.number().min(0).max(10).default(1),
    sortOrder: z.coerce.number().int().default(0),
  })
  .superRefine((r, ctx) => {
    if (r.kind === "mandatory" && !r.justification) {
      ctx.addIssue({ code: "custom", path: ["justification"], message: "Mandatory rules need a business justification" });
    }
    if ((r.field === "skill" || r.field === "certification") && !r.skillId) {
      ctx.addIssue({ code: "custom", path: ["skillId"], message: "Choose a skill from the taxonomy" });
    }
    // Mirrors validateRequirements in the matching engine: these fields fall back to requisition context.
    const valueOptional = ["work_authorization", "availability_from", "relocation"].includes(r.field) || r.operator === "exists";
    if (!valueOptional && (r.value === undefined || r.value === null || r.value === "")) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "A value is required for this operator" });
    }
  });

export const requisitionSchema = z.object({
  accountId: uuid,
  contactId: optionalUuid,
  roleFamilyId: optionalUuid,
  title: requiredText("Title", 160),
  description: optionalText(8000),
  locationCountry: countryCode,
  locationCity: optionalText(80),
  siteName: optionalText(120),
  startDate: optionalDate,
  endDate: optionalDate,
  durationWeeks: optionalNumber,
  headcountApproved: z.coerce.number().int().min(1, "At least one seat").max(500).default(1),
  status: requisitionStatus.default("draft"),
  priority: priority.default("medium"),
  ownerId: optionalUuid,
  billRateAmount: optionalNumber,
  billRateCurrency: optionalCurrency,
  billRatePeriod: optionalPayPeriod,
  payRateAmount: optionalNumber,
  payRateCurrency: optionalCurrency,
  payRatePeriod: optionalPayPeriod,
  externalRef: optionalText(80),
});

export const requisitionPatchSchema = requisitionSchema.partial().extend({ id: uuid });

export const requirementsVersionSchema = z.object({
  requisitionId: uuid,
  changeSummary: optionalText(300),
  requirements: z.array(requirementSchema).max(50),
});

export const requisitionStatusSchema = z.object({
  id: uuid,
  status: requisitionStatus,
  closeReason: optionalText(300),
});

export type RequirementInput = z.input<typeof requirementSchema>;
