import "server-only";
import { and, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  candidateAvailability,
  candidateSkillClaims,
  candidateWorkAuthorizations,
  candidates,
  placements,
  requisitions,
  sessions,
  skills,
  submissions,
  tasks,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { emitEvent } from "./automations";
import { purgeStaleUploadLinks } from "./documents/upload-links";
import { raiseRetentionReviews } from "./retention";
import { getSettings } from "./settings";
import { createTask } from "./tasks";

const ACTIVE_STAGES = ["sourced", "contacted", "interested", "screening", "interviewing", "presented", "customer_review", "offered"] as const;

/**
 * Daily housekeeping: surfaces overdue work, stalled requests, stale availability and expiring
 * evidence as owned tasks. Every task uses a dedupe key so a re-run never duplicates work.
 */
export async function runDailyMaintenance(): Promise<Record<string, number>> {
  const db = await getDb();
  const settings = await getSettings();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekKey = `${now.getUTCFullYear()}-W${Math.ceil(((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7)}`;
  const counters: Record<string, number> = { overdueEvents: 0, stalledSubmissions: 0, stalledRequisitions: 0, staleAvailability: 0, expiringEvidence: 0, expiredClaims: 0, lateStarts: 0, expiringWorkAuth: 0, retentionReviews: 0, uploadLinksPurged: 0, sessionsPurged: 0 };

  const overdue = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.isDeleted, false), inArray(tasks.status, ["open", "in_progress"]), isNotNull(tasks.dueAt), lt(tasks.dueAt, now)));
  for (const task of overdue) {
    await emitEvent({
      trigger: "task_overdue",
      entityType: "task",
      entityId: task.id,
      eventKey: today,
      payload: { type: task.type, priority: task.priority, title: task.title },
      actorId: null,
      context: { ownerId: task.ownerId, candidateId: task.candidateId, requisitionId: task.requisitionId, submissionId: task.submissionId, label: task.title },
    });
    counters.overdueEvents!++;
  }

  const stallSub = new Date(now.getTime() - settings.submission_stall_days * 86_400_000);
  const stalledSubs = await db
    .select({ s: submissions, title: requisitions.title, first: candidates.firstName, last: candidates.lastName })
    .from(submissions)
    .innerJoin(requisitions, eq(requisitions.id, submissions.requisitionId))
    .innerJoin(candidates, eq(candidates.id, submissions.candidateId))
    .where(and(eq(submissions.isDeleted, false), inArray(submissions.stage, [...ACTIVE_STAGES]), lt(submissions.stageChangedAt, stallSub)));
  for (const row of stalledSubs) {
    const created = await createTask(db, {
      title: `Stalled: ${row.first} ${row.last} for ${row.title} (${row.s.stage.replace(/_/g, " ")} for ${settings.submission_stall_days}+ days)`,
      type: "follow_up",
      priority: "medium",
      dueAt: new Date(now.getTime() + settings.task_default_due_hours * 3_600_000),
      ownerId: row.s.ownerId,
      candidateId: row.s.candidateId,
      requisitionId: row.s.requisitionId,
      submissionId: row.s.id,
      dedupeKey: `stalled-sub:${row.s.id}:${weekKey}`,
      createdBy: null,
    });
    if (created) counters.stalledSubmissions!++;
  }

  const stallReq = new Date(now.getTime() - settings.requisition_stall_days * 86_400_000);
  const stalledReqs = await db
    .select()
    .from(requisitions)
    .where(
      and(
        eq(requisitions.isDeleted, false),
        eq(requisitions.status, "open"),
        lt(requisitions.updatedAt, stallReq),
        sql`not exists (select 1 from ${submissions} s where s.requisition_id = ${requisitions.id} and s.is_deleted = false and s.stage_changed_at > ${stallReq})`,
      ),
    );
  for (const r of stalledReqs) {
    const created = await createTask(db, {
      title: `No pipeline movement on "${r.title}" for ${settings.requisition_stall_days}+ days`,
      type: "stalled_request",
      priority: r.priority === "urgent" ? "urgent" : "high",
      dueAt: new Date(now.getTime() + settings.task_default_due_hours * 3_600_000),
      ownerId: r.ownerId,
      requisitionId: r.id,
      accountId: r.accountId,
      dedupeKey: `stalled-req:${r.id}:${weekKey}`,
      createdBy: null,
    });
    if (created) counters.stalledRequisitions!++;
  }

  const staleCutoff = new Date(now.getTime() - settings.availability_freshness_days * 86_400_000);
  const stale = await db
    .select({ c: candidates, a: candidateAvailability })
    .from(candidates)
    .leftJoin(candidateAvailability, and(eq(candidateAvailability.candidateId, candidates.id), eq(candidateAvailability.isCurrent, true), eq(candidateAvailability.isDeleted, false)))
    .where(
      and(
        eq(candidates.isDeleted, false),
        inArray(candidates.status, ["active", "screening"]),
        isNull(candidates.mergedIntoId),
        or(isNull(candidateAvailability.lastConfirmedAt), lt(candidateAvailability.lastConfirmedAt, staleCutoff)),
      ),
    );
  const monthKey = today.slice(0, 7);
  for (const row of stale) {
    const created = await createTask(db, {
      title: `Reconfirm availability: ${row.c.firstName} ${row.c.lastName}`,
      description: row.a?.lastConfirmedAt ? `Last confirmed ${row.a.lastConfirmedAt.toISOString().slice(0, 10)}` : "Availability never confirmed",
      type: "availability_check",
      priority: "low",
      dueAt: new Date(now.getTime() + 7 * 86_400_000),
      ownerId: row.c.ownerId,
      candidateId: row.c.id,
      dedupeKey: `stale-avail:${row.c.id}:${monthKey}`,
      createdBy: null,
    });
    if (created) counters.staleAvailability!++;
  }

  const expiredClaims = await db
    .update(candidateSkillClaims)
    .set({ verificationStatus: "expired" })
    .where(and(eq(candidateSkillClaims.isDeleted, false), eq(candidateSkillClaims.verificationStatus, "verified"), isNotNull(candidateSkillClaims.expiresAt), lt(candidateSkillClaims.expiresAt, today)))
    .returning({ id: candidateSkillClaims.id, candidateId: candidateSkillClaims.candidateId });
  counters.expiredClaims = expiredClaims.length;

  const soon = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  const expiring = await db
    .select({ claim: candidateSkillClaims, skillName: skills.name, c: candidates })
    .from(candidateSkillClaims)
    .innerJoin(skills, eq(skills.id, candidateSkillClaims.skillId))
    .innerJoin(candidates, eq(candidates.id, candidateSkillClaims.candidateId))
    .where(and(eq(candidateSkillClaims.isDeleted, false), inArray(candidateSkillClaims.verificationStatus, ["verified", "expired"]), isNotNull(candidateSkillClaims.expiresAt), lte(candidateSkillClaims.expiresAt, soon)));
  for (const row of expiring) {
    const created = await createTask(db, {
      title: `${row.skillName} evidence for ${row.c.firstName} ${row.c.lastName} ${row.claim.verificationStatus === "expired" ? "has expired" : `expires ${row.claim.expiresAt}`}`,
      type: "verification",
      priority: row.claim.verificationStatus === "expired" ? "high" : "medium",
      dueAt: new Date(now.getTime() + 7 * 86_400_000),
      ownerId: row.c.ownerId,
      candidateId: row.c.id,
      dedupeKey: `expiring-claim:${row.claim.id}:${row.claim.expiresAt}`,
      createdBy: null,
    });
    if (created) counters.expiringEvidence!++;
  }

  const authSoon = new Date(now.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
  const expiringAuth = await db
    .select({ w: candidateWorkAuthorizations, c: candidates })
    .from(candidateWorkAuthorizations)
    .innerJoin(candidates, eq(candidates.id, candidateWorkAuthorizations.candidateId))
    .where(
      and(
        eq(candidateWorkAuthorizations.isDeleted, false),
        isNotNull(candidateWorkAuthorizations.validUntil),
        lte(candidateWorkAuthorizations.validUntil, authSoon),
        sql`exists (select 1 from ${placements} p where p.candidate_id = ${candidates.id} and p.is_deleted = false and p.status in ('reserved','started','active'))`,
      ),
    );
  for (const row of expiringAuth) {
    const created = await createTask(db, {
      title: `Work authorisation (${row.w.country}) for ${row.c.firstName} ${row.c.lastName} expires ${row.w.validUntil}`,
      type: "verification",
      priority: "high",
      dueAt: new Date(now.getTime() + 7 * 86_400_000),
      ownerId: row.c.ownerId,
      candidateId: row.c.id,
      dedupeKey: `expiring-auth:${row.w.id}:${row.w.validUntil}`,
      createdBy: null,
    });
    if (created) counters.expiringWorkAuth!++;
  }

  const lateCutoff = new Date(now.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
  const late = await db
    .select({ p: placements, first: candidates.firstName, last: candidates.lastName })
    .from(placements)
    .innerJoin(candidates, eq(candidates.id, placements.candidateId))
    .where(and(eq(placements.isDeleted, false), eq(placements.status, "reserved"), lt(placements.plannedStart, lateCutoff)));
  for (const row of late) {
    const created = await createTask(db, {
      title: `Confirm start: ${row.first} ${row.last} was due to start ${row.p.plannedStart}`,
      type: "placement_checklist",
      priority: "high",
      dueAt: new Date(now.getTime() + 24 * 3_600_000),
      ownerId: row.p.ownerId,
      candidateId: row.p.candidateId,
      placementId: row.p.id,
      requisitionId: row.p.requisitionId,
      dedupeKey: `late-start:${row.p.id}:${weekKey}`,
      createdBy: null,
    });
    if (created) counters.lateStarts!++;
  }

  counters.retentionReviews = await raiseRetentionReviews(db, now);
  counters.uploadLinksPurged = await purgeStaleUploadLinks(db);

  const purged = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
  counters.sessionsPurged = purged.length;

  await emitEvent({ trigger: "schedule_daily", entityType: "system", entityId: "00000000-0000-0000-0000-000000000000", eventKey: today, payload: counters, actorId: null, context: {} });
  logger.info("maintenance.daily_done", counters);
  return counters;
}
