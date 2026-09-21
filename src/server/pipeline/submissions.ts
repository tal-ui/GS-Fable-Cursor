import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { getDb, type DbOrTx } from "@/db/client";
import {
  accounts,
  candidateAvailability,
  candidates,
  contacts,
  disclosures,
  documents,
  interviews,
  placements,
  requisitions,
  submissionStageHistory,
  submissions,
  users,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { AppError, conflict, forbiddenError, notFound, validation } from "@/lib/errors";
import { cleanText, sanitizeRichText } from "@/lib/sanitize";
import type { confirmInterestSchema, createSubmissionSchema, stageChangeSchema } from "@/lib/schemas/pipeline";
import { listActivitiesFor, logActivity } from "../activities";
import { emitEvent } from "../automations";
import { activeConsent } from "../consents";
import { paginate, type ListParams } from "../list";
import { snapshotFor, toSnapshot } from "../matching";
import { recentMessagesFor } from "../messaging/outreach";
import { canEditRecord, visibilityScope } from "../scope";
import { getSettings } from "../settings";
import { detectOverlap, reserveSeat } from "./seats";

export type Stage = typeof submissions.$inferSelect.stage;

export const OPEN_STAGES: Stage[] = ["sourced", "contacted", "interested", "screening", "interviewing", "presented", "customer_review", "offered", "accepted"];
export const CLOSED_STAGES: Stage[] = ["placed", "declined_by_candidate", "rejected_by_customer", "withdrawn", "not_eligible"];

/** Allowed forward/backward moves. Terminal stages can only be reopened to `sourced`. */
const TRANSITIONS: Record<Stage, Stage[]> = {
  sourced: ["contacted", "interested", "screening", "withdrawn", "not_eligible", "declined_by_candidate"],
  contacted: ["interested", "screening", "sourced", "withdrawn", "not_eligible", "declined_by_candidate"],
  interested: ["screening", "interviewing", "presented", "contacted", "withdrawn", "not_eligible", "declined_by_candidate"],
  screening: ["interviewing", "presented", "interested", "withdrawn", "not_eligible", "declined_by_candidate"],
  interviewing: ["presented", "screening", "withdrawn", "not_eligible", "declined_by_candidate", "rejected_by_customer"],
  presented: ["customer_review", "offered", "interviewing", "withdrawn", "not_eligible", "declined_by_candidate", "rejected_by_customer"],
  customer_review: ["offered", "interviewing", "presented", "withdrawn", "not_eligible", "declined_by_candidate", "rejected_by_customer"],
  offered: ["accepted", "customer_review", "withdrawn", "declined_by_candidate", "rejected_by_customer", "not_eligible"],
  accepted: ["placed", "withdrawn", "declined_by_candidate", "rejected_by_customer"],
  placed: [],
  declined_by_candidate: ["sourced"],
  rejected_by_customer: ["sourced"],
  withdrawn: ["sourced"],
  not_eligible: ["sourced"],
};

export function canTransition(from: Stage, to: Stage): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

const SORTABLE = {
  stage: submissions.stage,
  stageChangedAt: submissions.stageChangedAt,
  matchScore: submissions.matchScore,
  eligibility: submissions.eligibility,
  createdAt: submissions.createdAt,
  updatedAt: submissions.updatedAt,
} as const;

export async function listSubmissions(user: CurrentUser, params: ListParams) {
  const db = await getDb();
  const scope = await visibilityScope(user, submissions.ownerId, submissions.isDeleted);
  const where: SQL[] = [scope];
  const f = params.filters;
  if (f.stage) where.push(inArray(submissions.stage, f.stage.split(",") as Stage[]));
  else if (f.includeClosed !== "true") where.push(inArray(submissions.stage, OPEN_STAGES));
  if (f.eligibility) where.push(eq(submissions.eligibility, f.eligibility as typeof submissions.$inferSelect.eligibility));
  if (f.requisition) where.push(eq(submissions.requisitionId, f.requisition));
  if (f.candidate) where.push(eq(submissions.candidateId, f.candidate));
  if (f.account) where.push(eq(requisitions.accountId, f.account));
  if (f.owner) where.push(eq(submissions.ownerId, f.owner));
  if (f.stalled === "true") {
    const s = await getSettings();
    where.push(sql`${submissions.stageChangedAt} < ${new Date(Date.now() - s.submission_stall_days * 86_400_000)}`);
  }
  if (params.q) {
    const q = `%${params.q}%`;
    where.push(or(ilike(candidates.firstName, q), ilike(candidates.lastName, q), ilike(requisitions.title, q), ilike(accounts.name, q))!);
  }
  const sortCol = SORTABLE[(params.sort as keyof typeof SORTABLE) ?? "stageChangedAt"] ?? submissions.stageChangedAt;
  const order = params.dir === "asc" ? asc(sortCol) : desc(sortCol);
  const base = db
    .select({
      id: submissions.id,
      stage: submissions.stage,
      eligibility: submissions.eligibility,
      matchScore: submissions.matchScore,
      stageChangedAt: submissions.stageChangedAt,
      createdAt: submissions.createdAt,
      candidateId: submissions.candidateId,
      candidateName: sql<string>`${candidates.firstName} || ' ' || ${candidates.lastName}`,
      candidateHeadline: candidates.headline,
      requisitionId: submissions.requisitionId,
      requisitionTitle: requisitions.title,
      accountId: requisitions.accountId,
      accountName: accounts.name,
      ownerId: submissions.ownerId,
      ownerName: users.name,
      interestConfirmedAt: submissions.interestConfirmedAt,
      presentedAt: submissions.presentedAt,
      hasSharingConsent: sql<boolean>`${submissions.sharingConsentId} is not null`,
    })
    .from(submissions)
    .innerJoin(candidates, eq(candidates.id, submissions.candidateId))
    .innerJoin(requisitions, eq(requisitions.id, submissions.requisitionId))
    .innerJoin(accounts, eq(accounts.id, requisitions.accountId))
    .leftJoin(users, eq(users.id, submissions.ownerId))
    .where(and(...where));
  const [rows, [{ total }]] = await Promise.all([
    base.orderBy(order, desc(submissions.updatedAt)).limit(params.pageSize).offset((params.page - 1) * params.pageSize),
    db
      .select({ total: count() })
      .from(submissions)
      .innerJoin(candidates, eq(candidates.id, submissions.candidateId))
      .innerJoin(requisitions, eq(requisitions.id, submissions.requisitionId))
      .innerJoin(accounts, eq(accounts.id, requisitions.accountId))
      .where(and(...where)),
  ]);
  return paginate(rows, total, params);
}

export type SubmissionListRow = Awaited<ReturnType<typeof listSubmissions>>["rows"][number];

export async function getSubmission(user: CurrentUser, id: string) {
  const db = await getDb();
  const scope = await visibilityScope(user, submissions.ownerId, submissions.isDeleted);
  const row = await db.query.submissions.findFirst({ where: and(eq(submissions.id, id), scope) });
  if (!row) throw notFound("Submission");
  return row;
}

export async function getSubmissionDetail(user: CurrentUser, id: string) {
  const db = await getDb();
  const submission = await getSubmission(user, id);
  const [candidate, requisition, owner, history, interviewRows, disclosureRows, placement, activities, messages, availability, sharingConsent, communicateConsent, docs] = await Promise.all([
    db.query.candidates.findFirst({ where: eq(candidates.id, submission.candidateId) }),
    db
      .select({ requisition: requisitions, accountName: accounts.name, accountId: accounts.id })
      .from(requisitions)
      .innerJoin(accounts, eq(accounts.id, requisitions.accountId))
      .where(eq(requisitions.id, submission.requisitionId))
      .then((r) => r[0] ?? null),
    submission.ownerId ? db.query.users.findFirst({ where: eq(users.id, submission.ownerId), columns: { id: true, name: true, email: true, avatarUrl: true } }) : null,
    db
      .select({ history: submissionStageHistory, changedByName: users.name })
      .from(submissionStageHistory)
      .leftJoin(users, eq(users.id, submissionStageHistory.changedById))
      .where(eq(submissionStageHistory.submissionId, id))
      .orderBy(desc(submissionStageHistory.createdAt)),
    db
      .select({ interview: interviews, interviewerName: users.name, contactName: sql<string | null>`${contacts.firstName} || ' ' || ${contacts.lastName}` })
      .from(interviews)
      .leftJoin(users, eq(users.id, interviews.interviewerId))
      .leftJoin(contacts, eq(contacts.id, interviews.customerContactId))
      .where(and(eq(interviews.submissionId, id), eq(interviews.isDeleted, false)))
      .orderBy(desc(interviews.scheduledAt)),
    db
      .select({ disclosure: disclosures, sharedByName: users.name, contactName: sql<string | null>`${contacts.firstName} || ' ' || ${contacts.lastName}` })
      .from(disclosures)
      .leftJoin(users, eq(users.id, disclosures.sharedById))
      .leftJoin(contacts, eq(contacts.id, disclosures.contactId))
      .where(and(eq(disclosures.submissionId, id), eq(disclosures.isDeleted, false)))
      .orderBy(desc(disclosures.sharedAt)),
    db.query.placements.findFirst({ where: and(eq(placements.submissionId, id), eq(placements.isDeleted, false)), orderBy: desc(placements.createdAt) }),
    listActivitiesFor({ submissionId: id }),
    recentMessagesFor(submission.candidateId, 10),
    db.query.candidateAvailability.findFirst({ where: and(eq(candidateAvailability.candidateId, submission.candidateId), eq(candidateAvailability.isCurrent, true), eq(candidateAvailability.isDeleted, false)) }),
    (async () => {
      const req = await db.query.requisitions.findFirst({ where: eq(requisitions.id, submission.requisitionId), columns: { accountId: true } });
      return req ? activeConsent(db, submission.candidateId, "share_with_customer", req.accountId) : null;
    })(),
    activeConsent(db, submission.candidateId, "communicate"),
    db.select({ id: documents.id, filename: documents.filename, kind: documents.kind, isSensitive: documents.isSensitive }).from(documents).where(and(eq(documents.candidateId, submission.candidateId), eq(documents.isDeleted, false))),
  ]);
  if (!candidate || !requisition) throw notFound("Submission");
  const settings = await getSettings();
  const staleCutoff = Date.now() - settings.availability_freshness_days * 86_400_000;
  return {
    submission,
    candidate,
    requisition: requisition.requisition,
    accountName: requisition.accountName,
    accountId: requisition.accountId,
    owner: owner ?? null,
    history,
    interviews: interviewRows,
    disclosures: disclosureRows,
    placement: placement ?? null,
    activities,
    messages,
    availability: availability ?? null,
    availabilityStale: !availability?.lastConfirmedAt || availability.lastConfirmedAt.getTime() < staleCutoff,
    sharingConsent: sharingConsent ?? null,
    canCommunicate: Boolean(communicateConsent),
    documents: docs,
    allowedStages: TRANSITIONS[submission.stage],
  };
}

export type SubmissionDetail = Awaited<ReturnType<typeof getSubmissionDetail>>;

async function ensureEditable(user: CurrentUser, id: string) {
  const sub = await getSubmission(user, id);
  if (!(await canEditRecord(user, sub.ownerId))) throw forbiddenError();
  return sub;
}

async function insertStageHistory(db: DbOrTx, input: { submissionId: string; from: Stage | null; to: Stage; reason?: string | null; notes?: string | null; actorId: string | null }) {
  await db.insert(submissionStageHistory).values({
    submissionId: input.submissionId,
    fromStage: input.from,
    toStage: input.to,
    reason: (input.reason as typeof submissionStageHistory.$inferInsert.reason) ?? null,
    notes: cleanText(input.notes),
    changedById: input.actorId,
  });
}

/** Creates one submission with a saved match snapshot; a candidate can be in flight on many requisitions at once. */
export async function createSubmission(user: CurrentUser, input: z.output<typeof createSubmissionSchema>) {
  const db = await getDb();
  const req = await db.query.requisitions.findFirst({ where: and(eq(requisitions.id, input.requisitionId), eq(requisitions.isDeleted, false)) });
  if (!req) throw notFound("Requisition");
  if (["closed", "cancelled"].includes(req.status)) throw conflict("This requisition is closed. Reopen it before adding candidates.");
  const candidate = await db.query.candidates.findFirst({ where: and(eq(candidates.id, input.candidateId), eq(candidates.isDeleted, false), isNull(candidates.mergedIntoId)) });
  if (!candidate) throw notFound("Candidate");
  const existing = await db.query.submissions.findFirst({ where: and(eq(submissions.requisitionId, input.requisitionId), eq(submissions.candidateId, input.candidateId), eq(submissions.isDeleted, false)) });
  if (existing) throw conflict(`${candidate.firstName} ${candidate.lastName} is already on this requisition (stage: ${existing.stage.replace(/_/g, " ")}).`);

  const result = await snapshotFor(db, input.requisitionId, input.candidateId);
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(submissions)
      .values({
        requisitionId: input.requisitionId,
        candidateId: input.candidateId,
        stage: "sourced",
        eligibility: result?.eligibility ?? "review",
        matchScore: result ? result.score.toFixed(3) : null,
        matchSnapshot: result ? toSnapshot(result) : null,
        requirementVersion: req.currentVersion,
        rankingVersion: result?.rankingVersion ?? null,
        ownerId: input.ownerId ?? req.ownerId ?? user.id,
        sourceId: input.sourceId ?? candidate.primarySourceId,
        createdBy: user.id,
      })
      .returning();
    await insertStageHistory(tx, { submissionId: row!.id, from: null, to: "sourced", notes: input.notes, actorId: user.id });
    await logActivity(tx, {
      type: "system",
      subject: `Added to ${req.title} (${result?.eligibility ?? "review"}, score ${result?.score ?? "n/a"})`,
      body: input.notes,
      submissionId: row!.id,
      candidateId: candidate.id,
      requisitionId: req.id,
      accountId: req.accountId,
      actorId: user.id,
    });
    return row!.id;
  });
  await emitEvent({
    trigger: "submission_stage_changed",
    entityType: "submission",
    entityId: id,
    eventKey: "null->sourced",
    payload: { fromStage: null, toStage: "sourced", eligibility: result?.eligibility ?? "review" },
    actorId: user.id,
    context: { ownerId: input.ownerId ?? req.ownerId ?? user.id, candidateId: candidate.id, requisitionId: req.id, accountId: req.accountId, submissionId: id, label: `${candidate.firstName} ${candidate.lastName}` },
  });
  return id;
}

