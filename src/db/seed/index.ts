import "server-only";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import {
  aiAuditLog,
  automationRules,
  candidates,
  consents,
  integrationErrorLog,
  jobs,
  messages,
  placements,
  requisitionVersions,
  requisitions,
  securityAuditLog,
  sourceEvents,
  submissionStageHistory,
  submissions,
  users,
  webhookEvents,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { automationRuleSchema, messageTemplateSchema, roleFamilySchema, skillCategorySchema, skillSchema } from "@/lib/schemas/admin";
import { consentSchema, intakeSchema, languageSchema, reviewClaimSchema, reviewWorkAuthSchema, skillClaimSchema, workAuthorizationSchema } from "@/lib/schemas/candidates";
import { accountSchema, contactSchema, sourceSchema } from "@/lib/schemas/crm";
import { createSubmissionSchema, disclosureSchema, interviewOutcomeSchema, interviewSchema, stageChangeSchema } from "@/lib/schemas/pipeline";
import { requirementsVersionSchema, requisitionSchema } from "@/lib/schemas/requisitions";
import { createAccount, upsertContact } from "@/server/accounts";
import { logActivity } from "@/server/activities";
import { upsertAutomationRule, upsertRoleFamily, upsertSkill, upsertSkillCategory, upsertTemplate } from "@/server/admin";
import { createCandidate, grantConsent, reviewSkillClaim, reviewWorkAuthorization, upsertLanguage, upsertSkillClaim, upsertWorkAuthorization, withdrawConsent } from "@/server/candidates/mutations";
import { uploadDocument } from "@/server/documents/service";
import { previewImport, startImport, updateDuplicateDecisions } from "@/server/imports";
import { runPendingJobs } from "@/server/jobs/worker";
import { runDailyMaintenance } from "@/server/maintenance";
import { markMessageFailed, queueTemplateMessage } from "@/server/messaging/outreach";
import { defaultDisclosureFields, discloseCandidate } from "@/server/pipeline/disclosures";
import { recordInterviewOutcome, scheduleInterview } from "@/server/pipeline/interviews";
import { activatePlacement, completePlacement, startPlacement } from "@/server/pipeline/placements";
import { changeStage, confirmInterest, createSubmission, type Stage } from "@/server/pipeline/submissions";
import { changeRequisitionStatus, createRequisition, saveRequirementsVersion } from "@/server/requisitions";
import { setRetentionHold } from "@/server/retention";
import { saveFilter } from "@/server/saved-filters";
import { DEFAULT_SETTINGS, invalidateSettingsCache, setSetting } from "@/server/settings";
import { upsertSource } from "@/server/sources";
import { createTask } from "@/server/tasks";
import {
  ACCOUNTS,
  AUTOMATION_RULES,
  CANDIDATES,
  CATEGORIES,
  IMPORT_CSV,
  MANUAL_TASKS,
  REQUISITIONS,
  ROLE_FAMILIES,
  SAVED_FILTERS,
  SKILLS,
  SOURCES,
  SUBMISSIONS,
  TEMPLATES,
  USERS,
  type AccountKey,
  type StagePath,
  type SubmissionSpec,
  type UserKey,
} from "./data";

const DAY_MS = 86_400_000;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

function isoDay(days: number): string {
  return daysFromNow(days).toISOString().slice(0, 10);
}

export type SeedSummary = Record<string, number>;

type Globals = typeof globalThis & { __staffingSeed?: Promise<boolean> };

/** True when no user has ever been created — the only state in which auto-seeding runs. */
export async function isDatabaseEmpty(db: Database): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(users);
  return (row?.n ?? 0) === 0;
}

/**
 * Seeds the pilot dataset once per process when the database is empty. Concurrent callers share
 * the same promise so parallel first requests never seed twice.
 */
