import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { getDb, type DbOrTx } from "@/db/client";
import { accounts, candidateAvailability, candidates, placements, requisitions, submissionStageHistory, submissions, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { conflict, forbiddenError, notFound, validation } from "@/lib/errors";
import { cleanText, sanitizeRichText } from "@/lib/sanitize";
import type {
  placementCancelSchema,
  placementChecklistSchema,
  placementCompleteSchema,
  placementExtendSchema,
  placementReplaceSchema,
  placementStartSchema,
  placementUpdateSchema,
} from "@/lib/schemas/pipeline";
import { listActivitiesFor, logActivity } from "../activities";
import { emitEvent } from "../automations";
import { paginate, type ListParams } from "../list";
import { canEditRecord, visibilityScope } from "../scope";
import { createTask } from "../tasks";
import { reserveSeat } from "./seats";

type PlacementStatus = typeof placements.$inferSelect.status;

const SORTABLE = {
  status: placements.status,
  plannedStart: placements.plannedStart,
  plannedEnd: placements.plannedEnd,
  createdAt: placements.createdAt,
  updatedAt: placements.updatedAt,
} as const;

export async function listPlacements(user: CurrentUser, params: ListParams) {
  const db = await getDb();
  const scope = await visibilityScope(user, placements.ownerId, placements.isDeleted);
  const where: SQL[] = [scope];
  const f = params.filters;
  if (f.status) where.push(inArray(placements.status, f.status.split(",") as PlacementStatus[]));
  if (f.account) where.push(eq(placements.accountId, f.account));
  if (f.requisition) where.push(eq(placements.requisitionId, f.requisition));
  if (f.candidate) where.push(eq(placements.candidateId, f.candidate));
  if (f.owner) where.push(eq(placements.ownerId, f.owner));
  if (f.startingSoon === "true") where.push(sql`${placements.status} = 'reserved' and ${placements.plannedStart} <= (current_date + interval '14 days')`);
  if (params.q) {
    const q = `%${params.q}%`;
    where.push(or(ilike(candidates.firstName, q), ilike(candidates.lastName, q), ilike(requisitions.title, q), ilike(accounts.name, q))!);
  }
  const sortCol = SORTABLE[(params.sort as keyof typeof SORTABLE) ?? "plannedStart"] ?? placements.plannedStart;
  const order = params.dir === "asc" ? asc(sortCol) : desc(sortCol);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: placements.id,
        status: placements.status,
        plannedStart: placements.plannedStart,
        plannedEnd: placements.plannedEnd,
        actualStart: placements.actualStart,
        actualEnd: placements.actualEnd,
        candidateId: placements.candidateId,
        candidateName: sql<string>`${candidates.firstName} || ' ' || ${candidates.lastName}`,
        requisitionId: placements.requisitionId,
        requisitionTitle: requisitions.title,
        accountId: placements.accountId,
        accountName: accounts.name,
        ownerId: placements.ownerId,
        ownerName: users.name,
        billRateAmount: placements.billRateAmount,
        billRateCurrency: placements.billRateCurrency,
        billRatePeriod: placements.billRatePeriod,
        checklistDone: sql<number>`(select count(*)::int from jsonb_array_elements(${placements.checklist}) c where (c->>'done')::boolean = true)`,
        checklistTotal: sql<number>`jsonb_array_length(${placements.checklist})`,
        createdAt: placements.createdAt,
        updatedAt: placements.updatedAt,
      })
      .from(placements)
      .innerJoin(candidates, eq(candidates.id, placements.candidateId))
      .innerJoin(requisitions, eq(requisitions.id, placements.requisitionId))
      .innerJoin(accounts, eq(accounts.id, placements.accountId))
      .leftJoin(users, eq(users.id, placements.ownerId))
      .where(and(...where))
      .orderBy(order, desc(placements.updatedAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db
      .select({ total: count() })
      .from(placements)
      .innerJoin(candidates, eq(candidates.id, placements.candidateId))
      .innerJoin(requisitions, eq(requisitions.id, placements.requisitionId))
      .innerJoin(accounts, eq(accounts.id, placements.accountId))
      .where(and(...where)),
  ]);
  return paginate(rows, total, params);
}

export type PlacementListRow = Awaited<ReturnType<typeof listPlacements>>["rows"][number];

export async function getPlacement(user: CurrentUser, id: string) {
  const db = await getDb();
  const scope = await visibilityScope(user, placements.ownerId, placements.isDeleted);
  const row = await db.query.placements.findFirst({ where: and(eq(placements.id, id), scope) });
  if (!row) throw notFound("Placement");
  return row;
}