export async function bulkCreateSubmissions(user: CurrentUser, requisitionId: string, candidateIds: string[]) {
  const created: string[] = [];
  const skipped: { candidateId: string; reason: string }[] = [];
  for (const candidateId of candidateIds) {
    try {
      created.push(await createSubmission(user, { requisitionId, candidateId, ownerId: null, sourceId: null, notes: null }));
    } catch (error) {
      skipped.push({ candidateId, reason: error instanceof AppError ? error.message : "Could not add" });
    }
  }
  return { created, skipped };
}

export async function confirmInterest(user: CurrentUser, input: z.output<typeof confirmInterestSchema>) {
  const db = await getDb();
  const sub = await ensureEditable(user, input.submissionId);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(submissions)
      .set({ interestConfirmedAt: input.interest ? now : null, availabilityConfirmedAt: input.availabilityConfirmed ? now : sub.availabilityConfirmedAt })
      .where(eq(submissions.id, sub.id));
    if (input.availabilityConfirmed) {
      await tx
        .update(candidateAvailability)
        .set({ lastConfirmedAt: now, confirmedById: user.id, confirmationChannel: input.channel })
        .where(and(eq(candidateAvailability.candidateId, sub.candidateId), eq(candidateAvailability.isCurrent, true), eq(candidateAvailability.isDeleted, false)));
    }
    await logActivity(tx, {
      type: input.channel === "whatsapp" ? "whatsapp" : input.channel === "email" ? "email" : "call",
      subject: input.interest ? `Interest confirmed${input.availabilityConfirmed ? " and availability re-confirmed" : ""} via ${input.channel}` : `Candidate not interested (via ${input.channel})`,
      body: input.notes,
      submissionId: sub.id,
      candidateId: sub.candidateId,
      requisitionId: sub.requisitionId,
      actorId: user.id,
    });
  });
  if (input.interest && ["sourced", "contacted"].includes(sub.stage)) {
    await changeStage(user, { submissionId: sub.id, toStage: "interested", reason: null, notes: null, plannedStart: null, plannedEnd: null, overrideReview: false });
  } else if (!input.interest && !CLOSED_STAGES.includes(sub.stage)) {
    await changeStage(user, { submissionId: sub.id, toStage: "declined_by_candidate", reason: "candidate_withdrew", notes: input.notes, plannedStart: null, plannedEnd: null, overrideReview: false });
  }
}

