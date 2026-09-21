import "server-only";
import { and, asc, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@/db/client";
import {
  aiAuditLog,
  auditLog,
  automationRules,
  automationRuns,
  integrationErrorLog,
  jobs,
  messageTemplates,
  roleFamilies,
  securityAuditLog,
  skillCategories,
  skillSynonyms,
  skills,
  users,
  webhookEvents,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { AppError, conflict, notFound, validation } from "@/lib/errors";
import { cleanText, normalizeEmail } from "@/lib/sanitize";
import type { automationRuleSchema, inviteUserSchema, messageTemplateSchema, roleFamilySchema, skillCategorySchema, skillSchema, userAdminSchema } from "@/lib/schemas/admin";
import { logActivity } from "../activities";
import { retryDeadJob } from "../jobs/queue";
import { notifyUser } from "../notifications";

// ---------- Users ----------

export async function listUsers() {
  const db = await getDb();
  return db.select().from(users).where(eq(users.isDeleted, false)).orderBy(asc(users.status), asc(users.name));
}

export async function activeUsers() {
  const db = await getDb();
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, canVerify: users.canVerify, avatarUrl: users.avatarUrl }).from(users).where(and(eq(users.isDeleted, false), eq(users.status, "active"))).orderBy(asc(users.name));
}

export async function updateUserAdmin(admin: CurrentUser, input: z.output<typeof userAdminSchema>) {
  const db = await getDb();
  const before = await db.query.users.findFirst({ where: and(eq(users.id, input.id), eq(users.isDeleted, false)) });
  if (!before) throw notFound("User");
  const patch: Partial<typeof users.$inferInsert> = {};
  if (input.role !== undefined) patch.role = input.role;
  if (input.status !== undefined) {
    patch.status = input.status;
    if (input.status === "active" && !before.activatedAt) patch.activatedAt = new Date();
  }
  if (input.canVerify !== undefined) patch.canVerify = input.canVerify;
  if (input.jobTitle !== undefined) patch.jobTitle = input.jobTitle;
  // A Super Admin can never lock themselves out of the application.
  if (before.id === admin.id) {
    if (patch.role && patch.role !== "super_admin") throw conflict("You cannot remove your own Super Admin role.");
    if (patch.status && patch.status !== "active") throw conflict("You cannot deactivate your own account.");
  }
  if ((patch.role && patch.role !== "super_admin" && before.role === "super_admin") || (patch.status && patch.status !== "active" && before.role === "super_admin" && before.status === "active")) {
    const [{ n }] = await db.select({ n: count() }).from(users).where(and(eq(users.role, "super_admin"), eq(users.status, "active"), eq(users.isDeleted, false)));
    if (n <= 1) throw conflict("At least one active Super Admin must remain.");
  }
  const [after] = await db.update(users).set(patch).where(eq(users.id, input.id)).returning();
  await recordAudit(db, { entityType: "user", entityId: input.id, action: patch.role && patch.role !== before.role ? "role_change" : "update", actorId: admin.id, before: { role: before.role, status: before.status, canVerify: before.canVerify }, after: patch as Record<string, unknown> });
  if (patch.status === "active" && before.status !== "active") {
    await notifyUser(db, { userId: input.id, type: "system", title: "Your account has been activated", body: `Role: ${after!.role.replace(/_/g, " ")}`, link: "/" });
  }
  return after!;
}

/** Pre-provisions a user so their first Google sign-in lands with the right role instead of pending. */
export async function inviteUser(admin: CurrentUser, input: z.output<typeof inviteUserSchema>) {
  const db = await getDb();
  const email = normalizeEmail(input.email)!;
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) throw conflict("A user with that email already exists.");
  const [row] = await db
    .insert(users)
    .values({ email, name: cleanText(input.name)!, role: input.role, status: "active", canVerify: input.canVerify, jobTitle: input.jobTitle, activatedAt: new Date(), createdBy: admin.id })
    .returning();
  await recordAudit(db, { entityType: "user", entityId: row!.id, action: "create", actorId: admin.id, after: { email, role: input.role } });
  return row!;
}

// ---------- Taxonomy ----------

