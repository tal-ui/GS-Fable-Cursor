import { z } from "zod";

/**
 * Optional-field helpers accept what forms actually send ("" from an empty input, null, or the key
 * missing entirely) and normalise to `null` so the database layer never sees empty strings.
 * They are `.optional()` so the key itself is optional in `z.input`, which keeps form and action types aligned.
 */
export const uuid = z.string().uuid("Invalid identifier");
export const optionalUuid = z.union([uuid, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker (YYYY-MM-DD)");
export const optionalDate = z.union([isoDate, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
export const optionalText = (max = 500) => z.union([z.string().trim().max(max), z.null()]).optional().transform((v) => (v ? v : null));
export const requiredText = (label: string, max = 200) => z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);
export const countryCode = z.string().trim().length(2, "Use a 2-letter country code").transform((v) => v.toUpperCase());
export const optionalCountry = z.union([countryCode, z.literal(""), z.null()]).optional().transform((v) => (v ? v.toUpperCase() : null));
export const currency = z.string().trim().length(3, "Use a 3-letter currency code").transform((v) => v.toUpperCase());
export const optionalCurrency = z.union([currency, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
export const money = z.coerce.number().nonnegative("Amount must be positive").max(1_000_000_000);
// Empty values must be normalised before coercion: Number(null) and Number("") are both 0, which would silently store a zero.
const emptyToNull = (v: unknown) => (v === "" || v === null || v === undefined ? null : v);
export const optionalNumber = z
  .preprocess(emptyToNull, z.coerce.number().nullable())
  .optional()
  .transform((v) => (v === undefined || v === null || Number.isNaN(v) ? null : v));
export const optionalBool = z.union([z.boolean(), z.literal("true"), z.literal("false"), z.null()]).optional().transform((v) => (v === undefined || v === null ? null : v === true || v === "true"));
export const email = z.string().trim().email("Enter a valid email");
export const optionalEmail = z.union([email, z.literal(""), z.null()]).optional().transform((v) => (v ? v.toLowerCase() : null));
export const phone = z.string().trim().min(6, "Enter a valid phone number").max(30);
export const optionalPhone = z.union([phone, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
export const csvList = z.union([z.array(z.string()), z.string()]).transform((v) => (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim().toUpperCase()).filter(Boolean));

export const payPeriod = z.enum(["hourly", "daily", "weekly", "monthly", "annual"]);
export const optionalPayPeriod = z.union([payPeriod, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
export const grossNet = z.enum(["gross", "net"]);
export const proficiency = z.enum(["basic", "intermediate", "advanced", "expert"]);
export const languageProficiency = z.enum(["basic", "conversational", "professional", "fluent", "native"]);
export const verificationDecision = z.enum(["verified", "rejected", "pending_review"]);
export const priority = z.enum(["low", "medium", "high", "urgent"]);