/**
 * Central stage machine. Rechecks eligibility and sharing permission at presentation and offer,
 * reserves a seat atomically on acceptance, releases it when an accepted submission closes.
 */
export async function changeStage(user: CurrentUser, input: z.output<typeof stageChangeSchema>) {
  const db = await getDb();
  const sub = await ensureEditable(user, input.submissionId);
  const to = input.toStage;
  if (sub.stage === to) return { ...sub, placementId: null as string | null };
  if (!canTransition(sub.stage, to)) throw validation(`Cannot move from "${sub.stage.replace(/_/g, " ")}" to "${to.replace(/_/g, " ")}".`);
  if (to === "placed") throw validation("Mark the placement as started to move this submission to placed.");

  const req = await db.query.requisitions.findFirst({ where: eq(requisitions.id, sub.requisitionId) });
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, sub.candidateId) });
  if (!req || !candidate) throw notFound("Submission");
  const patch: Partial<typeof submissions.$inferInsert> = { stage: to, stageChangedAt: new Date() };
  let overrideNote: string | null = null;

  const gate = to === "presented" || to === "customer_review" || to === "offered" || to === "accepted";
  if (gate) {
    const fresh = await snapshotFor(db, sub.requisitionId, sub.candidateId);
    if (fresh) {
      patch.eligibility = fresh.eligibility;
      patch.matchScore = fresh.score.toFixed(3);
      patch.matchSnapshot = toSnapshot(fresh);
      patch.requirementVersion = fresh.requirementVersion;
      patch.rankingVersion = fresh.rankingVersion;
      if (fresh.eligibility === "ineligible") {
        const failed = fresh.ruleResults.filter((r) => r.kind === "mandatory" && r.outcome === "fail").map((r) => r.reason);
        throw new AppError("validation", `Cannot proceed: the candidate fails a mandatory rule. ${failed[0] ?? ""}`.trim());
      }
      if (fresh.eligibility === "review") {
        if (!input.overrideReview) {
          const unknown = fresh.ruleResults.filter((r) => r.kind === "mandatory" && r.outcome === "unknown").map((r) => r.reason);
          throw new AppError("validation", `Eligibility is still under review: ${unknown[0] ?? "missing evidence"}. Resolve the evidence or record an explicit override.`);
        }
        overrideNote = `Eligibility review overridden by ${user.name}`;
      }
    }
    if (to === "presented" || to === "customer_review" || to === "offered") {
      const sharing = await activeConsent(db, sub.candidateId, "share_with_customer", req.accountId);
      if (!sharing) throw new AppError("validation", "The candidate has not granted permission to be shared with this customer (or has withdrawn it). Record customer-specific sharing permission first.");
      patch.sharingConsentId = sharing.id;
    }
    if (to === "offered" || to === "accepted") {
      const start = input.plannedStart ?? req.startDate;
      if (start) {
        const end = input.plannedEnd ?? req.endDate ?? null;
        const overlaps = await detectOverlap(db, sub.candidateId, start, end);
        if (overlaps.length) {
          throw conflict(`Assignment conflict: the candidate already holds a placement from ${overlaps[0]!.start}${overlaps[0]!.end ? ` to ${overlaps[0]!.end}` : ""}.`);
        }
      }
    }
  }
  if (to === "presented") patch.presentedAt = new Date();
  if (to === "offered") patch.offeredAt = new Date();
  if (to === "accepted") patch.acceptedAt = new Date();
  if (CLOSED_STAGES.includes(to)) {
    patch.closedAt = new Date();
    patch.decisionReason = (input.reason as typeof submissions.$inferInsert.decisionReason) ?? null;
    patch.decisionNotes = cleanText(input.notes);
  }
  if (to === "sourced" && CLOSED_STAGES.includes(sub.stage)) {
    patch.closedAt = null;
    patch.decisionReason = null;
    patch.decisionNotes = null;
  }

  let placementId: string | null = null;
  await db.transaction(async (tx) => {
    if (to === "accepted") {
      const start = input.plannedStart ?? req.startDate;
      if (!start) throw validation("Set a planned start date to reserve the seat.");
      const placement = await reserveSeat(tx, {
        requisitionId: req.id,
        submissionId: sub.id,
        candidateId: sub.candidateId,
        accountId: req.accountId,
        plannedStart: start,
        plannedEnd: input.plannedEnd ?? req.endDate ?? null,
        ownerId: sub.ownerId ?? req.ownerId,
        actorId: user.id,
        terms: {
          billRateAmount: req.billRateAmount,
          billRateCurrency: req.billRateCurrency,
          billRatePeriod: req.billRatePeriod,
          payRateAmount: req.payRateAmount,
          payRateCurrency: req.payRateCurrency,
          payRatePeriod: req.payRatePeriod,
        },
      });
      placementId = placement.id;
      await recordAudit(tx, { entityType: "placement", entityId: placement.id, action: "reserve_seat", actorId: user.id, after: { requisitionId: req.id, candidateId: sub.candidateId, plannedStart: start } });
      await logActivity(tx, { type: "system", subject: `Seat reserved (planned start ${start})`, submissionId: sub.id, candidateId: sub.candidateId, requisitionId: req.id, placementId: placement.id, accountId: req.accountId, actorId: user.id });
    }
    if (CLOSED_STAGES.includes(to) && sub.stage === "accepted") {
      const reserved = await tx.query.placements.findFirst({ where: and(eq(placements.submissionId, sub.id), eq(placements.status, "reserved"), eq(placements.isDeleted, false)) });
      if (reserved) {
        await tx
          .update(placements)
          .set({ status: "cancelled", cancellationReason: to === "declined_by_candidate" ? "candidate_withdrew" : to === "rejected_by_customer" ? "customer_cancelled" : "other", cancellationNotes: cleanText(input.notes) })
          .where(eq(placements.id, reserved.id));
        await recordAudit(tx, { entityType: "placement", entityId: reserved.id, action: "release_seat", actorId: user.id, before: { status: "reserved" }, after: { status: "cancelled" } });
        await logActivity(tx, { type: "system", subject: "Reserved seat released", submissionId: sub.id, requisitionId: req.id, placementId: reserved.id, actorId: user.id });
      }
    }
    await tx.update(submissions).set(patch).where(eq(submissions.id, sub.id));
    await insertStageHistory(tx, { submissionId: sub.id, from: sub.stage, to, reason: input.reason, notes: [overrideNote, input.notes].filter(Boolean).join(" — ") || null, actorId: user.id });
    await logActivity(tx, {
      type: "status_change",
      subject: `Stage ${sub.stage.replace(/_/g, " ")} → ${to.replace(/_/g, " ")}${input.reason ? ` (${input.reason.replace(/_/g, " ")})` : ""}`,
      body: sanitizeRichText(input.notes),
      submissionId: sub.id,
      candidateId: sub.candidateId,
      requisitionId: req.id,
      accountId: req.accountId,
      actorId: user.id,
    });
    if (overrideNote) {
      await recordAudit(tx, { entityType: "submission", entityId: sub.id, action: "override", actorId: user.id, before: { eligibility: "review" }, after: { stage: to }, note: overrideNote });
    }
  });
  await emitEvent({
    trigger: "submission_stage_changed",
    entityType: "submission",
    entityId: sub.id,
    eventKey: `${sub.stage}->${to}`,
    payload: { fromStage: sub.stage, toStage: to, eligibility: patch.eligibility ?? sub.eligibility, reason: input.reason },
    actorId: user.id,
    context: { ownerId: sub.ownerId, candidateId: sub.candidateId, requisitionId: req.id, accountId: req.accountId, submissionId: sub.id, placementId, label: `${candidate.firstName} ${candidate.lastName}` },
  });
  return { ...sub, ...patch, placementId };
}