export async function listTaxonomy() {
  const db = await getDb();
  const [categories, skillRows, synonyms, families] = await Promise.all([
    db.select().from(skillCategories).where(eq(skillCategories.isDeleted, false)).orderBy(asc(skillCategories.sortOrder), asc(skillCategories.name)),
    db
      .select({ skill: skills, categoryName: skillCategories.name, ownerName: users.name, claimCount: sql<number>`(select count(*)::int from candidate_skill_claims k where k.skill_id = ${skills.id} and k.is_deleted = false)` })
      .from(skills)
      .innerJoin(skillCategories, eq(skillCategories.id, skills.categoryId))
      .leftJoin(users, eq(users.id, skills.ownerId))
      .where(eq(skills.isDeleted, false))
      .orderBy(asc(skillCategories.sortOrder), asc(skills.name)),
    db.select().from(skillSynonyms).where(eq(skillSynonyms.isDeleted, false)),
    db.select().from(roleFamilies).where(eq(roleFamilies.isDeleted, false)).orderBy(asc(roleFamilies.name)),
  ]);
  const synonymsBySkill = new Map<string, string[]>();
  for (const s of synonyms) synonymsBySkill.set(s.skillId, [...(synonymsBySkill.get(s.skillId) ?? []), s.term]);
  return { categories, skills: skillRows.map((r) => ({ ...r, synonyms: synonymsBySkill.get(r.skill.id) ?? [] })), roleFamilies: families };
}

export async function skillOptions(q: string, limit = 15) {
  const db = await getDb();
  const like = `%${q.trim().toLowerCase()}%`;
  return db
    .select({ id: skills.id, label: skills.name, sub: skillCategories.name, code: skills.code })
    .from(skills)
    .innerJoin(skillCategories, eq(skillCategories.id, skills.categoryId))
    .where(and(eq(skills.isDeleted, false), eq(skills.isActive, true), q ? sql`(lower(${skills.name}) like ${like} or ${skills.code} like ${like} or exists (select 1 from ${skillSynonyms} y where y.skill_id = ${skills.id} and y.term like ${like}))` : undefined))
    .orderBy(asc(skills.name))
    .limit(limit);
}

export async function upsertSkillCategory(admin: CurrentUser, input: z.output<typeof skillCategorySchema>) {
  const db = await getDb();
  const values = { name: cleanText(input.name)!, description: cleanText(input.description), sortOrder: input.sortOrder };
  if (input.id) {
    const [row] = await db.update(skillCategories).set(values).where(eq(skillCategories.id, input.id)).returning();
    if (!row) throw notFound("Category");
    return row;
  }
  const [row] = await db.insert(skillCategories).values({ ...values, createdBy: admin.id }).returning();
  return row!;
}

export async function upsertSkill(admin: CurrentUser, input: z.output<typeof skillSchema>) {
  const db = await getDb();
  const values = {
    code: input.code,
    name: cleanText(input.name)!,
    categoryId: input.categoryId,
    description: cleanText(input.description),
    ownerId: input.ownerId,
    isActive: input.isActive,
    defaultValidityMonths: input.defaultValidityMonths === null ? null : Math.round(input.defaultValidityMonths),
  };
  return db.transaction(async (tx) => {
    let row: typeof skills.$inferSelect;
    if (input.id) {
      const existing = await tx.query.skills.findFirst({ where: eq(skills.id, input.id) });
      if (!existing) throw notFound("Skill");
      // The code is a stable identifier used by imports and rules; it never changes once published.
      const [updated] = await tx.update(skills).set({ ...values, code: existing.code }).where(eq(skills.id, input.id)).returning();
      row = updated!;
    } else {
      const dup = await tx.query.skills.findFirst({ where: eq(skills.code, input.code) });
      if (dup) throw validation("That skill code is already in use.", { code: "Already in use" });
      const [created] = await tx.insert(skills).values({ ...values, createdBy: admin.id }).returning();
      row = created!;
    }
    await tx.delete(skillSynonyms).where(eq(skillSynonyms.skillId, row.id));
    if (input.synonyms.length) {
      await tx.insert(skillSynonyms).values([...new Set(input.synonyms)].map((term) => ({ skillId: row.id, term, createdBy: admin.id }))).onConflictDoNothing();
    }
    await recordAudit(tx, { entityType: "skill", entityId: row.id, action: input.id ? "update" : "create", actorId: admin.id, after: { ...values, synonyms: input.synonyms } });
    return row;
  });
}

export async function upsertRoleFamily(admin: CurrentUser, input: z.output<typeof roleFamilySchema>) {
  const db = await getDb();
  const total = Object.values(input.weights).reduce((s, x) => s + x, 0);
  if (Math.abs(total - 1) > 0.01) throw validation("Ranking weights must add up to 1.0 so scores stay comparable.", { weights: `Currently ${total.toFixed(2)}` });
  const values = { code: input.code, name: cleanText(input.name)!, description: cleanText(input.description), rankingWeights: input.weights, rankingVersion: input.rankingVersion, isActive: input.isActive };
  if (input.id) {
    const existing = await db.query.roleFamilies.findFirst({ where: eq(roleFamilies.id, input.id) });
    if (!existing) throw notFound("Role family");
    const weightsChanged = JSON.stringify(existing.rankingWeights) !== JSON.stringify(input.weights);
    const version = weightsChanged && existing.rankingVersion === input.rankingVersion ? bumpVersion(existing.rankingVersion) : input.rankingVersion;
    const [row] = await db.update(roleFamilies).set({ ...values, code: existing.code, rankingVersion: version }).where(eq(roleFamilies.id, input.id)).returning();
    await recordAudit(db, { entityType: "role_family", entityId: input.id, action: "update", actorId: admin.id, before: { weights: existing.rankingWeights, version: existing.rankingVersion }, after: { weights: input.weights, version } });
    return row!;
  }
  const [row] = await db.insert(roleFamilies).values({ ...values, createdBy: admin.id }).returning();
  await recordAudit(db, { entityType: "role_family", entityId: row!.id, action: "create", actorId: admin.id, after: values });
  return row!;
}

