import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { getDb, type DbOrTx } from "@/db/client";
import { matchFeedback, requisitions, roleFamilies, submissions, type MatchSnapshot } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { notFound } from "@/lib/errors";
import { matchCandidate, rankCandidates, validateRequirements, type RankedMatches } from "@/lib/matching/engine";
import type { MatchResult, MatchSettings, RequisitionContext } from "@/lib/matching/types";
import { logger } from "@/lib/logger";
import type { matchFeedbackSchema } from "@/lib/schemas/pipeline";
import { logActivity } from "../activities";
import { loadCandidateFacts } from "../candidates/facts";
import { notifyUser } from "../notifications";
import { getRequisition, loadRequirements } from "../requisitions";
import { getSettings } from "../settings";

const DEFAULT_WEIGHTS = { skills: 0.4, proficiency: 0.15, experience: 0.15, preferences: 0.2, freshness: 0.1 };

export async function buildRequisitionContext(db: DbOrTx, requisitionId: string, version?: number): Promise<RequisitionContext> {
  const req = await db.query.requisitions.findFirst({ where: eq(requisitions.id, requisitionId) });
  if (!req) throw notFound("Requisition");
  const family = req.roleFamilyId ? await db.query.roleFamilies.findFirst({ where: eq(roleFamilies.id, req.roleFamilyId) }) : null;
  const v = version ?? req.currentVersion;
  return {
    id: req.id,
    title: req.title,
    locationCountry: req.locationCountry,
    startDate: req.startDate,
    durationWeeks: req.durationWeeks,
    requirementVersion: v,
    requirements: await loadRequirements(db, req.id, v),
    rankingVersion: family?.rankingVersion ?? "baseline-v1",
    weights: family?.rankingWeights ?? DEFAULT_WEIGHTS,
  };
}

async function matchSettings(): Promise<Partial<MatchSettings>> {
  const s = await getSettings();
  return { availabilityFreshnessDays: s.availability_freshness_days, verificationStaleDays: s.verification_stale_days };
}

export type MatchingWorkspace = RankedMatches & {
  context: RequisitionContext;
  issues: string[];
  existingSubmissions: Record<string, { id: string; stage: string }>;
  poolSize: number;
};

/**
 * Searches the entire active candidate pool for a requisition. Returns eligible results ranked by
 * the explainable baseline, plus a visibly separate review list (unknown/stale evidence) and the
 * ineligible list with reasons. Candidates already submitted are flagged, not hidden.
 */
export async function runMatching(user: CurrentUser, requisitionId: string): Promise<MatchingWorkspace> {
  const db = await getDb();
  await getRequisition(user, requisitionId);
  const context = await buildRequisitionContext(db, requisitionId);
  const issues = validateRequirements(context.requirements);
  const [pool, settings, existing] = await Promise.all([
    loadCandidateFacts(),
    matchSettings(),
    db.select({ id: submissions.id, candidateId: submissions.candidateId, stage: submissions.stage }).from(submissions).where(and(eq(submissions.requisitionId, requisitionId), eq(submissions.isDeleted, false))),
  ]);
  const ranked = issues.length ? { eligible: [], review: [], ineligible: [] } : rankCandidates(context, pool, settings);
  const existingSubmissions: Record<string, { id: string; stage: string }> = {};
  for (const s of existing) existingSubmissions[s.candidateId] = { id: s.id, stage: s.stage };
  return { ...ranked, context, issues, existingSubmissions, poolSize: pool.length };
}

/** Computes a fresh snapshot for one candidate against the requisition's current version. */
export async function snapshotFor(db: DbOrTx, requisitionId: string, candidateId: string): Promise<MatchResult | null> {
  const context = await buildRequisitionContext(db, requisitionId);
  const [facts] = await loadCandidateFacts([candidateId]);
  if (!facts) return null;
  return matchCandidate(context, facts, await matchSettings());
}

export function toSnapshot(result: MatchResult): MatchSnapshot {
  const { candidateId: _c, candidateName: _n, ...snapshot } = result;
  void _c;
  void _n;
  return snapshot;
}

/**
 * Job handler: recomputes match snapshots for every open submission on a requisition after
 * requirements, availability or verification change. Owners are notified when eligibility moves.
 */
