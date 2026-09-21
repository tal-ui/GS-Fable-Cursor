import "server-only";
import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import {
  activities,
  aiAuditLog,
  auditLog,
  candidateSkillClaims,
  candidateWorkAuthorizations,
  candidates,
  consents,
  disclosures,
  documentAccessLog,
  documents,
  importBatches,
  interviews,
  messages,
  placements,
  sourceEvents,
  submissions,
  tasks,
  uploadLinks,
  users,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { conflict, notFound, validation } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { cleanText } from "@/lib/sanitize";
import { storage } from "./documents/storage";
import { getSettings } from "./settings";
import { createTask } from "./tasks";

/**
 * Retention and erasure (plan §8, control 22). A profile falls due for review when the candidate
 * withdrew permission to process it, or when nothing has happened on it for the configured number of
 * months. Review raises an owned task; erasure is a separate, deliberate Super Admin action that
 * scrubs personal data, files and derived AI data while the row survives so submissions, placements
 * and headcount history still reconcile. A documented hold keeps a profile past its due date.
 */

const ERASED = "[erased]";

export type RetentionEntry = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: Date;
  /** Newest of: profile update, activity, submission movement, permission change. */
  lastActivityAt: Date;
  processingWithdrawnAt: Date | null;
  reason: "permission_withdrawn" | "inactive";
  dueSince: Date;
  eligibleFrom: Date;
  holdReason: string | null;
  holdUntil: string | null;
  onHold: boolean;
  eligible: boolean;
};

const lastActivitySql = sql<Date>`greatest(
  ${candidates.updatedAt},
  coalesce((select max(a.occurred_at) from ${activities} a where a.candidate_id = ${candidates.id}), ${candidates.createdAt}),
  coalesce((select max(s.stage_changed_at) from ${submissions} s where s.candidate_id = ${candidates.id} and s.is_deleted = false), ${candidates.createdAt}),
  coalesce((select max(coalesce(c.withdrawn_at, c.granted_at)) from ${consents} c where c.candidate_id = ${candidates.id}), ${candidates.createdAt})
)`;

const processingWithdrawnSql = sql<Date | null>`(
  select max(c.withdrawn_at) from ${consents} c
  where c.candidate_id = ${candidates.id} and c.scope = 'process_profile'
    and not exists (select 1 from ${consents} c2 where c2.candidate_id = ${candidates.id} and c2.scope = 'process_profile' and c2.withdrawn_at is null)
)`;

const noLiveEngagementSql: SQL = sql`not exists (select 1 from ${placements} p where p.candidate_id = ${candidates.id} and p.is_deleted = false and p.status in ('reserved','started','active','extended'))
  and not exists (select 1 from ${submissions} s where s.candidate_id = ${candidates.id} and s.is_deleted = false and s.stage in ('sourced','contacted','interested','screening','interviewing','presented','customer_review','offered','accepted'))`;

const addMonths = (d: Date, months: number) => new Date(new Date(d).setUTCMonth(d.getUTCMonth() + months));
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

/** Profiles that are due for retention review, with hold and eligibility computed from the current settings. */
export async function retentionQueue(now = new Date()): Promise<RetentionEntry[]> {
  const db = await getDb();
  const settings = await getSettings();
  const inactiveCutoff = addMonths(now, -settings.candidate_retention_months);
  const rows = await db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      status: candidates.status,
      ownerId: candidates.ownerId,
      ownerName: users.name,
      createdAt: candidates.createdAt,
      lastActivityAt: lastActivitySql,
      processingWithdrawnAt: processingWithdrawnSql,
      holdReason: candidates.retentionHoldReason,
      holdUntil: candidates.retentionHoldUntil,
    })
    .from(candidates)
    .leftJoin(users, eq(users.id, candidates.ownerId))
    .where(
      and(
        eq(candidates.isDeleted, false),
        isNull(candidates.mergedIntoId),
        isNull(candidates.anonymizedAt),
        noLiveEngagementSql,
        or(sql`${processingWithdrawnSql} is not null`, sql`${lastActivitySql} < ${inactiveCutoff}`),
      ),
    )
    .orderBy(sql`coalesce(${processingWithdrawnSql}, ${lastActivitySql}) asc`);

  const today = now.toISOString().slice(0, 10);
  return rows.map((r) => {
    const lastActivityAt = new Date(r.lastActivityAt);
    const processingWithdrawnAt = r.processingWithdrawnAt ? new Date(r.processingWithdrawnAt) : null;
    const reason = processingWithdrawnAt ? "permission_withdrawn" : "inactive";
    const dueSince = processingWithdrawnAt ?? addMonths(lastActivityAt, settings.candidate_retention_months);
    const eligibleFrom = addDays(dueSince, settings.retention_grace_days);
    const onHold = Boolean(r.holdReason) && (!r.holdUntil || r.holdUntil >= today);
    return { ...r, lastActivityAt, processingWithdrawnAt, reason, dueSince, eligibleFrom, onHold, eligible: !onHold && eligibleFrom <= now };
  });
}