export async function getPlacementDetail(user: CurrentUser, id: string) {
  const db = await getDb();
  const placement = await getPlacement(user, id);
  const [candidate, requisition, account, owner, submission, replacementOf, extensionOf, replacedBy, activities] = await Promise.all([
    db.query.candidates.findFirst({ where: eq(candidates.id, placement.candidateId) }),
    db.query.requisitions.findFirst({ where: eq(requisitions.id, placement.requisitionId) }),
    db.query.accounts.findFirst({ where: eq(accounts.id, placement.accountId) }),
    placement.ownerId ? db.query.users.findFirst({ where: eq(users.id, placement.ownerId), columns: { id: true, name: true, email: true, avatarUrl: true } }) : null,
    db.query.submissions.findFirst({ where: eq(submissions.id, placement.submissionId) }),
    placement.replacementOfId ? db.query.placements.findFirst({ where: eq(placements.id, placement.replacementOfId) }) : null,
    placement.extensionOfId ? db.query.placements.findFirst({ where: eq(placements.id, placement.extensionOfId) }) : null,
    db.query.placements.findFirst({ where: and(eq(placements.replacementOfId, id), eq(placements.isDeleted, false)) }),
    listActivitiesFor({ placementId: id }),
  ]);
  if (!candidate || !requisition || !account || !submission) throw notFound("Placement");
  return { placement, candidate, requisition, account, owner: owner ?? null, submission, replacementOf: replacementOf ?? null, extensionOf: extensionOf ?? null, replacedBy: replacedBy ?? null, activities };
}

export type PlacementDetail = Awaited<ReturnType<typeof getPlacementDetail>>;

async function ensureEditable(user: CurrentUser, id: string) {
  const p = await getPlacement(user, id);
  if (!(await canEditRecord(user, p.ownerId))) throw forbiddenError();
  return p;
}

async function setSubmissionStage(tx: DbOrTx, submissionId: string, to: typeof submissions.$inferSelect.stage, actorId: string, reason?: typeof submissionStageHistory.$inferInsert.reason, notes?: string | null) {
  const sub = await tx.query.submissions.findFirst({ where: eq(submissions.id, submissionId) });
  if (!sub || sub.stage === to) return;
  const closing = ["placed", "declined_by_candidate", "rejected_by_customer", "withdrawn", "not_eligible"].includes(to);
  await tx.update(submissions).set({ stage: to, stageChangedAt: new Date(), closedAt: closing ? new Date() : null, decisionReason: reason ?? null, decisionNotes: notes ?? null }).where(eq(submissions.id, submissionId));
  await tx.insert(submissionStageHistory).values({ submissionId, fromStage: sub.stage, toStage: to, reason: reason ?? null, notes: notes ?? null, changedById: actorId });
}

/** After completion or cancellation the candidate's availability must be re-confirmed before future matching relies on it. */
async function promptAvailabilityRecheck(tx: DbOrTx, placement: typeof placements.$inferSelect, actorId: string, why: string) {
  await tx
    .update(candidateAvailability)
    .set({ lastConfirmedAt: null, notes: sql`coalesce(${candidateAvailability.notes}, '') || ${` Re-confirmation required: ${why}.`}` })
    .where(and(eq(candidateAvailability.candidateId, placement.candidateId), eq(candidateAvailability.isCurrent, true), eq(candidateAvailability.isDeleted, false)));
  await createTask(tx, {
    title: `Re-confirm availability after ${why}`,
    description: "The candidate's assignment ended or was cancelled. Confirm new availability dates before matching them again.",
    type: "availability_check",
    priority: "medium",
    dueAt: new Date(Date.now() + 72 * 3_600_000),
    ownerId: placement.ownerId ?? actorId,
    candidateId: placement.candidateId,
    placementId: placement.id,
    dedupeKey: `avail-recheck:${placement.id}:${placement.status}`,
    createdBy: actorId,
  });
}

async function emitPlacementEvent(placement: typeof placements.$inferSelect, from: PlacementStatus, to: PlacementStatus, actorId: string, label: string) {
  await emitEvent({
    trigger: "placement_status_changed",
    entityType: "placement",
    entityId: placement.id,
    eventKey: `${from}->${to}`,
    payload: { fromStatus: from, toStatus: to },
    actorId,
    context: { ownerId: placement.ownerId, candidateId: placement.candidateId, requisitionId: placement.requisitionId, accountId: placement.accountId, submissionId: placement.submissionId, placementId: placement.id, label },
  });
}

