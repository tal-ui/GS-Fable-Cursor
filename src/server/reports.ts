import "server-only";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accounts, candidateAvailability, candidateSkillClaims, candidates, matchFeedback, messages, placements, requisitions, securityAuditLog, sessions, sourceEvents, sources, submissionStageHistory, submissions, tasks, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { visibilityScope } from "./scope";
import { getSettings } from "./settings";

type Kpi = { key: string; label: string; value: number; previous: number; format?: "number" | "percent" | "days" };

function trend(value: number, previous: number) {
  if (previous === 0) return value === 0 ? 0 : 100;
  return Math.round(((value - previous) / previous) * 100);
}

/** KPI cards with a 30-day comparison to the prior 30 days. All counts are scoped to what the user may see. */
export async function dashboardKpis(user: CurrentUser) {
  const db = await getDb();
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const d60 = new Date(now.getTime() - 60 * 86_400_000);
  const candScope = await visibilityScope(user, candidates.ownerId, candidates.isDeleted);
  const reqScope = await visibilityScope(user, requisitions.ownerId, requisitions.isDeleted);
  const subScope = await visibilityScope(user, submissions.ownerId, submissions.isDeleted);
  const plScope = await visibilityScope(user, placements.ownerId, placements.isDeleted);

  const c = (q: Promise<{ n: number }[]>) => q.then((r) => r[0]?.n ?? 0);
  const [newCand, newCandPrev, openReq, openReqPrev, presented, presentedPrev, starts, startsPrev, openSeats, activePlacements, activePlacementsPrev] = await Promise.all([
    c(db.select({ n: count() }).from(candidates).where(and(candScope, isNull(candidates.mergedIntoId), gte(candidates.createdAt, d30)))),
    c(db.select({ n: count() }).from(candidates).where(and(candScope, isNull(candidates.mergedIntoId), gte(candidates.createdAt, d60), lt(candidates.createdAt, d30)))),
    c(db.select({ n: count() }).from(requisitions).where(and(reqScope, eq(requisitions.status, "open")))),
    c(db.select({ n: count() }).from(requisitions).where(and(reqScope, inArray(requisitions.status, ["open", "filled", "closed"]), lt(requisitions.createdAt, d30), sql`(${requisitions.closedAt} is null or ${requisitions.closedAt} > ${d30})`))),
    c(db.select({ n: count() }).from(submissions).where(and(subScope, isNotNull(submissions.presentedAt), gte(submissions.presentedAt, d30)))),
    c(db.select({ n: count() }).from(submissions).where(and(subScope, isNotNull(submissions.presentedAt), gte(submissions.presentedAt, d60), lt(submissions.presentedAt, d30)))),
    c(db.select({ n: count() }).from(placements).where(and(plScope, isNotNull(placements.actualStart), gte(placements.actualStart, sql`${d30.toISOString().slice(0, 10)}::date`)))),
    c(db.select({ n: count() }).from(placements).where(and(plScope, isNotNull(placements.actualStart), gte(placements.actualStart, sql`${d60.toISOString().slice(0, 10)}::date`), lt(placements.actualStart, sql`${d30.toISOString().slice(0, 10)}::date`)))),
    db
      .select({ n: sql<number>`coalesce(sum(greatest(${requisitions.headcountApproved} - (select count(*) from ${placements} p where p.requisition_id = ${requisitions.id} and p.is_deleted = false and p.status in ('reserved','started','active','extended')), 0)), 0)::int` })
      .from(requisitions)
      .where(and(reqScope, eq(requisitions.status, "open")))
      .then((r) => r[0]?.n ?? 0),
    c(db.select({ n: count() }).from(placements).where(and(plScope, inArray(placements.status, ["started", "active", "extended"])))),
    c(db.select({ n: count() }).from(placements).where(and(plScope, inArray(placements.status, ["started", "active", "extended", "completed"]), lt(placements.createdAt, d30)))),
  ]);
  const kpis: Kpi[] = [
    { key: "candidates", label: "New candidates (30d)", value: newCand, previous: newCandPrev },
    { key: "requisitions", label: "Open requisitions", value: openReq, previous: openReqPrev },
    { key: "seats", label: "Open seats", value: openSeats, previous: openSeats },
    { key: "presented", label: "Presented to customers (30d)", value: presented, previous: presentedPrev },
    { key: "starts", label: "Placement starts (30d)", value: starts, previous: startsPrev },
    { key: "active", label: "Working placements", value: activePlacements, previous: activePlacementsPrev },
  ];
  return kpis.map((k) => ({ ...k, trend: trend(k.value, k.previous) }));
}