function bumpVersion(v: string): string {
  const m = v.match(/^(.*?)(\d+)$/);
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${v}-2`;
}

// ---------- Automations ----------

export async function listAutomationRules() {
  const db = await getDb();
  // Single-table select: wrap the outer column so Drizzle keeps it qualified inside the correlated subqueries.
  const ruleId = sql`${automationRules.id}`;
  return db
    .select({
      rule: automationRules,
      runs: sql<number>`(select count(*)::int from ${automationRuns} r where r.rule_id = ${ruleId})`,
      failures: sql<number>`(select count(*)::int from ${automationRuns} r where r.rule_id = ${ruleId} and r.status = 'failed')`,
      lastRunAt: sql<Date | null>`(select max(r.created_at) from ${automationRuns} r where r.rule_id = ${ruleId})`,
    })
    .from(automationRules)
    .where(eq(automationRules.isDeleted, false))
    .orderBy(asc(automationRules.trigger), asc(automationRules.name));
}

export async function upsertAutomationRule(admin: CurrentUser, input: z.output<typeof automationRuleSchema>) {
  const db = await getDb();
  if (input.action === "queue_message" && !input.actionConfig.templateName) throw validation("Choose a message template for this action.", { "actionConfig.templateName": "Required" });
  if (input.action === "update_candidate_status" && !input.actionConfig.candidateStatus) throw validation("Choose the candidate status to set.", { "actionConfig.candidateStatus": "Required" });
  const values = {
    name: cleanText(input.name)!,
    description: cleanText(input.description),
    trigger: input.trigger,
    conditions: input.conditions,
    action: input.action,
    actionConfig: input.actionConfig,
    isActive: input.isActive,
  };
  if (input.id) {
    const [row] = await db.update(automationRules).set(values).where(eq(automationRules.id, input.id)).returning();
    if (!row) throw notFound("Automation rule");
    await recordAudit(db, { entityType: "automation_rule", entityId: row.id, action: "update", actorId: admin.id, after: values as Record<string, unknown> });
    return row;
  }
  const [row] = await db.insert(automationRules).values({ ...values, createdBy: admin.id }).returning();
  await recordAudit(db, { entityType: "automation_rule", entityId: row!.id, action: "create", actorId: admin.id, after: values as Record<string, unknown> });
  return row!;
}

export async function deleteAutomationRule(admin: CurrentUser, id: string) {
  const db = await getDb();
  const rule = await db.query.automationRules.findFirst({ where: eq(automationRules.id, id) });
  if (!rule) throw notFound("Automation rule");
  if (rule.isSystem) throw new AppError("conflict", "System rules cannot be deleted; deactivate them instead.");
  await db.update(automationRules).set({ isDeleted: true, isActive: false }).where(eq(automationRules.id, id));
  await recordAudit(db, { entityType: "automation_rule", entityId: id, action: "delete", actorId: admin.id });
}

export async function recentAutomationRuns(limit = 50) {
  const db = await getDb();
  return db
    .select({ run: automationRuns, ruleName: automationRules.name })
    .from(automationRuns)
    .innerJoin(automationRules, eq(automationRules.id, automationRuns.ruleId))
    .orderBy(desc(automationRuns.createdAt))
    .limit(limit);
}

// ---------- Templates ----------

export async function listTemplates() {
  const db = await getDb();
  return db.select().from(messageTemplates).where(eq(messageTemplates.isDeleted, false)).orderBy(asc(messageTemplates.name), asc(messageTemplates.channel));
}

export async function upsertTemplate(admin: CurrentUser, input: z.output<typeof messageTemplateSchema>) {
  const db = await getDb();
  const variables = [...new Set([...input.body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!))];
  if (input.channel === "whatsapp" && input.status === "approved" && !input.providerTemplateId) {
    throw validation("Approved WhatsApp templates need the provider template ID (business-initiated messages must use an approved template).", { providerTemplateId: "Required for approved WhatsApp templates" });
  }
  const values = {
    name: cleanText(input.name)!,
    channel: input.channel,
    language: input.language.toLowerCase(),
    providerTemplateId: cleanText(input.providerTemplateId),
    subject: cleanText(input.subject),
    body: input.body,
    variables,
    status: input.status,
    category: cleanText(input.category),
  };
  if (input.id) {
    const [row] = await db.update(messageTemplates).set(values).where(eq(messageTemplates.id, input.id)).returning();
    if (!row) throw notFound("Template");
    await recordAudit(db, { entityType: "message_template", entityId: row.id, action: "update", actorId: admin.id, after: { status: values.status, channel: values.channel } });
    return row;
  }
  const [row] = await db.insert(messageTemplates).values({ ...values, createdBy: admin.id }).returning();
  await recordAudit(db, { entityType: "message_template", entityId: row!.id, action: "create", actorId: admin.id, after: { status: values.status, channel: values.channel } });
  return row!;
}

export async function deleteTemplate(admin: CurrentUser, id: string) {
  const db = await getDb();
  await db.update(messageTemplates).set({ isDeleted: true }).where(eq(messageTemplates.id, id));
  await recordAudit(db, { entityType: "message_template", entityId: id, action: "delete", actorId: admin.id });
}

// ---------- Logs & jobs ----------

export async function listJobs(statusFilter?: string, limit = 100) {
  const db = await getDb();
  const statuses = statusFilter ? (statusFilter.split(",") as (typeof jobs.$inferSelect.status)[]) : undefined;
  return db
    .select()
    .from(jobs)
    .where(statuses ? inArray(jobs.status, statuses) : undefined)
    .orderBy(desc(jobs.updatedAt))
    .limit(limit);
}

export async function jobCounts() {
  const db = await getDb();
  const rows = await db.select({ status: jobs.status, n: count() }).from(jobs).groupBy(jobs.status);
  const out: Record<string, number> = { queued: 0, running: 0, succeeded: 0, failed: 0, dead: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export async function retryJob(admin: CurrentUser, id: string) {
  const db = await getDb();
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, id) });
  if (!job) throw notFound("Job");
  if (job.status !== "dead" && job.status !== "failed") throw conflict("Only dead or failed jobs can be retried.");
  await retryDeadJob(id);
  await recordAudit(db, { entityType: "job", entityId: id, action: "update", actorId: admin.id, note: "Manual retry" });
  await logActivity(db, { type: "system", subject: `Job ${job.type} retried by ${admin.name}`, actorId: admin.id });
}

export async function securityLog(limit = 200) {
  const db = await getDb();
  return db.select({ log: securityAuditLog, userName: users.name, userEmail: users.email }).from(securityAuditLog).leftJoin(users, eq(users.id, securityAuditLog.userId)).orderBy(desc(securityAuditLog.createdAt)).limit(limit);
}

export async function changeLog(limit = 200, entityType?: string, entityId?: string) {
  const db = await getDb();
  return db
    .select({ log: auditLog, actorName: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(and(entityType ? eq(auditLog.entityType, entityType) : undefined, entityId ? eq(auditLog.entityId, entityId) : undefined))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function aiLog(limit = 100) {
  const db = await getDb();
  return db.select().from(aiAuditLog).orderBy(desc(aiAuditLog.createdAt)).limit(limit);
}

export async function integrationErrors(limit = 100) {
  const db = await getDb();
  return db.select().from(integrationErrorLog).orderBy(desc(integrationErrorLog.createdAt)).limit(limit);
}

export async function webhookLog(limit = 100) {
  const db = await getDb();
  return db.select().from(webhookEvents).orderBy(desc(webhookEvents.createdAt)).limit(limit);
}

export async function adminOverview() {
  const db = await getDb();
  const d7 = new Date(Date.now() - 7 * 86_400_000);
  const [[pending], [activeU], jobsByStatus, [denied], [aiCalls], [integErr]] = await Promise.all([
    db.select({ n: count() }).from(users).where(and(eq(users.status, "pending"), eq(users.isDeleted, false))),
    db.select({ n: count() }).from(users).where(and(eq(users.status, "active"), eq(users.isDeleted, false))),
    jobCounts(),
    db.select({ n: count() }).from(securityAuditLog).where(and(eq(securityAuditLog.statusCode, 403), gte(securityAuditLog.createdAt, d7))),
    db.select({ n: count() }).from(aiAuditLog).where(gte(aiAuditLog.createdAt, d7)),
    db.select({ n: count() }).from(integrationErrorLog).where(gte(integrationErrorLog.createdAt, d7)),
  ]);
  return { pendingUsers: pending?.n ?? 0, activeUsers: activeU?.n ?? 0, jobs: jobsByStatus, denied7d: denied?.n ?? 0, aiCalls7d: aiCalls?.n ?? 0, integrationErrors7d: integErr?.n ?? 0 };
}