export function seedIfEmpty(db: Database): Promise<boolean> {
  const g = globalThis as Globals;
  if (!g.__staffingSeed) {
    g.__staffingSeed = (async () => {
      if (!(await isDatabaseEmpty(db))) return false;
      logger.info("seed.start", { reason: "empty database" });
      const summary = await seedDatabase();
      logger.info("seed.done", summary);
      return true;
    })().catch((error) => {
      g.__staffingSeed = undefined;
      logger.error("seed.failed", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    });
  }
  return g.__staffingSeed;
}

class SeedContext {
  users = new Map<UserKey, CurrentUser>();
  skills = new Map<string, string>();
  roleFamilies = new Map<string, string>();
  sources = new Map<string, string>();
  accounts = new Map<AccountKey, string>();
  contacts = new Map<AccountKey, string[]>();
  candidates = new Map<string, string>();
  requisitions = new Map<string, string>();
  submissionIds: string[] = [];
  summary: SeedSummary = {};

  constructor(readonly db: Database) {}

  user(key: UserKey): CurrentUser {
    const u = this.users.get(key);
    if (!u) throw new Error(`Seed: unknown user ${key}`);
    return u;
  }
  skill(code: string): string {
    const id = this.skills.get(code);
    if (!id) throw new Error(`Seed: unknown skill ${code}`);
    return id;
  }
  account(key: AccountKey): string {
    const id = this.accounts.get(key);
    if (!id) throw new Error(`Seed: unknown account ${key}`);
    return id;
  }
  candidate(key: string): string {
    const id = this.candidates.get(key);
    if (!id) throw new Error(`Seed: unknown candidate ${key}`);
    return id;
  }
  requisition(key: string): string {
    const id = this.requisitions.get(key);
    if (!id) throw new Error(`Seed: unknown requisition ${key}`);
    return id;
  }
  bump(key: string, n = 1) {
    this.summary[key] = (this.summary[key] ?? 0) + n;
  }
}

/** Builds the complete pilot dataset through the service layer. Expects an empty database. */
export async function seedDatabase(): Promise<SeedSummary> {
  const db = await getDb();
  const ctx = new SeedContext(db);

  await seedUsers(ctx);
  await seedSettings(ctx);
  await seedTemplates(ctx);
  await seedAutomationRules(ctx);
  await seedTaxonomy(ctx);
  await seedSources(ctx);
  await seedAccounts(ctx);
  await seedCandidates(ctx);
  await seedRequisitions(ctx);
  await seedSubmissions(ctx);
  await finalizeRequisitionStatuses(ctx);
  await seedManualTasks(ctx);
  await seedSavedFilters(ctx);
  await seedImportBatch(ctx);
  await seedFailedMessage(ctx);
  await seedOperationalLogs(ctx);
  await seedAccountActivity(ctx);
  await backdate(ctx);
  await runBackgroundWork(ctx);

  return ctx.summary;
}

async function seedUsers(ctx: SeedContext) {
  const rows = await ctx.db
    .insert(users)
    .values(
      USERS.map((u) => ({
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        canVerify: u.canVerify,
        jobTitle: u.jobTitle,
        phone: u.phone ?? null,
        activatedAt: u.status === "active" ? daysFromNow(-120) : null,
        lastLoginAt: u.status === "active" ? daysFromNow(-1) : u.status === "pending" ? daysFromNow(0) : daysFromNow(-90),
        avatarUrl: null,
      })),
    )
    .returning();
  for (const spec of USERS) {
    const row = rows.find((r) => r.email === spec.email)!;
    ctx.users.set(spec.key, row);
  }
  const noa = ctx.user("noa");
  await ctx.db.update(users).set({ createdBy: noa.id }).where(sql`${users.id} <> ${noa.id}`);
  ctx.bump("users", rows.length);
}

async function seedSettings(ctx: SeedContext) {
  const noa = ctx.user("noa");
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) {
    await setSetting(key, DEFAULT_SETTINGS[key], noa.id);
  }
  invalidateSettingsCache();
  ctx.bump("settings", Object.keys(DEFAULT_SETTINGS).length);
}

async function seedTemplates(ctx: SeedContext) {
  const noa = ctx.user("noa");
  for (const t of TEMPLATES) {
    await upsertTemplate(noa, messageTemplateSchema.parse({ ...t, language: t.language ?? "en" }));
    ctx.bump("templates");
  }
}

async function seedAutomationRules(ctx: SeedContext) {
  const noa = ctx.user("noa");
  for (const r of AUTOMATION_RULES) {
    const row = await upsertAutomationRule(noa, automationRuleSchema.parse({ name: r.name, description: r.description, trigger: r.trigger, conditions: r.conditions, action: r.action, actionConfig: r.actionConfig, isActive: r.isActive }));
    if (r.isSystem) await ctx.db.update(automationRules).set({ isSystem: true }).where(eq(automationRules.id, row.id));
    ctx.bump("automation_rules");
  }
}

async function seedTaxonomy(ctx: SeedContext) {
  const noa = ctx.user("noa");
  const categoryIds = new Map<string, string>();
  for (const c of CATEGORIES) {
    const row = await upsertSkillCategory(noa, skillCategorySchema.parse({ name: c.name, description: c.description, sortOrder: c.sortOrder }));
    categoryIds.set(c.key, row.id);
    ctx.bump("skill_categories");
  }
  for (const s of SKILLS) {
    const row = await upsertSkill(
      noa,
      skillSchema.parse({
        code: s.code,
        name: s.name,
        categoryId: categoryIds.get(s.category),
        description: s.description ?? null,
        ownerId: s.owner ? ctx.user(s.owner).id : null,
        isActive: true,
        defaultValidityMonths: s.validityMonths ?? null,
        synonyms: s.synonyms,
      }),
    );
    ctx.skills.set(s.code, row.id);
    ctx.bump("skills");
  }
  for (const f of ROLE_FAMILIES) {
    const row = await upsertRoleFamily(noa, roleFamilySchema.parse({ code: f.code, name: f.name, description: f.description, weights: f.weights, rankingVersion: "baseline-v1", isActive: true }));
    ctx.roleFamilies.set(f.code, row.id);
    ctx.bump("role_families");
  }
}

async function seedSources(ctx: SeedContext) {
  const noa = ctx.user("noa");
  for (const s of SOURCES) {
    const row = await upsertSource(noa, sourceSchema.parse({ name: s.name, type: s.type, contactName: s.contactName ?? null, contactEmail: s.contactEmail ?? null, commissionTerms: s.commissionTerms ?? null, isActive: true }));
    ctx.sources.set(s.key, row.id);
    ctx.bump("sources");
  }
}