export async function pipelineByStage(user: CurrentUser) {
  const db = await getDb();
  const scope = await visibilityScope(user, submissions.ownerId, submissions.isDeleted);
  const rows = await db.select({ stage: submissions.stage, n: count() }).from(submissions).where(scope).groupBy(submissions.stage);
  const order = ["sourced", "contacted", "interested", "screening", "interviewing", "presented", "customer_review", "offered", "accepted", "placed"];
  const m = new Map(rows.map((r) => [r.stage, r.n]));
  return order.map((stage) => ({ stage, label: stage.replace(/_/g, " "), count: m.get(stage as typeof submissions.$inferSelect.stage) ?? 0 }));
}

export async function placementsByMonth(user: CurrentUser, months = 6) {
  const db = await getDb();
  const scope = await visibilityScope(user, placements.ownerId, placements.isDeleted);
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1), 1);
  since.setHours(0, 0, 0, 0);
  const rows = await db
    .select({ month: sql<string>`to_char(${placements.plannedStart}, 'YYYY-MM')`, status: placements.status, n: count() })
    .from(placements)
    .where(and(scope, gte(placements.plannedStart, sql`${since.toISOString().slice(0, 10)}::date`)))
    .groupBy(sql`to_char(${placements.plannedStart}, 'YYYY-MM')`, placements.status);
  const out: Record<string, { month: string; started: number; reserved: number; cancelled: number; completed: number }> = {};
  for (let i = 0; i < months; i += 1) {
    const d = new Date(since);
    d.setMonth(since.getMonth() + i);
    const key = d.toISOString().slice(0, 7);
    out[key] = { month: key, started: 0, reserved: 0, cancelled: 0, completed: 0 };
  }
  for (const r of rows) {
    const bucket = out[r.month];
    if (!bucket) continue;
    if (r.status === "reserved") bucket.reserved += r.n;
    else if (r.status === "cancelled" || r.status === "replaced") bucket.cancelled += r.n;
    else if (r.status === "completed") bucket.completed += r.n;
    else bucket.started += r.n;
  }
  return Object.values(out);
}

export async function candidatesByStatus(user: CurrentUser) {
  const db = await getDb();
  const scope = await visibilityScope(user, candidates.ownerId, candidates.isDeleted);
  const rows = await db.select({ status: candidates.status, n: count() }).from(candidates).where(and(scope, isNull(candidates.mergedIntoId))).groupBy(candidates.status);
  return rows.map((r) => ({ status: r.status, label: r.status.replace(/_/g, " "), count: r.n }));
}