export async function updatePlacement(user: CurrentUser, input: z.output<typeof placementUpdateSchema>) {
  const db = await getDb();
  const before = await ensureEditable(user, input.id);
  const { id, ...patch } = input;
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) values[k] = v;
  for (const key of ["billRateAmount", "payRateAmount"]) if (key in values && values[key] !== null) values[key] = String(values[key]);
  if ("notes" in values) values.notes = sanitizeRichText(values.notes as string | null);
  if (Object.keys(values).length === 0) return before;
  const [after] = await db.update(placements).set(values).where(eq(placements.id, id)).returning();
  await recordAudit(db, { entityType: "placement", entityId: id, action: "update", actorId: user.id, before: before as unknown as Record<string, unknown>, after: values });
  return after!;
}

/** The actual start fills the reserved seat and moves the submission to placed. */
export async function startPlacement(user: CurrentUser, input: z.output<typeof placementStartSchema>) {
  const db = await getDb();
  const p = await ensureEditable(user, input.id);
  if (p.status !== "reserved") throw conflict(`Only reserved placements can be started (current: ${p.status}).`);
  const [row] = await db.transaction(async (tx) => {
    const updated = await tx.update(placements).set({ status: "started", actualStart: input.actualStart }).where(eq(placements.id, p.id)).returning();
    await setSubmissionStage(tx, p.submissionId, "placed", user.id);
    await tx.update(candidates).set({ status: "placed" }).where(eq(candidates.id, p.candidateId));
    await logActivity(tx, { type: "status_change", subject: `Placement started on ${input.actualStart}`, placementId: p.id, submissionId: p.submissionId, candidateId: p.candidateId, requisitionId: p.requisitionId, accountId: p.accountId, actorId: user.id });
    await recordAudit(tx, { entityType: "placement", entityId: p.id, action: "update", actorId: user.id, before: { status: "reserved" }, after: { status: "started", actualStart: input.actualStart } });
    return updated;
  });
  await emitPlacementEvent(row!, "reserved", "started", user.id, "started");
  await maybeMarkFilled(db, p.requisitionId, user.id);
  return row!;
}

export async function activatePlacement(user: CurrentUser, id: string) {
  const db = await getDb();
  const p = await ensureEditable(user, id);
  if (p.status !== "started") throw conflict("Only started placements can be marked active.");
  const [row] = await db.update(placements).set({ status: "active" }).where(eq(placements.id, id)).returning();
  await logActivity(db, { type: "status_change", subject: "Placement confirmed active (probation passed)", placementId: id, candidateId: p.candidateId, requisitionId: p.requisitionId, actorId: user.id });
  return row!;
}

export async function completePlacement(user: CurrentUser, input: z.output<typeof placementCompleteSchema>) {
  const db = await getDb();
  const p = await ensureEditable(user, input.id);
  if (!["started", "active", "extended"].includes(p.status)) throw conflict(`Only working placements can be completed (current: ${p.status}).`);
  const [row] = await db.transaction(async (tx) => {
    const updated = await tx.update(placements).set({ status: "completed", actualEnd: input.actualEnd, notes: input.notes ? sql`coalesce(${placements.notes}, '') || ${"\n" + cleanText(input.notes)}` : p.notes }).where(eq(placements.id, p.id)).returning();
    await tx.update(candidates).set({ status: "active" }).where(and(eq(candidates.id, p.candidateId), eq(candidates.status, "placed")));
    await promptAvailabilityRecheck(tx, updated[0]!, user.id, "placement completion");
    await logActivity(tx, { type: "status_change", subject: `Placement completed on ${input.actualEnd}; seat released`, body: input.notes, placementId: p.id, submissionId: p.submissionId, candidateId: p.candidateId, requisitionId: p.requisitionId, accountId: p.accountId, actorId: user.id });
    await recordAudit(tx, { entityType: "placement", entityId: p.id, action: "release_seat", actorId: user.id, before: { status: p.status }, after: { status: "completed", actualEnd: input.actualEnd } });
    return updated;
  });
  await emitPlacementEvent(row!, p.status, "completed", user.id, "completed");
  return row!;
}

