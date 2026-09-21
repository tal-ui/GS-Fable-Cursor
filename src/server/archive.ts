import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accounts, auditLog, candidates, placements, requisitions, submissions, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { conflict, forbiddenError, notFound } from "@/lib/errors";
import { logActivity } from "./activities";
import { OPEN_STAGES } from "./pipeline/submissions";

export type ArchivedEntity = "candidate" | "account";

const OPEN_REQUISITION_STATUSES = ["draft", "open", "on_hold"] as const;

/**
 * Archiving is a soft delete: the row leaves every list, search and matching query but keeps its
 * history. A record still doing work cannot be archived — the guard is enforced here, not in the
 * confirmation dialog — and a Super Admin can bring it back from Setup → Archived records.
 */
export async function assertCandidateArchivable(candidateId: string) {
  const db = await getDb();
  const [live] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(submissions)
    .where(and(eq(submissions.candidateId, candidateId), eq(submissions.isDeleted, false), inArray(submissions.stage, OPEN_STAGES)));
  if (live!.n > 0) throw conflict(`This candidate has ${live!.n} open submission${live!.n === 1 ? "" : "s"}. Close or withdraw them before archiving the profile.`);
  const [working] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(placements)
    .where(and(eq(placements.candidateId, candidateId), eq(placements.isDeleted, false), inArray(placements.status, ["reserved", "started", "active", "extended"])));
  if (working!.n > 0) throw conflict("This candidate has an active placement. Complete or cancel it before archiving the profile.");
}

export async function assertAccountArchivable(accountId: string) {
  const db = await getDb();
  const [open] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(requisitions)
    .where(and(eq(requisitions.accountId, accountId), eq(requisitions.isDeleted, false), inArray(requisitions.status, [...OPEN_REQUISITION_STATUSES])));
  if (open!.n > 0) throw conflict(`This account has ${open!.n} open requisition${open!.n === 1 ? "" : "s"}. Close or cancel them before archiving the account.`);
}

export type ArchivedRecord = {
  entityType: ArchivedEntity;
  id: string;
  label: string;
  detail: string | null;
  ownerName: string | null;
  archivedAt: Date | null;
  archivedByName: string | null;
};

/** Soft-deleted candidates and accounts with who archived them and when. Erased profiles live on the Retention page. */
export async function listArchived(user: CurrentUser): Promise<ArchivedRecord[]> {
  if (user.role !== "super_admin") throw forbiddenError();
  const db = await getDb();
  const [cands, accts] = await Promise.all([
    db
      .select({ id: candidates.id, firstName: candidates.firstName, lastName: candidates.lastName, email: candidates.email, headline: candidates.headline, ownerName: users.name, updatedAt: candidates.updatedAt })
      .from(candidates)
      .leftJoin(users, eq(users.id, candidates.ownerId))
      .where(and(eq(candidates.isDeleted, true), isNull(candidates.anonymizedAt), isNull(candidates.mergedIntoId)))
      .orderBy(desc(candidates.updatedAt)),
    db
      .select({ id: accounts.id, name: accounts.name, type: accounts.type, industry: accounts.industry, ownerName: users.name, updatedAt: accounts.updatedAt })
      .from(accounts)
      .leftJoin(users, eq(users.id, accounts.ownerId))
      .where(eq(accounts.isDeleted, true))
      .orderBy(desc(accounts.updatedAt)),
  ]);
  const ids = [...cands.map((c) => c.id), ...accts.map((a) => a.id)];
  const deletions = ids.length
    ? await db
        .select({ entityId: auditLog.entityId, createdAt: auditLog.createdAt, actorName: users.name })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorId))
        .where(and(inArray(auditLog.entityId, ids), eq(auditLog.action, "delete")))
        .orderBy(desc(auditLog.createdAt))
    : [];
  const latest = new Map<string, { createdAt: Date; actorName: string | null }>();
  for (const d of deletions) if (!latest.has(d.entityId)) latest.set(d.entityId, { createdAt: d.createdAt, actorName: d.actorName });

  const rows: ArchivedRecord[] = [
    ...cands.map((c) => ({
      entityType: "candidate" as const,
      id: c.id,
      label: `${c.firstName} ${c.lastName}`.trim(),
      detail: c.email ?? c.headline,
      ownerName: c.ownerName,
      archivedAt: latest.get(c.id)?.createdAt ?? c.updatedAt,
      archivedByName: latest.get(c.id)?.actorName ?? null,
    })),
    ...accts.map((a) => ({
      entityType: "account" as const,
      id: a.id,
      label: a.name,
      detail: [a.type.replace(/_/g, " "), a.industry].filter(Boolean).join(" · ") || null,
      ownerName: a.ownerName,
      archivedAt: latest.get(a.id)?.createdAt ?? a.updatedAt,
      archivedByName: latest.get(a.id)?.actorName ?? null,
    })),
  ];
  return rows.sort((x, y) => (y.archivedAt?.getTime() ?? 0) - (x.archivedAt?.getTime() ?? 0));
}

export async function archivedCount(): Promise<number> {
  const db = await getDb();
  const [[c], [a]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(candidates).where(and(eq(candidates.isDeleted, true), isNull(candidates.anonymizedAt), isNull(candidates.mergedIntoId))),
    db.select({ n: sql<number>`count(*)::int` }).from(accounts).where(eq(accounts.isDeleted, true)),
  ]);
  return c!.n + a!.n;
}

/** Reverses an archive. Super Admin only; the row's related records were never touched, so nothing else needs restoring. */
export async function restoreRecord(user: CurrentUser, input: { entityType: ArchivedEntity; id: string }) {
  if (user.role !== "super_admin") throw forbiddenError();
  const db = await getDb();
  if (input.entityType === "candidate") {
    const row = await db.query.candidates.findFirst({ where: eq(candidates.id, input.id), columns: { id: true, isDeleted: true, anonymizedAt: true, mergedIntoId: true, firstName: true, lastName: true } });
    if (!row) throw notFound("Candidate");
    if (row.anonymizedAt) throw conflict("An erased profile cannot be restored: its personal data no longer exists.");
    if (row.mergedIntoId) throw conflict("This record was merged into another profile. Undo the merge from the surviving profile instead.");
    if (!row.isDeleted) throw conflict("This candidate is not archived.");
    await db.transaction(async (tx) => {
      await tx.update(candidates).set({ isDeleted: false }).where(eq(candidates.id, row.id));
      await recordAudit(tx, { entityType: "candidate", entityId: row.id, action: "restore", actorId: user.id });
      await logActivity(tx, { type: "system", subject: "Profile restored from the archive", candidateId: row.id, actorId: user.id });
    });
    return { entityType: input.entityType, id: row.id, label: `${row.firstName} ${row.lastName}`.trim() };
  }
  const row = await db.query.accounts.findFirst({ where: eq(accounts.id, input.id), columns: { id: true, isDeleted: true, name: true } });
  if (!row) throw notFound("Account");
  if (!row.isDeleted) throw conflict("This account is not archived.");
  await db.transaction(async (tx) => {
    await tx.update(accounts).set({ isDeleted: false }).where(eq(accounts.id, row.id));
    await recordAudit(tx, { entityType: "account", entityId: row.id, action: "restore", actorId: user.id });
    await logActivity(tx, { type: "system", subject: "Account restored from the archive", accountId: row.id, actorId: user.id });
  });
  return { entityType: input.entityType, id: row.id, label: row.name };
}