export async function reassignSubmission(user: CurrentUser, id: string, ownerId: string | null) {
  const db = await getDb();
  await ensureEditable(user, id);
  const [row] = await db.update(submissions).set({ ownerId }).where(eq(submissions.id, id)).returning();
  return row!;
}

export async function softDeleteSubmission(user: CurrentUser, id: string) {
  const db = await getDb();
  const sub = await ensureEditable(user, id);
  if (sub.stage === "accepted" || sub.stage === "placed") throw conflict("Close or cancel the placement before removing this submission.");
  await db.update(submissions).set({ isDeleted: true }).where(eq(submissions.id, id));
  await recordAudit(db, { entityType: "submission", entityId: id, action: "delete", actorId: user.id, before: sub as unknown as Record<string, unknown> });
}

/** Submissions on a requisition that are far enough along to replace a placed candidate. */
export async function replacementCandidateOptions(user: CurrentUser, requisitionId: string, excludeCandidateId: string | null, q: string, limit = 10) {
  const db = await getDb();
  const scope = await visibilityScope(user, submissions.ownerId, submissions.isDeleted);
  const where: SQL[] = [scope, eq(submissions.requisitionId, requisitionId), inArray(submissions.stage, ["presented", "customer_review", "offered", "accepted"])];
  if (excludeCandidateId) where.push(sql`${submissions.candidateId} <> ${excludeCandidateId}`);
  if (q) where.push(or(ilike(candidates.firstName, `%${q}%`), ilike(candidates.lastName, `%${q}%`))!);
  return db
    .select({ id: submissions.id, label: sql<string>`${candidates.firstName} || ' ' || ${candidates.lastName}`, sub: sql<string>`${submissions.stage}::text || ' · ' || ${submissions.eligibility}::text` })
    .from(submissions)
    .innerJoin(candidates, eq(candidates.id, submissions.candidateId))
    .where(and(...where))
    .orderBy(desc(submissions.matchScore))
    .limit(limit);
}

/** Pipeline counts by stage for a requisition or the whole visible set. */
export async function stageCounts(user: CurrentUser, requisitionId?: string) {
  const db = await getDb();
  const scope = await visibilityScope(user, submissions.ownerId, submissions.isDeleted);
  const rows = await db
    .select({ stage: submissions.stage, n: count() })
    .from(submissions)
    .where(and(scope, requisitionId ? eq(submissions.requisitionId, requisitionId) : undefined))
    .groupBy(submissions.stage);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.stage] = r.n;
  return out;
}