/** Source attribution with basic conversion counts (candidates → presented → started). */
export async function sourceConversion(user: CurrentUser) {
  const db = await getDb();
  const candScope = await visibilityScope(user, candidates.ownerId, candidates.isDeleted);
  // In a single-table select Drizzle strips the table name from PgColumn chunks inside sql`` fields, which
  // turns the correlated reference into a bare "id" that collides with the aliases inside each subquery.
  // Wrapping the column in its own fragment keeps it fully qualified ("sources"."id").
  const sourceId = sql`${sources.id}`;
  const candidateId = sql`${candidates.id}`;
  const mergedInto = sql`${candidates.mergedIntoId}`;
  return db
    .select({
      id: sources.id,
      name: sources.name,
      type: sources.type,
      isActive: sources.isActive,
      candidates: sql<number>`(select count(distinct e.candidate_id)::int from ${sourceEvents} e join ${candidates} on ${candidateId} = e.candidate_id where e.source_id = ${sourceId} and e.is_deleted = false and ${mergedInto} is null and ${candScope})`,
      events: sql<number>`(select count(*)::int from ${sourceEvents} e where e.source_id = ${sourceId} and e.is_deleted = false)`,
      presented: sql<number>`(select count(*)::int from ${submissions} s where s.source_id = ${sourceId} and s.is_deleted = false and s.presented_at is not null)`,
      accepted: sql<number>`(select count(*)::int from ${submissions} s where s.source_id = ${sourceId} and s.is_deleted = false and s.stage in ('accepted','placed'))`,
      started: sql<number>`(select count(*)::int from ${placements} p join ${submissions} s on s.id = p.submission_id where s.source_id = ${sourceId} and p.is_deleted = false and p.actual_start is not null)`,
    })
    .from(sources)
    .where(eq(sources.isDeleted, false))
    .orderBy(desc(sql`(select count(*) from ${sourceEvents} e where e.source_id = ${sourceId})`));
}

/** First-month pilot metrics from the plan (section 9 "Measure the first month"). */
export async function pilotMetrics(user: CurrentUser, days = 30) {
  const db = await getDb();
  const settings = await getSettings();
  const now = new Date();
  const d30 = new Date(now.getTime() - days * 86_400_000);
  const d7 = new Date(now.getTime() - 7 * 86_400_000);
  const subScope = await visibilityScope(user, submissions.ownerId, submissions.isDeleted);
  const taskScope = await visibilityScope(user, tasks.ownerId, tasks.isDeleted);
  const candScope = await visibilityScope(user, candidates.ownerId, candidates.isDeleted);

  const [reqToShortlist, shortlistToPresent, funnel, overdue, freshness, activeRecruiters, msgs] = await Promise.all([
    // Median hours from requisition opened to first submission created.
    db
      .select({ hours: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (first_sub.first_at - ${requisitions.openedAt})) / 3600)` })
      .from(requisitions)
      .innerJoin(
        sql`(select requisition_id, min(created_at) as first_at from ${submissions} where is_deleted = false group by requisition_id) first_sub`,
        sql`first_sub.requisition_id = ${requisitions.id}`,
      )
      .where(and(eq(requisitions.isDeleted, false), isNotNull(requisitions.openedAt), gte(requisitions.openedAt, d30)))
      .then((r) => r[0]?.hours ?? null),
    db
      .select({ hours: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${submissions.presentedAt} - ${submissions.createdAt})) / 3600)` })
      .from(submissions)
      .where(and(subScope, isNotNull(submissions.presentedAt), gte(submissions.presentedAt, d30)))
      .then((r) => r[0]?.hours ?? null),
    db
      .select({
        submitted: sql<number>`count(*)::int`,
        presented: sql<number>`count(*) filter (where ${submissions.presentedAt} is not null)::int`,
        accepted: sql<number>`count(*) filter (where ${submissions.acceptedAt} is not null)::int`,
        started: sql<number>`count(*) filter (where exists (select 1 from ${placements} p where p.submission_id = ${submissions.id} and p.actual_start is not null and p.is_deleted = false))::int`,
        completed: sql<number>`count(*) filter (where exists (select 1 from ${placements} p where p.submission_id = ${submissions.id} and p.status = 'completed' and p.is_deleted = false))::int`,
      })
      .from(submissions)
      .where(and(subScope, gte(submissions.createdAt, d30)))
      .then((r) => r[0] ?? { submitted: 0, presented: 0, accepted: 0, started: 0, completed: 0 }),
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(taskScope, inArray(tasks.status, ["open", "in_progress"]), isNotNull(tasks.dueAt), lt(tasks.dueAt, now)))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({
        total: sql<number>`count(*)::int`,
        fresh: sql<number>`count(*) filter (where a.last_confirmed_at >= ${new Date(now.getTime() - settings.availability_freshness_days * 86_400_000)})::int`,
      })
      .from(candidates)
      .leftJoin(sql`(select candidate_id, max(last_confirmed_at) as last_confirmed_at from ${candidateAvailability} where is_current = true and is_deleted = false group by candidate_id) a`, sql`a.candidate_id = ${candidates.id}`)
      .where(and(candScope, isNull(candidates.mergedIntoId), inArray(candidates.status, ["new", "screening", "active"])))
      .then((r) => r[0] ?? { total: 0, fresh: 0 }),
    db
      .select({ n: sql<number>`count(distinct ${sessions.userId})::int` })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(gte(sessions.lastActiveAt, d7), eq(users.status, "active"), inArray(users.role, ["standard", "super_admin"])))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({
        sent: sql<number>`count(*) filter (where ${messages.status} in ('sent','delivered','read'))::int`,
        failed: sql<number>`count(*) filter (where ${messages.status} = 'failed')::int`,
        manual: sql<number>`count(*) filter (where ${messages.status} = 'manual_pending')::int`,
        suppressed: sql<number>`count(*) filter (where ${messages.status} = 'suppressed')::int`,
      })
      .from(messages)
      .where(and(eq(messages.direction, "outbound"), gte(messages.createdAt, d30)))
      .then((r) => r[0] ?? { sent: 0, failed: 0, manual: 0, suppressed: 0 }),
  ]);
  return {
    days,
    requestToShortlistHours: reqToShortlist === null ? null : Math.round(Number(reqToShortlist)),
    shortlistToPresentationHours: shortlistToPresent === null ? null : Math.round(Number(shortlistToPresent)),
    funnel,
    presentationToStartRate: funnel.presented ? Math.round((funnel.started / funnel.presented) * 100) : null,
    overdueTasks: overdue,
    availabilityFreshness: freshness.total ? Math.round((freshness.fresh / freshness.total) * 100) : null,
    freshnessCounts: freshness,
    weeklyActiveRecruiters: activeRecruiters,
    messaging: msgs,
  };
}

