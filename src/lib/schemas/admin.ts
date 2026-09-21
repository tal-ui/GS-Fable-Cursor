import { z } from "zod";
import { optionalNumber, optionalText, optionalUuid, priority, requiredText, uuid } from "./common";

export const userRole = z.enum(["super_admin", "standard", "read_only"]);
export const userStatus = z.enum(["pending", "active", "deactivated"]);

export const userAdminSchema = z.object({
  id: uuid,
  role: userRole.optional(),
  status: userStatus.optional(),
  canVerify: z.boolean().optional(),
  jobTitle: optionalText(80),
});

export const inviteUserSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  name: requiredText("Name", 120),
  role: userRole.default("standard"),
  canVerify: z.boolean().default(false),
  jobTitle: optionalText(80),
});

export const skillCategorySchema = z.object({ id: optionalUuid, name: requiredText("Category name", 80), description: optionalText(300), sortOrder: z.coerce.number().int().default(0) });

export const skillSchema = z.object({
  id: optionalUuid,
  code: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_.-]+$/, "Use lowercase letters, digits, dots, dashes or underscores")
    .transform((v) => v.toLowerCase()),
  name: requiredText("Skill name", 120),
  categoryId: uuid,
  description: optionalText(500),
  ownerId: optionalUuid,
  isActive: z.boolean().default(true),
  defaultValidityMonths: optionalNumber,
  synonyms: z.union([z.array(z.string()), z.string()]).transform((v) => (Array.isArray(v) ? v : v.split(/[,;\n]/)).map((s) => s.trim().toLowerCase()).filter(Boolean)).default([]),
});

export const roleFamilySchema = z.object({
  id: optionalUuid,
  code: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_.-]+$/, "Use lowercase letters, digits, dots, dashes or underscores")
    .transform((v) => v.toLowerCase()),
  name: requiredText("Role family name", 120),
  description: optionalText(500),
  rankingVersion: z.string().trim().min(1).max(40).default("baseline-v1"),
  weights: z.object({
    skills: z.coerce.number().min(0).max(1),
    proficiency: z.coerce.number().min(0).max(1),
    experience: z.coerce.number().min(0).max(1),
    preferences: z.coerce.number().min(0).max(1),
    freshness: z.coerce.number().min(0).max(1),
  }),
  isActive: z.boolean().default(true),
});

export const automationRuleSchema = z.object({
  id: optionalUuid,
  name: requiredText("Rule name", 120),
  description: optionalText(500),
  trigger: z.enum(["submission_stage_changed", "placement_status_changed", "message_failed", "task_overdue", "candidate_created", "requisition_created", "verification_changed", "schedule_daily"]),
  conditions: z
    .array(z.object({ field: z.string().trim().min(1), operator: z.enum(["equals", "not_equals", "gte", "lte", "in"]), value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]) }))
    .default([]),
  action: z.enum(["create_task", "notify_owner", "queue_message", "update_candidate_status"]),
  actionConfig: z
    .object({
      taskType: z.string().optional(),
      title: z.string().max(200).optional(),
      dueInHours: z.coerce.number().min(1).max(24 * 60).optional(),
      priority: priority.optional(),
      templateName: z.string().optional(),
      candidateStatus: z.string().optional(),
      notificationTitle: z.string().max(200).optional(),
    })
    .default({}),
  isActive: z.boolean().default(true),
});

export const messageTemplateSchema = z.object({
  id: optionalUuid,
  name: requiredText("Template name", 80),
  channel: z.enum(["whatsapp", "email", "sms", "manual"]),
  language: z.string().trim().length(2).default("en"),
  providerTemplateId: optionalText(120),
  subject: optionalText(200),
  body: requiredText("Body", 4000),
  status: z.enum(["draft", "approved", "rejected"]).default("draft"),
  category: optionalText(60),
});

export const settingSchema = z.object({ key: z.string().trim().min(1), value: z.unknown() });