export async function extendPlacement(user: CurrentUser, input: z.output<typeof placementExtendSchema>) {
  const db = await getDb();
  const p = await ensureEditable(user, input.id);
  if (!["started", "active", "extended"].includes(p.status)) throw conflict("Only working placements can be extended.");
  const currentEnd = p.actualEnd ?? p.plannedEnd;
  if (currentEnd && input.newPlannedEnd <= currentEnd) throw validation("The new end date must be after the current end date.");
  const [row] = await db.transaction(async (tx) => {
    const updated = await tx.update(placements).set({ status: "extended", plannedEnd: input.newPlannedEnd }).where(eq(placements.id, p.id)).returning();
    await logActivity(tx, { type: "status_change", subject: `Placement extended to ${input.newPlannedEnd}${currentEnd ? ` (was ${currentEnd})` : ""}`, body: input.notes, placementId: p.id, candidateId: p.candidateId, requisitionId: p.requisitionId, accountId: p.accountId, actorId: user.id });
    await recordAudit(tx, { entityType: "placement", entityId: p.id, action: "update", actorId: user.id, before: { plannedEnd: p.plannedEnd, status: p.status }, after: { plannedEnd: input.newPlannedEnd, status: "extended" } });
    return updated;
  });
  await emitPlacementEvent(row!, p.status, "extended", user.id, "extended");
  return row!;
}

/** Cancellation releases the seat and prompts an availability recheck. */
export async function cancelPlacement(user: CurrentUser, input: z.output<typeof placementCancelSchema>) {
  const db = await getDb();
  const p = await ensureEditable(user, input.id);
  if (["completed", "cancelled", "replaced"].includes(p.status)) throw conflict(`This placement is already ${p.status}.`);
  const subStage = input.reason === "candidate_withdrew" ? "declined_by_candidate" : input.reason === "customer_cancelled" ? "rejected_by_customer" : "withdrawn";
  const subReason = input.reason === "candidate_withdrew" ? "candidate_withdrew" : input.reason === "customer_cancelled" ? "customer_preference" : "other";
  const [row] = await db.transaction(async (tx) => {
    const updated = await tx
      .update(placements)
      .set({ status: "cancelled", cancellationReason: input.reason, cancellationNotes: cleanText(input.notes), actualEnd: p.actualStart ? new Date().toISOString().slice(0, 10) : null })
      .where(eq(placements.id, p.id))
      .returning();
    await setSubmissionStage(tx, p.submissionId, subStage, user.id, subReason, cleanText(input.notes));
    await tx.update(candidates).set({ status: "active" }).where(and(eq(candidates.id, p.candidateId), eq(candidates.status, "placed")));
    await promptAvailabilityRecheck(tx, updated[0]!, user.id, "placement cancellation");
    await logActivity(tx, { type: "status_change", subject: `Placement cancelled (${input.reason.replace(/_/g, " ")}); seat released`, body: input.notes, placementId: p.id, submissionId: p.submissionId, candidateId: p.candidateId, requisitionId: p.requisitionId, accountId: p.accountId, actorId: user.id });
    await recordAudit(tx, { entityType: "placement", entityId: p.id, action: "release_seat", actorId: user.id, before: { status: p.status }, after: { status: "cancelled", reason: input.reason } });
    return updated;
  });
  await emitPlacementEvent(row!, p.status, "cancelled", user.id, "cancelled");
  await reopenIfFilled(db, p.requisitionId, user.id);
  return row!;
}