export async function stageDurations(user: CurrentUser) {
  const db = await getDb();
  const scope = await visibilityScope(user, submissions.ownerId, submissions.isDeleted);
  const rows = await db
    .select({
      stage: submissionStageHistory.fromStage,
      avgHours: sql<number>`avg(extract(epoch from (next.created_at - ${submissionStageHistory.createdAt})) / 3600)`,
      n: count(),
    })
    .from(submissionStageHistory)
    .innerJoin(
      sql`lateral (select h2.created_at from ${submissionStageHistory} h2 where h2.submission_id = ${submissionStageHistory.submissionId} and h2.created_at > ${submissionStageHistory.createdAt} order by h2.created_at asc limit 1) next`,
      sql`true`,
    )
    .innerJoin(submissions, eq(submissions.id, submissionStageHistory.submissionId))
    .where(and(scope, isNotNull(submissionStageHistory.fromStage)))
    .groupBy(submissionStageHistory.fromStage);
  return rows.map((r) => ({ stage: r.stage ?? "start", avgHours: Math.round(Number(r.avgHours ?? 0)), n: r.n }));
}

export async function topAccounts(user: CurrentUser, limit = 5) {
  const db = await getDb();
  const scope = await visibilityScope(user, accounts.ownerId, accounts.isDeleted);
  const accountId = sql`${accounts.id}`; // keep qualified inside the correlated subqueries (see sourceConversion)
  return db
    .select({
      id: accounts.id,
      name: accounts.name,
      openRequisitions: sql<number>`(select count(*)::int from ${requisitions} r where r.account_id = ${accountId} and r.is_deleted = false and r.status = 'open')`,
      activePlacements: sql<number>`(select count(*)::int from ${placements} p where p.account_id = ${accountId} and p.is_deleted = false and p.status in ('started','active','extended'))`,
    })
    .from(accounts)
    .where(scope)
    .orderBy(desc(sql`(select count(*) from ${placements} p where p.account_id = ${accountId} and p.is_deleted = false)`))
    .limit(limit);
}