export async function retentionStats(queue?: RetentionEntry[]) {
  const db = await getDb();
  const entries = queue ?? (await retentionQueue());
  const [{ erased }] = await db.select({ erased: sql<number>`count(*)::int` }).from(candidates).where(sql`${candidates.anonymizedAt} is not null`);
  return {
    due: entries.length,
    onHold: entries.filter((q) => q.onHold).length,
    eligible: entries.filter((q) => q.eligible).length,
    withdrawn: entries.filter((q) => q.reason === "permission_withdrawn").length,
    erased: erased ?? 0,
  };
}

export type ErasureRecord = {
  candidateId: string;
  label: string;
  erasedAt: Date;
  actorName: string | null;
  reason: string | null;
  counts: Record<string, number>;
  note: string | null;
};

/** Profiles already erased, newest first, with what the erasure removed (counts only, never content). */
export async function recentErasures(limit = 50): Promise<ErasureRecord[]> {
  const db = await getDb();
  const rows = await db
    .select({
      candidateId: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      erasedAt: candidates.anonymizedAt,
      actorName: users.name,
      before: auditLog.before,
      after: auditLog.after,
      note: auditLog.note,
    })
    .from(candidates)
    .leftJoin(auditLog, and(eq(auditLog.entityType, "candidate"), eq(auditLog.entityId, candidates.id), eq(auditLog.action, "anonymize")))
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(sql`${candidates.anonymizedAt} is not null`)
    .orderBy(sql`${candidates.anonymizedAt} desc`)
    .limit(limit);
  return rows.map((r) => ({
    candidateId: r.candidateId,
    label: `${r.firstName} ${r.lastName}`,
    erasedAt: r.erasedAt as Date,
    actorName: r.actorName,
    reason: typeof r.before?.reason === "string" ? r.before.reason : null,
    counts: Object.fromEntries(Object.entries(r.after ?? {}).filter((e): e is [string, number] => typeof e[1] === "number")),
    note: r.note,
  }));
}

/** Daily maintenance step: one owned review task per due profile per month; holds suppress the task. */
export async function raiseRetentionReviews(db: DbOrTx, now = new Date()): Promise<number> {
  const queue = await retentionQueue(now);
  const monthKey = now.toISOString().slice(0, 7);
  let created = 0;
  for (const entry of queue) {
    if (entry.onHold) continue;
    const why = entry.reason === "permission_withdrawn" ? "withdrew permission to process their profile" : `has had no activity since ${entry.lastActivityAt.toISOString().slice(0, 10)}`;
    const task = await createTask(db, {
      title: `Retention review: ${entry.firstName} ${entry.lastName} ${why}`,
      description: `Decide whether to erase this profile (eligible from ${entry.eligibleFrom.toISOString().slice(0, 10)}) or record a documented retention hold. Erasure is done by a Super Admin from Setup → Retention.`,
      type: "retention_review",
      priority: entry.reason === "permission_withdrawn" ? "high" : "low",
      dueAt: entry.eligibleFrom,
      ownerId: entry.ownerId,
      candidateId: entry.id,
      dedupeKey: `retention:${entry.id}:${monthKey}`,
      createdBy: null,
    });
    if (task) created += 1;
  }
  return created;
}