async function seedAccounts(ctx: SeedContext) {
  for (const a of ACCOUNTS) {
    const owner = ctx.user(a.owner);
    const { id } = await createAccount(
      owner,
      accountSchema.parse({
        name: a.name,
        type: a.type,
        status: a.status,
        industry: a.industry,
        website: a.website ?? null,
        country: a.country,
        city: a.city,
        ownerId: owner.id,
        currency: a.currency,
        paymentTermsDays: a.paymentTermsDays ?? null,
        commercialTerms: a.commercialTerms ?? null,
        notes: a.notes ?? null,
      }),
    );
    ctx.accounts.set(a.key, id);
    ctx.bump("accounts");
    const contactIds: string[] = [];
    for (const c of a.contacts) {
      const row = await upsertContact(owner, contactSchema.parse({ accountId: id, firstName: c.first, lastName: c.last, email: c.email, phone: c.phone ?? null, title: c.title, isPrimary: c.isPrimary ?? false, receivesShortlists: c.receivesShortlists ?? false }));
      contactIds.push(row.id);
      ctx.bump("contacts");
    }
    ctx.contacts.set(a.key, contactIds);
  }
}

async function seedCandidates(ctx: SeedContext) {
  const verifier = ctx.user("daniel");
  for (const spec of CANDIDATES) {
    const owner = ctx.user(spec.owner);
    const result = await createCandidate(
      owner,
      intakeSchema.parse({
        firstName: spec.first,
        lastName: spec.last,
        email: spec.email,
        phone: spec.phone,
        city: spec.city,
        country: spec.country,
        headline: spec.headline,
        summary: spec.summary ?? null,
        status: spec.status ?? "new",
        ownerId: owner.id,
        primarySourceId: ctx.sources.get(spec.source) ?? null,
        citizenships: spec.citizenships,
        passportCountry: spec.citizenships[0] ?? null,
        militaryRole: spec.military?.role ?? null,
        militaryUnit: spec.military?.unit ?? null,
        militaryRank: spec.military?.rank ?? null,
        militaryServiceStart: spec.military?.startYearsAgo !== undefined ? isoDay(-spec.military.startYearsAgo * 365) : null,
        militaryServiceEnd: spec.military?.endYearsAgo !== undefined ? isoDay(-spec.military.endYearsAgo * 365) : null,
        yearsExperience: spec.years,
        willingToRelocate: spec.relocate,
        preferredCountries: spec.preferredCountries ?? [],
        processingConsent: true,
        communicationConsent: spec.commConsent,
        consentChannel: spec.consentChannel ?? "web_form",
        referrerName: spec.referrer ?? null,
        availableFrom: spec.availableFromDays !== undefined ? isoDay(spec.availableFromDays) : null,
        availableUntil: spec.availableUntilDays !== undefined ? isoDay(spec.availableUntilDays) : null,
        minDurationWeeks: spec.minWeeks ?? null,
        maxDurationWeeks: spec.maxWeeks ?? null,
        rotationPreference: spec.rotation ?? "no_preference",
        expectedAmount: spec.pay?.amount ?? null,
        expectedCurrency: spec.pay?.currency ?? null,
        expectedPeriod: spec.pay?.period ?? null,
        forceCreate: spec.forceCreate ?? false,
      }),
    );
    if (!("candidateId" in result)) {
      throw new Error(`Seed: unexpected duplicate for ${spec.key}: ${result.duplicates.map((d) => `${d.firstName} ${d.lastName} (${d.matchedOn.join(",")})`).join("; ")}`);
    }
    const candidateId = result.candidateId;
    ctx.candidates.set(spec.key, candidateId);
    ctx.bump("candidates");

    for (const s of spec.skills) {
      const claim = await upsertSkillClaim(
        owner,
        skillClaimSchema.parse({ candidateId, skillId: ctx.skill(s.code), originalWording: s.wording ?? null, declaredProficiency: s.level, yearsExperience: s.years ?? null, evidenceNotes: s.review === "pending_review" ? (s.evidence ?? null) : null }),
      );
      ctx.bump("skill_claims");
      if (s.review) {
        await reviewSkillClaim(verifier, reviewClaimSchema.parse({ claimId: claim.id, decision: s.review, evidenceNotes: s.evidence ?? "Evidence reviewed by seed verifier" }));
        ctx.bump("claim_reviews");
      }
    }
    for (const l of spec.languages) {
      await upsertLanguage(owner, languageSchema.parse({ candidateId, language: l.code, proficiency: l.level }));
      ctx.bump("languages");
    }
    for (const w of spec.workAuth) {
      const row = await upsertWorkAuthorization(owner, workAuthorizationSchema.parse({ candidateId, country: w.country, type: w.type, validUntil: w.validUntilDays !== undefined ? isoDay(w.validUntilDays) : null, notes: w.notes ?? null }));
      ctx.bump("work_authorizations");
      if (w.verify) {
        await reviewWorkAuthorization(verifier, reviewWorkAuthSchema.parse({ id: row.id, decision: "verified", notes: w.notes ?? "Document reviewed" }));
      }
    }
    for (const accountKey of spec.shareWith ?? []) {
      const consent = await grantConsent(owner, consentSchema.parse({ candidateId, scope: "share_with_customer", accountId: ctx.account(accountKey), channel: spec.consentChannel ?? "email", evidence: `Candidate agreed to be presented to ${ACCOUNTS.find((a) => a.key === accountKey)?.name}` }));
      ctx.bump("sharing_consents");
      if (spec.withdrawShareWith?.includes(accountKey)) {
        await withdrawConsent(owner, consent.id, "Candidate asked not to be shared with this customer for now (phone call)");
        ctx.bump("consent_withdrawals");
      }
    }
    if (spec.cvText) {
      const file = new File([spec.cvText], `${spec.first}_${spec.last}_CV.txt`, { type: "text/plain" });
      await uploadDocument(owner, { file, kind: "cv", candidateId });
      ctx.bump("documents");
    }
    if (spec.withdrawProcessingDaysAgo !== undefined) {
      const processing = await ctx.db.query.consents.findFirst({ where: and(eq(consents.candidateId, candidateId), eq(consents.scope, "process_profile"), isNull(consents.withdrawnAt)) });
      if (processing) {
        await withdrawConsent(owner, processing.id, "Candidate emailed asking to be removed from the database");
        ctx.bump("consent_withdrawals");
      }
    }
    if (spec.retentionHold) {
      await setRetentionHold(ctx.user("noa"), { candidateId, reason: spec.retentionHold.reason, until: spec.retentionHold.untilDays !== undefined ? isoDay(spec.retentionHold.untilDays) : null });
      ctx.bump("retention_holds");
    }
  }
}