/** Recruiter decisions on matching suggestions, grouped by ranking version so versions can be compared on the same cases. */
export async function matchingQuality(user: CurrentUser, days = 90) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86_400_000);
  const reqScope = await visibilityScope(user, requisitions.ownerId, requisitions.isDeleted);
  const rows = await db
    .select({
      rankingVersion: sql<string>`coalesce(${matchFeedback.rankingVersion}, 'unknown')`,
      action: matchFeedback.action,
      n: count(),
      avgScore: sql<number | null>`avg(${matchFeedback.score})`,
    })
    .from(matchFeedback)
    .innerJoin(requisitions, eq(requisitions.id, matchFeedback.requisitionId))
    .where(and(reqScope, gte(matchFeedback.createdAt, since)))
    .groupBy(sql`coalesce(${matchFeedback.rankingVersion}, 'unknown')`, matchFeedback.action);
  const byVersion = new Map<string, { rankingVersion: string; accepted: number; overriddenInclude: number; overriddenExclude: number; rejected: number; total: number; scoreSum: number; scoreN: number }>();
  for (const r of rows) {
    const v = byVersion.get(r.rankingVersion) ?? { rankingVersion: r.rankingVersion, accepted: 0, overriddenInclude: 0, overriddenExclude: 0, rejected: 0, total: 0, scoreSum: 0, scoreN: 0 };
    if (r.action === "accepted") v.accepted += r.n;
    else if (r.action === "overridden_include") v.overriddenInclude += r.n;
    else if (r.action === "overridden_exclude") v.overriddenExclude += r.n;
    else v.rejected += r.n;
    v.total += r.n;
    if (r.avgScore !== null) {
      v.scoreSum += Number(r.avgScore) * r.n;
      v.scoreN += r.n;
    }
    byVersion.set(r.rankingVersion, v);
  }
  return Array.from(byVersion.values())
    .map((v) => ({ ...v, acceptanceRate: v.total ? v.accepted / v.total : null, overrideRate: v.total ? (v.overriddenInclude + v.overriddenExclude) / v.total : null, avgScore: v.scoreN ? v.scoreSum / v.scoreN : null }))
    .sort((a, b) => b.total - a.total);
}

/** Evidence readiness across the active pool: how many skill claims are verified, pending, unverified or expired. */
export async function verificationReadiness(user: CurrentUser) {
  const db = await getDb();
  const candScope = await visibilityScope(user, candidates.ownerId, candidates.isDeleted);
  const rows = await db
    .select({ status: candidateSkillClaims.verificationStatus, n: count() })
    .from(candidateSkillClaims)
    .innerJoin(candidates, eq(candidates.id, candidateSkillClaims.candidateId))
    .where(and(candScope, isNull(candidates.mergedIntoId), eq(candidateSkillClaims.isDeleted, false)))
    .groupBy(candidateSkillClaims.verificationStatus);
  const [expiring] = await db
    .select({ n: count() })
    .from(candidateSkillClaims)
    .innerJoin(candidates, eq(candidates.id, candidateSkillClaims.candidateId))
    .where(and(candScope, isNull(candidates.mergedIntoId), eq(candidateSkillClaims.isDeleted, false), eq(candidateSkillClaims.verificationStatus, "verified"), isNotNull(candidateSkillClaims.expiresAt), sql`${candidateSkillClaims.expiresAt} <= current_date + interval '60 days'`));
  return { byStatus: rows.map((r) => ({ status: r.status, label: r.status.replace(/_/g, " "), count: r.n })), expiringWithin60Days: expiring?.n ?? 0 };
}

export async function securitySummary() {
  const db = await getDb();
  const d7 = new Date(Date.now() - 7 * 86_400_000);
  const [denied] = await db.select({ n: count() }).from(securityAuditLog).where(and(eq(securityAuditLog.statusCode, 403), gte(securityAuditLog.createdAt, d7)));
  return { deniedLast7Days: denied?.n ?? 0 };
}