/** Records (or clears, when reason is null) a documented hold that keeps the profile past its retention date. */
export async function setRetentionHold(admin: CurrentUser, input: { candidateId: string; reason: string | null; until: string | null }) {
  const db = await getDb();
  const before = await db.query.candidates.findFirst({ where: and(eq(candidates.id, input.candidateId), eq(candidates.isDeleted, false)) });
  if (!before) throw notFound("Candidate");
  const reason = cleanText(input.reason);
  if (reason && input.until && input.until < new Date().toISOString().slice(0, 10)) throw validation("A hold must end in the future.", { until: "Choose a future date" });
  // A hold is retention bookkeeping, not profile activity: keep updated_at so the profile stays due.
  await db.update(candidates).set({ retentionHoldReason: reason, retentionHoldUntil: reason ? input.until : null, updatedAt: before.updatedAt }).where(eq(candidates.id, before.id));
  await recordAudit(db, {
    entityType: "candidate",
    entityId: before.id,
    action: "retention_hold",
    actorId: admin.id,
    before: { holdReason: before.retentionHoldReason, holdUntil: before.retentionHoldUntil },
    after: { holdReason: reason, holdUntil: reason ? input.until : null },
    note: reason ? "Retention hold placed" : "Retention hold cleared",
  });
  return { holdReason: reason, holdUntil: reason ? input.until : null };
}

export type ErasureResult = { candidateId: string; documents: number; messages: number; activities: number; tasks: number; aiRecords: number };

/**
 * Erases a profile's personal data. Allowed only for profiles in the retention queue that are past their
 * grace period (or whose processing permission was withdrawn), never while on hold, and never with a live
 * submission or placement. Commercial history keeps its links to the erased row.
 */