/** Replacement: the old placement releases its seat and the replacement takes it in one transaction. */
export async function replacePlacement(user: CurrentUser, input: z.output<typeof placementReplaceSchema>) {
  const db = await getDb();
  const p = await ensureEditable(user, input.id);
  if (["completed", "cancelled", "replaced"].includes(p.status)) throw conflict(`This placement is already ${p.status}.`);
  const replacement = await db.query.submissions.findFirst({ where: and(eq(submissions.id, input.replacementSubmissionId), eq(submissions.isDeleted, false)) });
  if (!replacement) throw notFound("Replacement submission");
  if (replacement.requisitionId !== p.requisitionId) throw validation("The replacement must be a submission on the same requisition.");
  if (replacement.candidateId === p.candidateId) throw validation("Choose a different candidate as the replacement.");
  if (!["offered", "accepted", "customer_review", "presented"].includes(replacement.stage)) throw validation("The replacement candidate must be at least presented to the customer.");
  const req = await db.query.requisitions.findFirst({ where: eq(requisitions.id, p.requisitionId) });
  if (!req) throw notFound("Requisition");
  const newId = await db.transaction(async (tx) => {
    await tx.update(placements).set({ status: "replaced", cancellationReason: input.reason, cancellationNotes: cleanText(input.notes), actualEnd: p.actualStart ? new Date().toISOString().slice(0, 10) : null }).where(eq(placements.id, p.id));
    await setSubmissionStage(tx, p.submissionId, "withdrawn", user.id, "other", `Replaced: ${input.reason.replace(/_/g, " ")}`);
    await tx.update(candidates).set({ status: "active" }).where(and(eq(candidates.id, p.candidateId), eq(candidates.status, "placed")));
    await promptAvailabilityRecheck(tx, { ...p, status: "replaced" }, user.id, "replacement");
    const created = await reserveSeat(tx, {
      requisitionId: p.requisitionId,
      submissionId: replacement.id,
      candidateId: replacement.candidateId,
      accountId: p.accountId,
      plannedStart: input.plannedStart,
      plannedEnd: p.plannedEnd,
      ownerId: p.ownerId,
      actorId: user.id,
      replacementOfId: p.id,
      terms: { billRateAmount: p.billRateAmount, billRateCurrency: p.billRateCurrency, billRatePeriod: p.billRatePeriod, payRateAmount: p.payRateAmount, payRateCurrency: p.payRateCurrency, payRatePeriod: p.payRatePeriod, grossNet: p.grossNet },
    });
    await tx.update(submissions).set({ stage: "accepted", stageChangedAt: new Date(), acceptedAt: new Date() }).where(eq(submissions.id, replacement.id));
    await tx.insert(submissionStageHistory).values({ submissionId: replacement.id, fromStage: replacement.stage, toStage: "accepted", notes: `Replacement for placement ${p.id}`, changedById: user.id });
    await logActivity(tx, { type: "status_change", subject: `Replaced by another candidate (${input.reason.replace(/_/g, " ")})`, body: input.notes, placementId: p.id, candidateId: p.candidateId, requisitionId: p.requisitionId, accountId: p.accountId, actorId: user.id });
    await logActivity(tx, { type: "system", subject: `Seat reserved as replacement (planned start ${input.plannedStart})`, placementId: created.id, submissionId: replacement.id, candidateId: replacement.candidateId, requisitionId: p.requisitionId, accountId: p.accountId, actorId: user.id });
    await recordAudit(tx, { entityType: "placement", entityId: p.id, action: "release_seat", actorId: user.id, before: { status: p.status }, after: { status: "replaced", replacedBy: created.id } });
    await recordAudit(tx, { entityType: "placement", entityId: created.id, action: "reserve_seat", actorId: user.id, after: { replacementOf: p.id, candidateId: replacement.candidateId } });
    return created.id;
  });
  await emitPlacementEvent({ ...p, status: "replaced" }, p.status, "replaced", user.id, "replaced");
  return newId;
}

export async function togglePlacementChecklist(user: CurrentUser, input: z.output<typeof placementChecklistSchema>) {
  const db = await getDb();
  const p = await ensureEditable(user, input.id);
  const checklist = p.checklist.map((c) => (c.key === input.key ? { ...c, done: input.done, doneAt: input.done ? new Date().toISOString() : null } : c));
  const [row] = await db.update(placements).set({ checklist }).where(eq(placements.id, p.id)).returning();
  return row!;
}

async function maybeMarkFilled(db: DbOrTx, requisitionId: string, actorId: string) {
  const req = await db.query.requisitions.findFirst({ where: eq(requisitions.id, requisitionId) });
  if (!req || req.status !== "open") return;
  const [taken] = await db.select({ n: count() }).from(placements).where(and(eq(placements.requisitionId, requisitionId), eq(placements.isDeleted, false), inArray(placements.status, ["reserved", "started", "active", "extended"])));
  if ((taken?.n ?? 0) >= req.headcountApproved) {
    await db.update(requisitions).set({ status: "filled" }).where(eq(requisitions.id, requisitionId));
    await logActivity(db, { type: "status_change", subject: "All seats filled — requisition marked filled", requisitionId, accountId: req.accountId, actorId });
  }
}

async function reopenIfFilled(db: DbOrTx, requisitionId: string, actorId: string) {
  const req = await db.query.requisitions.findFirst({ where: eq(requisitions.id, requisitionId) });
  if (!req || req.status !== "filled") return;
  await db.update(requisitions).set({ status: "open" }).where(eq(requisitions.id, requisitionId));
  await logActivity(db, { type: "status_change", subject: "Seat released — requisition reopened", requisitionId, accountId: req.accountId, actorId });
}