export async function recomputeSubmissionSnapshots(requisitionId: string): Promise<Record<string, unknown>> {
  const db = await getDb();
  const req = await db.query.requisitions.findFirst({ where: eq(requisitions.id, requisitionId) });
  if (!req || req.isDeleted) return { skipped: "requisition missing" };
  const open = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.requisitionId, requisitionId), eq(submissions.isDeleted, false), inArray(submissions.stage, ["sourced", "contacted", "interested", "screening", "interviewing", "presented", "customer_review", "offered"])));
  if (open.length === 0) return { updated: 0 };
  const context = await buildRequisitionContext(db, requisitionId);
  if (validateRequirements(context.requirements).length) return { skipped: "requirements invalid" };
  const facts = await loadCandidateFacts(open.map((s) => s.candidateId));
  const settings = await matchSettings();
  const byId = new Map(facts.map((f) => [f.id, f]));
  let updated = 0;
  let changed = 0;
  for (const sub of open) {
    const f = byId.get(sub.candidateId);
    if (!f) continue;
    const result = matchCandidate(context, f, settings);
    await db
      .update(submissions)
      .set({ eligibility: result.eligibility, matchScore: result.score.toFixed(3), matchSnapshot: toSnapshot(result), requirementVersion: context.requirementVersion, rankingVersion: context.rankingVersion })
      .where(eq(submissions.id, sub.id));
    updated += 1;
    if (result.eligibility !== sub.eligibility) {
      changed += 1;
      await logActivity(db, { type: "system", subject: `Eligibility recomputed: ${sub.eligibility} → ${result.eligibility} (requirements v${context.requirementVersion})`, submissionId: sub.id, requisitionId, candidateId: sub.candidateId, actorId: null });
      await notifyUser(db, { userId: sub.ownerId ?? req.ownerId, type: "info", title: `${f.name}: eligibility now "${result.eligibility}" for ${req.title}`, link: `/submissions/${sub.id}` });
    }
  }
  logger.info("matching.recomputed", { requisitionId, updated, changed });
  return { updated, changed };
}

/** Queues recompute for every open requisition a candidate is submitted to (after profile changes). */
export async function recomputeForCandidate(db: DbOrTx, candidateId: string): Promise<void> {
  const { enqueueJob } = await import("../jobs/queue");
  const rows = await db
    .selectDistinct({ requisitionId: submissions.requisitionId })
    .from(submissions)
    .where(and(eq(submissions.candidateId, candidateId), eq(submissions.isDeleted, false), inArray(submissions.stage, ["sourced", "contacted", "interested", "screening", "interviewing", "presented", "customer_review", "offered"])));
  const bucket = Math.floor(Date.now() / 60_000);
  for (const r of rows) {
    await enqueueJob(db, { type: "matching:recompute", payload: { requisitionId: r.requisitionId }, idempotencyKey: `recompute:${r.requisitionId}:c${candidateId}:${bucket}` });
  }
}

export async function recordMatchFeedback(user: CurrentUser, input: z.output<typeof matchFeedbackSchema>) {
  const db = await getDb();
  await getRequisition(user, input.requisitionId);
  const sub = await db.query.submissions.findFirst({ where: and(eq(submissions.requisitionId, input.requisitionId), eq(submissions.candidateId, input.candidateId), eq(submissions.isDeleted, false)) });
  const snapshot = sub?.matchSnapshot ?? (await snapshotFor(db, input.requisitionId, input.candidateId));
  const [row] = await db
    .insert(matchFeedback)
    .values({
      requisitionId: input.requisitionId,
      candidateId: input.candidateId,
      submissionId: sub?.id ?? null,
      action: input.action,
      reason: input.reason,
      notes: input.notes,
      rankingVersion: snapshot?.rankingVersion ?? null,
      requirementVersion: snapshot?.requirementVersion ?? null,
      score: snapshot ? Number(snapshot.score).toFixed(3) : null,
      eligibility: snapshot?.eligibility ?? null,
      userId: user.id,
    })
    .returning();
  await logActivity(db, { type: "system", subject: `Match feedback: ${input.action.replace(/_/g, " ")}${input.reason ? ` — ${input.reason}` : ""}`, requisitionId: input.requisitionId, candidateId: input.candidateId, submissionId: sub?.id ?? null, actorId: user.id });
  return row!;
}

export async function feedbackForRequisition(requisitionId: string) {
  const db = await getDb();
  return db.select().from(matchFeedback).where(eq(matchFeedback.requisitionId, requisitionId));
}