async function seedRequisitions(ctx: SeedContext) {
  for (const spec of REQUISITIONS) {
    const owner = ctx.user(spec.owner);
    const contacts = ctx.contacts.get(spec.account) ?? [];
    const id = await createRequisition(
      owner,
      requisitionSchema.parse({
        accountId: ctx.account(spec.account),
        contactId: spec.contactIndex !== undefined ? (contacts[spec.contactIndex] ?? null) : null,
        roleFamilyId: ctx.roleFamilies.get(spec.roleFamily) ?? null,
        title: spec.title,
        description: spec.description,
        locationCountry: spec.country,
        locationCity: spec.city,
        siteName: spec.site ?? null,
        startDate: isoDay(spec.startDays),
        endDate: isoDay(spec.startDays + spec.durationWeeks * 7),
        durationWeeks: spec.durationWeeks,
        headcountApproved: spec.headcount,
        status: "draft",
        priority: spec.priority,
        ownerId: owner.id,
        billRateAmount: spec.bill?.amount ?? null,
        billRateCurrency: spec.bill?.currency ?? null,
        billRatePeriod: spec.bill?.period ?? null,
        payRateAmount: spec.pay?.amount ?? null,
        payRateCurrency: spec.pay?.currency ?? null,
        payRatePeriod: spec.pay?.period ?? null,
        externalRef: spec.externalRef ?? null,
      }),
    );
    ctx.requisitions.set(spec.key, id);
    ctx.bump("requisitions");
    await saveRequirementsVersion(
      owner,
      requirementsVersionSchema.parse({
        requisitionId: id,
        changeSummary: "Requirements agreed with the customer",
        requirements: spec.requirements.map((r, i) => ({
          kind: r.kind,
          field: r.field,
          operator: r.operator ?? (r.field === "skill" || r.field === "certification" ? "exists" : "equals"),
          value: r.value,
          skillId: r.skill ? ctx.skill(r.skill) : null,
          evidenceRequirement: r.evidence ?? "declared",
          justification: r.justification ?? null,
          weight: r.weight ?? 1,
          sortOrder: i,
        })),
      }),
    );
    ctx.bump("requirement_versions");
    if (spec.finalStatus !== "draft") {
      await changeRequisitionStatus(owner, { id, status: "open", closeReason: null });
    }
  }
}

const FORWARD: Stage[] = ["sourced", "contacted", "interested", "screening", "interviewing", "presented", "customer_review", "offered", "accepted"];

async function advanceTo(ctx: SeedContext, user: CurrentUser, spec: SubmissionSpec, submissionId: string, current: Stage, target: Stage): Promise<Stage> {
  let stage = current;
  const targetIndex = FORWARD.indexOf(target);
  while (FORWARD.indexOf(stage) < targetIndex) {
    const next = FORWARD[FORWARD.indexOf(stage) + 1]!;
    if (next === "interested") {
      await confirmInterest(user, { submissionId, interest: true, availabilityConfirmed: true, channel: spec.outreach ? "whatsapp" : "phone", notes: null });
      stage = "interested";
      continue;
    }
    if (next === "interviewing") {
      const past = (spec.interviews ?? []).filter((i) => i.inDays <= 0);
      if (past.length) {
        await runInterviews(ctx, user, spec, submissionId, past);
        stage = "interviewing";
        continue;
      }
    }
    if (next === "presented" && spec.disclose) {
      const contactId = ctx.contacts.get(REQUISITIONS.find((r) => r.key === spec.requisition)!.account)?.[0] ?? null;
      await discloseCandidate(
        user,
        disclosureSchema.parse({ submissionId, contactId, channel: "email", fieldsShared: await defaultDisclosureFields(), documentIds: [], notes: spec.overrideReview ?? "Approved summary shared with the customer contact", overrideReview: Boolean(spec.overrideReview) }),
      );
      ctx.bump("disclosures");
      if (spec.overrideReview) ctx.bump("eligibility_overrides");
      stage = "presented";
      continue;
    }
    const plannedStart = next === "accepted" ? isoDay(spec.plannedStartDays ?? REQUISITIONS.find((r) => r.key === spec.requisition)!.startDays) : null;
    await changeStage(
      user,
      stageChangeSchema.parse({ submissionId, toStage: next, reason: null, notes: next === "accepted" ? "Offer accepted; seat reserved" : null, plannedStart, plannedEnd: null, overrideReview: Boolean(spec.overrideReview) }),
    );
    if (spec.overrideReview && ["presented", "customer_review", "offered"].includes(next)) ctx.bump("eligibility_overrides");
    stage = next;
  }
  const future = (spec.interviews ?? []).filter((i) => i.inDays > 0);
  if (future.length && ["interested", "screening", "interviewing"].includes(stage)) {
    await runInterviews(ctx, user, spec, submissionId, future);
    if (stage !== "interviewing") stage = "interviewing";
  }
  return stage;
}

