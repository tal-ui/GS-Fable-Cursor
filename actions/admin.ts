"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { uuid } from "@/lib/schemas/common";
import { automationRuleSchema, inviteUserSchema, messageTemplateSchema, roleFamilySchema, skillCategorySchema, skillSchema, userAdminSchema } from "@/lib/schemas/admin";
import * as admin from "@/server/admin";
import { restoreRecord } from "@/server/archive";
import { anonymizeCandidate, setRetentionHold } from "@/server/retention";
import { DEFAULT_SETTINGS, setSetting, type AppSettingsShape } from "@/server/settings";
import { validation } from "@/lib/errors";
import { isoDate, optionalText } from "@/lib/schemas/common";

export const updateUserAction = defineAction({ permission: "admin", resource: "user", schema: userAdminSchema }, async (input, user) => {
  const row = await admin.updateUserAdmin(user, input);
  revalidatePath("/admin/users");
  return { id: row.id, role: row.role, status: row.status };
});

export const inviteUserAction = defineAction({ permission: "admin", resource: "user", schema: inviteUserSchema }, async (input, user) => {
  const row = await admin.inviteUser(user, input);
  revalidatePath("/admin/users");
  return { id: row.id };
});

export const upsertSkillCategoryAction = defineAction({ permission: "admin", resource: "skill_category", schema: skillCategorySchema }, async (input, user) => {
  const row = await admin.upsertSkillCategory(user, input);
  revalidatePath("/admin/taxonomy");
  return { id: row.id };
});

export const upsertSkillAction = defineAction({ permission: "admin", resource: "skill", schema: skillSchema }, async (input, user) => {
  const row = await admin.upsertSkill(user, input);
  revalidatePath("/admin/taxonomy");
  return { id: row.id };
});

export const upsertRoleFamilyAction = defineAction({ permission: "admin", resource: "role_family", schema: roleFamilySchema }, async (input, user) => {
  const row = await admin.upsertRoleFamily(user, input);
  revalidatePath("/admin/taxonomy");
  revalidatePath("/requisitions");
  return { id: row.id };
});

export const upsertAutomationRuleAction = defineAction({ permission: "admin", resource: "automation_rule", schema: automationRuleSchema }, async (input, user) => {
  const row = await admin.upsertAutomationRule(user, input);
  revalidatePath("/admin/automations");
  return { id: row.id };
});

export const deleteAutomationRuleAction = defineAction({ permission: "admin", resource: "automation_rule", schema: z.object({ id: uuid }) }, async ({ id }, user) => {
  await admin.deleteAutomationRule(user, id);
  revalidatePath("/admin/automations");
});

export const upsertTemplateAction = defineAction({ permission: "admin", resource: "message_template", schema: messageTemplateSchema }, async (input, user) => {
  const row = await admin.upsertTemplate(user, input);
  revalidatePath("/admin/templates");
  return { id: row.id };
});

export const deleteTemplateAction = defineAction({ permission: "admin", resource: "message_template", schema: z.object({ id: uuid }) }, async ({ id }, user) => {
  await admin.deleteTemplate(user, id);
  revalidatePath("/admin/templates");
});

export const retryJobAction = defineAction({ permission: "admin", resource: "job", schema: z.object({ id: uuid }) }, async ({ id }, user) => {
  await admin.retryJob(user, id);
  revalidatePath("/admin/jobs");
  revalidatePath("/work-queue");
});

export const setRetentionHoldAction = defineAction(
  { permission: "admin", resource: "retention_hold", schema: z.object({ candidateId: uuid, reason: optionalText(300), until: z.union([isoDate, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)) }) },
  async (input, user) => {
    const result = await setRetentionHold(user, input);
    revalidatePath("/admin/retention");
    revalidatePath(`/candidates/${input.candidateId}`);
    return result;
  },
);

export const eraseCandidateAction = defineAction(
  { permission: "admin", resource: "retention_erasure", schema: z.object({ candidateId: uuid, note: optionalText(500), confirmation: z.literal("ERASE", { message: "Type ERASE to confirm" }) }) },
  async ({ candidateId, note }, user) => {
    const result = await anonymizeCandidate(user, candidateId, note);
    revalidatePath("/admin/retention");
    revalidatePath("/candidates");
    revalidatePath("/work-queue");
    return result;
  },
);

const settingValueSchema = z.object({ key: z.string().trim().min(1), value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]) });

export const updateSettingAction = defineAction({ permission: "admin", resource: "setting", schema: settingValueSchema }, async ({ key, value }, user) => {
  if (!(key in DEFAULT_SETTINGS)) throw validation("Unknown setting.");
  const k = key as keyof AppSettingsShape;
  const current = DEFAULT_SETTINGS[k];
  let coerced: unknown = value;
  if (typeof current === "number") {
    coerced = Number(value);
    if (!Number.isFinite(coerced as number) || (coerced as number) < 0) throw validation("Enter a positive number.");
  } else if (Array.isArray(current)) {
    coerced = Array.isArray(value) ? value : String(value).split(",").map((s) => s.trim()).filter(Boolean);
  } else if (k === "sharing_model") {
    if (value !== "team" && value !== "owner") throw validation("Sharing model must be 'team' or 'owner'.");
  }
  await setSetting(k, coerced as AppSettingsShape[typeof k], user.id);
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
});

export const restoreRecordAction = defineAction(
  { permission: "admin", resource: "archive_restore", schema: z.object({ entityType: z.enum(["candidate", "account"]), id: uuid }) },
  async (input, user) => {
    const result = await restoreRecord(user, input);
    revalidatePath("/admin/archived");
    revalidatePath(input.entityType === "candidate" ? "/candidates" : "/accounts");
    revalidatePath(`/${input.entityType === "candidate" ? "candidates" : "accounts"}/${input.id}`);
    return result;
  },
);