export async function anonymizeCandidate(admin: CurrentUser, candidateId: string, note: string | null): Promise<ErasureResult> {
  const db = await getDb();
  const [entry] = (await retentionQueue()).filter((q) => q.id === candidateId);
  if (!entry) {
    const exists = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId), columns: { id: true, anonymizedAt: true, isDeleted: true } });
    if (exists?.anonymizedAt) throw conflict("This profile has already been erased.");
    if (!exists || exists.isDeleted) throw notFound("Candidate");
    throw conflict("This profile is not due for erasure: it is active, has a live submission or placement, or is inside the retention period.");
  }
  if (entry.onHold) throw conflict(`A retention hold is in place${entry.holdUntil ? ` until ${entry.holdUntil}` : ""}: ${entry.holdReason}`);
  if (!entry.eligible) throw conflict(`The grace period has not ended; erasure is possible from ${entry.eligibleFrom.toISOString().slice(0, 10)}.`);

  const docs = await db.select({ id: documents.id, storageKey: documents.storageKey }).from(documents).where(eq(documents.candidateId, candidateId));
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const docIds = docs.map((d) => d.id);
    if (docIds.length) {
      await tx.update(documents).set({ isDeleted: true, filename: "erased", extractedText: null, storageKey: sql`'erased/' || ${documents.id}` }).where(inArray(documents.id, docIds));
      await tx.insert(documentAccessLog).values(docIds.map((documentId) => ({ documentId, userId: admin.id, action: "delete" as const, details: { reason: "retention_erasure" } })));
    }
    const msgs = await tx.update(messages).set({ body: ERASED, subject: null, toAddress: ERASED, variables: null }).where(eq(messages.candidateId, candidateId)).returning({ id: messages.id });
    const acts = await tx.update(activities).set({ body: null }).where(and(eq(activities.candidateId, candidateId), sql`${activities.body} is not null`)).returning({ id: activities.id });
    const openTasks = await tx
      .update(tasks)
      .set({ title: "Task for an erased profile", description: null, status: sql`case when ${tasks.status} in ('open','in_progress') then 'cancelled'::task_status else ${tasks.status} end` })
      .where(eq(tasks.candidateId, candidateId))
      .returning({ id: tasks.id });
    await tx.update(consents).set({ evidence: ERASED, evidenceDocumentId: null }).where(eq(consents.candidateId, candidateId));
    await tx.update(uploadLinks).set({ revokedAt: sql`coalesce(${uploadLinks.revokedAt}, now())`, purpose: null, isDeleted: true }).where(eq(uploadLinks.candidateId, candidateId));
    await tx.update(candidateSkillClaims).set({ originalWording: null, evidenceNotes: null }).where(eq(candidateSkillClaims.candidateId, candidateId));
    await tx.update(candidateWorkAuthorizations).set({ notes: null }).where(eq(candidateWorkAuthorizations.candidateId, candidateId));
    await tx.update(disclosures).set({ summaryText: ERASED, notes: null }).where(eq(disclosures.candidateId, candidateId));
    const subIds = (await tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.candidateId, candidateId))).map((s) => s.id);
    if (subIds.length) {
      await tx.update(submissions).set({ decisionNotes: null }).where(inArray(submissions.id, subIds));
      await tx.update(interviews).set({ notes: null, summary: null, meetingLink: null, location: null }).where(inArray(interviews.submissionId, subIds));
    }
    const ai = await tx
      .update(aiAuditLog)
      .set({ input: { erased: true }, output: { erased: true } })
      .where(or(and(eq(aiAuditLog.entityType, "candidate"), eq(aiAuditLog.entityId, candidateId)), docIds.length ? and(eq(aiAuditLog.entityType, "document"), inArray(aiAuditLog.entityId, docIds)) : sql`false`))
      .returning({ id: aiAuditLog.id });
    // Imported rows keep their batch position but lose the raw values.
    const imported = await tx.select({ batchId: sourceEvents.importBatchId, details: sourceEvents.details }).from(sourceEvents).where(and(eq(sourceEvents.candidateId, candidateId), sql`${sourceEvents.importBatchId} is not null`));
    for (const ev of imported) {
      const rowIndex = typeof ev.details?.row === "number" ? ev.details.row : null;
      if (ev.batchId === null || rowIndex === null) continue;
      const batch = await tx.query.importBatches.findFirst({ where: eq(importBatches.id, ev.batchId), columns: { rows: true } });
      if (!batch || !batch.rows[rowIndex]) continue;
      const rows = [...batch.rows];
      rows[rowIndex] = { __erased: "retention" };
      await tx.update(importBatches).set({ rows }).where(eq(importBatches.id, ev.batchId));
    }
    await tx.update(sourceEvents).set({ referrerName: null }).where(eq(sourceEvents.candidateId, candidateId));
    await tx
      .update(candidates)
      .set({
        firstName: "Erased",
        lastName: `profile ${candidateId.slice(0, 8)}`,
        email: null,
        phone: null,
        phoneNormalized: null,
        city: null,
        dateOfBirth: null,
        headline: null,
        summary: null,
        status: "archived",
        citizenships: [],
        passportCountry: null,
        passportExpiry: null,
        militaryRole: null,
        militaryUnit: null,
        militaryRank: null,
        militaryServiceStart: null,
        militaryServiceEnd: null,
        relocationConstraints: null,
        preferredCountries: [],
        externalRef: null,
        extractionSuggestions: null,
        retentionHoldReason: null,
        retentionHoldUntil: null,
        anonymizedAt: now,
        isDeleted: true,
      })
      .where(eq(candidates.id, candidateId));
    // Before/after deliberately hold counts only: the audit trail must not become a copy of the erased data.
    await recordAudit(tx, {
      entityType: "candidate",
      entityId: candidateId,
      action: "anonymize",
      actorId: admin.id,
      before: { reason: entry.reason, dueSince: entry.dueSince.toISOString(), lastActivityAt: entry.lastActivityAt.toISOString() },
      after: { documents: docIds.length, messages: msgs.length, activities: acts.length, tasks: openTasks.length, aiRecords: ai.length },
      note: cleanText(note) ?? undefined,
    });
    return { candidateId, documents: docIds.length, messages: msgs.length, activities: acts.length, tasks: openTasks.length, aiRecords: ai.length } satisfies ErasureResult;
  });

  // Files go last: if the database step failed we would rather keep a file than lose the record of what happened.
  for (const doc of docs) {
    try {
      await storage.remove(doc.storageKey);
    } catch (error) {
      logger.warn("retention.file_remove_failed", { documentId: doc.id, error: String(error) });
    }
  }
  logger.info("retention.erased", result);
  return result;
}