async function runInterviews(ctx: SeedContext, user: CurrentUser, spec: SubmissionSpec, submissionId: string, list: NonNullable<SubmissionSpec["interviews"]>) {
  const req = REQUISITIONS.find((r) => r.key === spec.requisition)!;
  for (const iv of list) {
    const contactId = iv.withContact ? (ctx.contacts.get(req.account)?.[0] ?? null) : null;
    const row = await scheduleInterview(
      user,
      interviewSchema.parse({
        submissionId,
        type: iv.type,
        scheduledAt: new Date(Date.now() + iv.inDays * DAY_MS + 9 * 3_600_000).toISOString(),
        durationMinutes: iv.type === "screening_call" ? 30 : 45,
        interviewerId: iv.type === "customer_interview" ? null : user.id,
        customerContactId: contactId,
        location: iv.type === "customer_interview" ? "Video call (customer)" : null,
        meetingLink: iv.type === "customer_interview" ? null : "https://meet.example.com/relay-" + submissionId.slice(0, 8),
        notes: null,
      }),
    );
    ctx.bump("interviews");
    if (iv.inDays <= 0 && iv.outcome) {
      await recordInterviewOutcome(user, interviewOutcomeSchema.parse({ id: row.id, status: "completed", outcome: iv.outcome, summary: iv.summary ?? null }));
    }
  }
}

function terminalTarget(path: StagePath): { target: Stage; close?: Stage; placement?: "active" | "completed" } {
  switch (path) {
    case "placed_active":
      return { target: "accepted", placement: "active" };
    case "placed_completed":
      return { target: "accepted", placement: "completed" };
    case "declined_by_candidate":
    case "rejected_by_customer":
    case "withdrawn":
    case "not_eligible":
      return { target: "sourced", close: path };
    default:
      return { target: path };
  }
}

