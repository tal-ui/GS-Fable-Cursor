import "server-only";
import { and, desc, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { accounts, activities, candidates, requisitions, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { sanitizeRichText, requiredText } from "@/lib/sanitize";
import { visibilityScope } from "./scope";

export type ActivityLink = {
  candidateId?: string | null;
  accountId?: string | null;
  contactId?: string | null;
  requisitionId?: string | null;
  submissionId?: string | null;
  placementId?: string | null;
};

type ActivityType = (typeof activities.$inferInsert)["type"];

/** Records an activity (note, call, system event) against one or more related records. */
export async function logActivity(
  db: DbOrTx,
  input: ActivityLink & { type: ActivityType; subject: string; body?: string | null; actorId: string | null; occurredAt?: Date },
) {
  const [row] = await db
    .insert(activities)
    .values({
      type: input.type,
      subject: requiredText(input.subject).slice(0, 200) || "Activity",
      body: sanitizeRichText(input.body),
      candidateId: input.candidateId ?? null,
      accountId: input.accountId ?? null,
      contactId: input.contactId ?? null,
      requisitionId: input.requisitionId ?? null,
      submissionId: input.submissionId ?? null,
      placementId: input.placementId ?? null,
      actorId: input.actorId,
      createdBy: input.actorId,
      occurredAt: input.occurredAt ?? new Date(),
    })
    .returning();
  return row!;
}

export async function listActivitiesFor(link: ActivityLink, limit = 50) {
  const db = await getDb();
  const conditions: SQL[] = [];
  if (link.candidateId) conditions.push(eq(activities.candidateId, link.candidateId));
  if (link.accountId) conditions.push(eq(activities.accountId, link.accountId));
  if (link.requisitionId) conditions.push(eq(activities.requisitionId, link.requisitionId));
  if (link.submissionId) conditions.push(eq(activities.submissionId, link.submissionId));
  if (link.placementId) conditions.push(eq(activities.placementId, link.placementId));
  if (conditions.length === 0) return [];
  return db
    .select({
      id: activities.id,
      type: activities.type,
      subject: activities.subject,
      body: activities.body,
      occurredAt: activities.occurredAt,
      actorName: users.name,
      candidateId: activities.candidateId,
      accountId: activities.accountId,
      requisitionId: activities.requisitionId,
      submissionId: activities.submissionId,
      placementId: activities.placementId,
    })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.actorId))
    .where(or(...conditions))
    .orderBy(desc(activities.occurredAt))
    .limit(limit);
}

/**
 * Workspace feed. Rows are restricted to activities whose linked candidate, account or
 * requisition the caller may see (or unlinked system events), so the query itself carries the scope.
 */
export async function recentActivities(user: CurrentUser, limit = 15) {
  const db = await getDb();
  const [candScope, accScope, reqScope] = await Promise.all([
    visibilityScope(user, candidates.ownerId, candidates.isDeleted),
    visibilityScope(user, accounts.ownerId, accounts.isDeleted),
    visibilityScope(user, requisitions.ownerId, requisitions.isDeleted),
  ]);
  const rows = await db
    .select({
      id: activities.id,
      type: activities.type,
      subject: activities.subject,
      occurredAt: activities.occurredAt,
      actorName: users.name,
      candidateId: activities.candidateId,
      accountId: activities.accountId,
      requisitionId: activities.requisitionId,
      submissionId: activities.submissionId,
      placementId: activities.placementId,
      candidateName: sql<string | null>`${candidates.firstName} || ' ' || ${candidates.lastName}`,
      accountName: accounts.name,
      requisitionTitle: requisitions.title,
    })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.actorId))
    .leftJoin(candidates, eq(candidates.id, activities.candidateId))
    .leftJoin(accounts, eq(accounts.id, activities.accountId))
    .leftJoin(requisitions, eq(requisitions.id, activities.requisitionId))
    .where(
      and(
        eq(activities.isDeleted, false),
        or(
          and(isNull(activities.candidateId), isNull(activities.accountId), isNull(activities.requisitionId)),
          and(isNotNull(activities.candidateId), candScope),
          and(isNotNull(activities.accountId), accScope),
          and(isNotNull(activities.requisitionId), reqScope),
        ),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    entityLabel: r.candidateName ?? r.requisitionTitle ?? r.accountName ?? null,
    link: r.submissionId ? `/submissions/${r.submissionId}` : r.placementId ? `/placements/${r.placementId}` : r.candidateId ? `/candidates/${r.candidateId}` : r.requisitionId ? `/requisitions/${r.requisitionId}` : r.accountId ? `/accounts/${r.accountId}` : null,
  }));
}