async function seedSubmissions(ctx: SeedContext) {
  for (const spec of SUBMISSIONS) {
    try {
      await seedSubmission(ctx, spec);
    } catch (error) {
      throw new Error(`Seed: submission ${spec.candidate} → ${spec.requisition} (${spec.path}) failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
}

async function seedSubmission(ctx: SeedContext, spec: SubmissionSpec) {
  {
    const candidateSpec = CANDIDATES.find((c) => c.key === spec.candidate)!;
    const user = ctx.user(candidateSpec.owner);
    const submissionId = await createSubmission(user, createSubmissionSchema.parse({ requisitionId: ctx.requisition(spec.requisition), candidateId: ctx.candidate(spec.candidate), ownerId: null, sourceId: null, notes: spec.notes ?? null }));
    ctx.submissionIds.push(submissionId);
    ctx.bump("submissions");

    if (spec.outreach) {
      await queueTemplateMessage({ candidateId: ctx.candidate(spec.candidate), submissionId, templateName: spec.outreach, actorId: user.id, sendKey: `seed:${spec.candidate}:${spec.requisition}:${spec.outreach}` });
      ctx.bump("messages");
    }

    const plan = terminalTarget(spec.path);
    if (plan.close) {
      const from = spec.closeFrom ?? "sourced";
      await advanceTo(ctx, user, spec, submissionId, "sourced", from);
      await changeStage(user, stageChangeSchema.parse({ submissionId, toStage: plan.close, reason: spec.reason ?? "other", notes: spec.notes ?? null, plannedStart: null, plannedEnd: null, overrideReview: false }));
      ctx.bump("closed_submissions");
      return;
    }
    await advanceTo(ctx, user, spec, submissionId, "sourced", plan.target);

    if (plan.placement) {
      const placement = await ctx.db.query.placements.findFirst({ where: and(eq(placements.submissionId, submissionId), eq(placements.status, "reserved")) });
      if (!placement) throw new Error(`Seed: no reserved seat for ${spec.candidate} on ${spec.requisition}`);
      await startPlacement(user, { id: placement.id, actualStart: isoDay(spec.actualStartDays ?? spec.plannedStartDays ?? 0) });
      ctx.bump("placements_started");
      if (plan.placement === "active") {
        await activatePlacement(user, placement.id);
      } else {
        await completePlacement(user, { id: placement.id, actualEnd: isoDay(spec.actualEndDays ?? 0), notes: "Assignment completed; customer feedback positive." });
        ctx.bump("placements_completed");
      }
    }
  }
}

async function finalizeRequisitionStatuses(ctx: SeedContext) {
  for (const spec of REQUISITIONS) {
    const owner = ctx.user(spec.owner);
    const id = ctx.requisition(spec.key);
    if (spec.finalStatus === "on_hold" || spec.finalStatus === "closed" || spec.finalStatus === "cancelled") {
      await changeRequisitionStatus(owner, { id, status: spec.finalStatus, closeReason: spec.closeReason ?? null });
    }
  }
}

async function seedManualTasks(ctx: SeedContext) {
  for (const t of MANUAL_TASKS) {
    const owner = ctx.user(t.owner);
    const row = await createTask(ctx.db, {
      title: t.title,
      description: t.description ?? null,
      type: t.type,
      priority: t.priority,
      status: t.status ?? "open",
      dueAt: daysFromNow(t.dueInDays),
      ownerId: owner.id,
      candidateId: t.candidate ? ctx.candidate(t.candidate) : null,
      requisitionId: t.requisition ? ctx.requisition(t.requisition) : null,
      accountId: t.account ? ctx.account(t.account) : null,
      completedAt: t.status === "done" ? daysFromNow(-1) : null,
      completedById: t.status === "done" ? owner.id : null,
      createdBy: ctx.user("noa").id,
    });
    if (row) ctx.bump("manual_tasks");
  }
}

async function seedSavedFilters(ctx: SeedContext) {
  for (const f of SAVED_FILTERS) {
    await saveFilter(ctx.user(f.user).id, { entity: f.entity, name: f.name, filters: f.filters, isDefault: f.isDefault ?? false });
    ctx.bump("saved_filters");
  }
}

async function seedImportBatch(ctx: SeedContext) {
  const noa = ctx.user("noa");
  const batch = await previewImport(noa, { filename: "legacy_candidates_export.csv", csvText: IMPORT_CSV, sourceId: ctx.sources.get("legacy_import") ?? null });
  const decisions = batch.duplicates.map((d) => ({ row: d.row, decision: "skip" as const }));
  if (decisions.length) await updateDuplicateDecisions(noa, batch.id, decisions);
  await startImport(noa, batch.id);
  ctx.bump("import_batches");
}

/** A WhatsApp send that exhausted its retries: failed message, fallback task, owner notification. */
async function seedFailedMessage(ctx: SeedContext) {
  const candidateId = ctx.candidate("gal_peretz");
  const maya = ctx.user("maya");
  const [row] = await ctx.db
    .insert(messages)
    .values({
      channel: "whatsapp",
      status: "queued",
      candidateId,
      toAddress: "+972509426675",
      body: "Hi Gal, this is Maya Cohen from Relay Staffing. Are you still available for assignments from next month? Reply with the earliest date you can start.",
      sendKey: "seed:failed:gal_peretz:availability",
      attempts: 3,
      createdBy: maya.id,
    })
    .returning();
  await markMessageFailed(row!.id, "WhatsApp API 400: (#131026) Message undeliverable — recipient number is not registered on WhatsApp");
  ctx.bump("failed_messages");
}

async function seedOperationalLogs(ctx: SeedContext) {
  const noa = ctx.user("noa");
  const maya = ctx.user("maya");
  const lior = ctx.user("lior");
  const candidateId = ctx.candidate("eden_shalev");

  const [dead] = await ctx.db
    .insert(jobs)
    .values({
      type: "whatsapp:send",
      payload: { messageId: "00000000-0000-4000-8000-000000000001" },
      status: "dead",
      attempts: 3,
      maxAttempts: 3,
      runAt: daysFromNow(-2),
      startedAt: daysFromNow(-2),
      finishedAt: daysFromNow(-2),
      lastError: "WhatsApp API 401: Access token expired. Rotate WHATSAPP_ACCESS_TOKEN and retry.",
      idempotencyKey: "seed:dead:whatsapp-token",
      ownerId: maya.id,
    })
    .returning();
  await ctx.db.insert(integrationErrorLog).values([
    { integration: "whatsapp", operation: "send_template", errorMessage: "WhatsApp API 401: Access token expired", errorCode: "401", payload: { template: "availability_reconfirm_v1" }, jobId: dead!.id, attempts: 3, createdAt: daysFromNow(-2) },
    { integration: "whatsapp", operation: "send_template", errorMessage: "WhatsApp API 400: (#131026) Message undeliverable", errorCode: "131026", payload: { candidate: "gal_peretz" }, attempts: 3, createdAt: daysFromNow(-1) },
    { integration: "email", operation: "send", errorMessage: "SMTP connection timed out after 10000 ms", errorCode: "ETIMEDOUT", payload: { host: "smtp.example.com" }, attempts: 2, resolvedAt: daysFromNow(-5), createdAt: daysFromNow(-6) },
  ]);
  await ctx.db.insert(webhookEvents).values([
    { provider: "whatsapp", externalEventId: "wamid.seed.status.001", signatureValid: true, payload: { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.seed.msg.001", status: "delivered", timestamp: String(Math.floor(daysFromNow(-3).getTime() / 1000)) }] } }] }] }, processedAt: daysFromNow(-3), createdAt: daysFromNow(-3) },
    { provider: "whatsapp", externalEventId: "wamid.seed.inbound.002", signatureValid: true, payload: { entry: [{ changes: [{ value: { messages: [{ id: "wamid.seed.in.002", from: "972544112290", timestamp: String(Math.floor(daysFromNow(-2).getTime() / 1000)), type: "text", text: { body: "Yes, still available from October." } }] } }] }] }, processedAt: daysFromNow(-2), createdAt: daysFromNow(-2) },
    { provider: "whatsapp", externalEventId: "wamid.seed.bad.003", signatureValid: false, payload: { entry: [] }, processedAt: null, error: "Signature mismatch — event rejected", createdAt: daysFromNow(-1) },
  ]);
  await ctx.db.insert(securityAuditLog).values([
    { userId: noa.id, action: "login", statusCode: 200, path: "/api/auth/google/callback", ip: "203.0.113.10", userAgent: "Mozilla/5.0", details: { via: "google" }, createdAt: daysFromNow(-1) },
    { userId: maya.id, action: "login", statusCode: 200, path: "/api/auth/google/callback", ip: "203.0.113.24", userAgent: "Mozilla/5.0", details: { via: "google" }, createdAt: daysFromNow(-1) },
    { userId: lior.id, action: "denied:write", resource: "candidate", method: "POST", path: "/candidates", statusCode: 403, ip: "203.0.113.31", userAgent: "Mozilla/5.0", details: { attempted: "updateCandidateAction" }, createdAt: daysFromNow(-2) },
    { userId: lior.id, action: "denied:export", resource: "candidates", method: "GET", path: "/api/export/candidates", statusCode: 403, ip: "203.0.113.31", userAgent: "Mozilla/5.0", createdAt: daysFromNow(-2) },
    { userId: maya.id, action: "denied:admin_route", resource: "admin", method: "GET", path: "/admin/users", statusCode: 403, ip: "203.0.113.24", userAgent: "Mozilla/5.0", createdAt: daysFromNow(-4) },
    { userId: null, action: "rate_limited", resource: "ip", method: "GET", path: "/api/health", statusCode: 429, ip: "198.51.100.77", userAgent: "curl/8.5", createdAt: daysFromNow(-3) },
  ]);
  await ctx.db.insert(aiAuditLog).values({
    purpose: "semantic_ranking",
    provider: "disabled",
    model: null,
    entityType: "requisition",
    entityId: ctx.requisition("r1_pipe_welders"),
    input: { note: "AI ranking is off for the pilot; rules-based ranking baseline-v1 in use" },
    output: { skipped: true },
    confidence: null,
    latencyMs: 0,
    status: "skipped",
    userId: noa.id,
    createdAt: daysFromNow(-5),
  });
  void candidateId;
  ctx.bump("operational_logs");
}

async function seedAccountActivity(ctx: SeedContext) {
  const yossi = ctx.user("yossi");
  const maya = ctx.user("maya");
  const noa = ctx.user("noa");
  const entries: { user: CurrentUser; type: "note" | "call" | "email" | "meeting" | "whatsapp"; subject: string; body?: string; account?: AccountKey; candidate?: string; requisition?: string; daysAgo: number }[] = [
    { user: yossi, type: "meeting", subject: "Quarterly review with Nordsee Werft", body: "<p>Katrin confirmed the outfitting phase timeline and asked for four TIG welders by the end of the month. Weld test on arrival stays mandatory.</p>", account: "nordsee", requisition: "r1_pipe_welders", daysAgo: 29 },
    { user: yossi, type: "call", subject: "Delta Offshore: verified evidence requirement", body: "<p>Pieter reiterated that BOSIET and right-to-work must be <strong>verified</strong> before mobilisation; declared claims are not accepted by their compliance team.</p>", account: "delta", requisition: "r2_offshore_electricians", daysAgo: 24 },
    { user: yossi, type: "email", subject: "Sent rate card to Helios Solar", body: "<p>Framework and rate card sent to Eleni. Follow up next week.</p>", account: "helios", daysAgo: 2 },
    { user: yossi, type: "call", subject: "Baltic Windworks: turbine delivery slipped", body: "<p>Marek expects a new delivery date in two weeks. Request on hold until then.</p>", account: "baltic", requisition: "r6_wind_technicians", daysAgo: 6 },
    { user: maya, type: "call", subject: "30-day check-in with Lior Biton", body: "<p>Settled in well. Ronit reports strong inventory accuracy. Probation on track.</p>", candidate: "lior_biton", daysAgo: 10 },
    { user: maya, type: "whatsapp", subject: "Yonatan Mizrahi asked about trade test dates", body: "<p>Explained the trade test is required before we can present him. Booking for next week.</p>", candidate: "yonatan_mizrahi", daysAgo: 3 },
    { user: noa, type: "note", subject: "Limassol Port Security: permit sponsorship confirmed", body: "<p>Customer confirmed in writing that they sponsor work permits for non-EU officers. Attach the letter to the account when received.</p>", account: "cyprus_port", requisition: "r3_port_security", daysAgo: 11 },
    { user: maya, type: "note", subject: "Sergei Volkov: excellent feedback from spring campaign", body: "<p>Nordsee Werft rated his welds top of the crew. Renew German permit and re-present for the pipe welder phase.</p>", candidate: "sergei_volkov", daysAgo: 23 },
  ];
  for (const e of entries) {
    await logActivity(ctx.db, {
      type: e.type,
      subject: e.subject,
      body: e.body,
      accountId: e.account ? ctx.account(e.account) : null,
      candidateId: e.candidate ? ctx.candidate(e.candidate) : null,
      requisitionId: e.requisition ? ctx.requisition(e.requisition) : null,
      actorId: e.user.id,
      occurredAt: daysFromNow(-e.daysAgo),
    });
    ctx.bump("activities");
  }
}

/**
 * Service calls stamp everything "now". Shift the key timeline columns into the past so the
 * dashboard, reports and stall detection see a realistic history.
 */
async function backdate(ctx: SeedContext) {
  const db = ctx.db;
  for (const spec of CANDIDATES) {
    const id = ctx.candidate(spec.key);
    const created = daysFromNow(-spec.createdDaysAgo);
    await db.update(candidates).set(spec.dormant ? { createdAt: created, updatedAt: created } : { createdAt: created }).where(eq(candidates.id, id));
    await db.update(sourceEvents).set({ occurredAt: created, createdAt: created }).where(eq(sourceEvents.candidateId, id));
    await db.execute(sql`update consents set granted_at = ${created.toISOString()}::timestamptz, created_at = ${created.toISOString()}::timestamptz where candidate_id = ${id} and withdrawn_at is null`);
    if (spec.withdrawProcessingDaysAgo !== undefined) {
      const withdrawn = daysFromNow(-spec.withdrawProcessingDaysAgo);
      await db.execute(sql`update consents set granted_at = ${created.toISOString()}::timestamptz, created_at = ${created.toISOString()}::timestamptz, withdrawn_at = ${withdrawn.toISOString()}::timestamptz where candidate_id = ${id} and withdrawn_at is not null`);
      await db.execute(sql`update activities set occurred_at = ${withdrawn.toISOString()}::timestamptz, created_at = ${withdrawn.toISOString()}::timestamptz where candidate_id = ${id} and subject like 'Permission withdrawn%'`);
      await db.update(candidates).set({ updatedAt: withdrawn }).where(eq(candidates.id, id));
    }
    if (spec.dormant) {
      await db.execute(sql`update activities set occurred_at = ${created.toISOString()}::timestamptz, created_at = ${created.toISOString()}::timestamptz where candidate_id = ${id}`);
    }
    await db.execute(sql`update activities set occurred_at = ${created.toISOString()}::timestamptz, created_at = ${created.toISOString()}::timestamptz where candidate_id = ${id} and submission_id is null and type = 'system' and subject like 'Candidate created%'`);
    await db.execute(sql`update audit_log set created_at = ${created.toISOString()}::timestamptz where entity_type = 'candidate' and entity_id = ${id} and action = 'create'`);
  }
  for (const spec of REQUISITIONS) {
    const id = ctx.requisition(spec.key);
    const created = daysFromNow(-spec.createdDaysAgo);
    const opened = daysFromNow(-spec.createdDaysAgo + 1);
    await db.update(requisitions).set({ createdAt: created, openedAt: spec.finalStatus === "draft" ? null : opened }).where(eq(requisitions.id, id));
    await db.update(requisitionVersions).set({ createdAt: created }).where(eq(requisitionVersions.requisitionId, id));
    await db.execute(sql`update activities set occurred_at = ${created.toISOString()}::timestamptz, created_at = ${created.toISOString()}::timestamptz where requisition_id = ${id} and submission_id is null and candidate_id is null and subject like 'Requisition created%'`);
    if (spec.finalStatus === "closed" || spec.finalStatus === "cancelled") {
      const closedAt = daysFromNow(spec.finalStatus === "closed" ? -15 : -30);
      await db.update(requisitions).set({ closedAt }).where(eq(requisitions.id, id));
    }
  }
  for (let i = 0; i < SUBMISSIONS.length; i++) {
    const spec = SUBMISSIONS[i]!;
    const id = ctx.submissionIds[i]!;
    const created = daysFromNow(-spec.createdDaysAgo);
    const changed = daysFromNow(-spec.stageChangedDaysAgo);
    await db.update(submissions).set({ createdAt: created, stageChangedAt: changed, closedAt: sql`case when closed_at is null then null else ${changed.toISOString()}::timestamptz end` }).where(eq(submissions.id, id));
    const history = await db.select({ id: submissionStageHistory.id }).from(submissionStageHistory).where(eq(submissionStageHistory.submissionId, id)).orderBy(submissionStageHistory.createdAt);
    const steps = Math.max(history.length - 1, 1);
    for (let h = 0; h < history.length; h++) {
      const at = new Date(created.getTime() + ((changed.getTime() - created.getTime()) * h) / steps);
      await db.update(submissionStageHistory).set({ createdAt: at }).where(eq(submissionStageHistory.id, history[h]!.id));
    }
    await db.execute(sql`update activities set occurred_at = ${created.toISOString()}::timestamptz, created_at = ${created.toISOString()}::timestamptz where submission_id = ${id} and subject like 'Added to %'`);
    await db.execute(sql`update messages set created_at = ${created.toISOString()}::timestamptz where submission_id = ${id}`);
    if (spec.path === "placed_active" || spec.path === "placed_completed" || spec.path === "accepted") {
      await db.update(placements).set({ createdAt: changed }).where(eq(placements.submissionId, id));
    }
  }
  ctx.bump("backdated_records");
}

/** Processes queued jobs (recompute, CV extraction, import commit) and runs the daily housekeeping once. */
async function runBackgroundWork(ctx: SeedContext) {
  const jobsRun = await runPendingJobs(200);
  ctx.bump("jobs_processed", jobsRun.processed);
  ctx.bump("jobs_failed", jobsRun.failed);
  const maintenance = await runDailyMaintenance();
  for (const [k, v] of Object.entries(maintenance)) ctx.bump(`maintenance_${k}`, v);
}
