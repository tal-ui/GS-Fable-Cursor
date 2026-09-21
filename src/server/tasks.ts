import "server-only";
import { and, asc, count, eq, inArray, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { accounts, candidates, messages, placements, requisitions, submissions, tasks, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { notFound } from "@/lib/errors";
import { cleanText, requiredText } from "@/lib/sanitize";
import { notifyUser } from "./notifications";
import { paginate, type ListParams } from "./list";
import { visibilityScope } from "./scope";

type TaskInsert = typeof tasks.$inferInsert;

/**
 * Creates a task. When `dedupeKey` is supplied and a task with that key already exists,
 * nothing is created (loop guard for automations and re-processed events).
 */
export async function createTask(
  db: DbOrTx,
  input: Omit<TaskInsert, "id" | "createdAt" | "updatedAt" | "isDeleted"> & { notify?: boolean },
): Promise<typeof tasks.$inferSelect | null> {
  const { notify = true, ...values } = input;
  if (values.dedupeKey) {
    const existing = await db.query.tasks.findFirst({ where: eq(tasks.dedupeKey, values.dedupeKey) });
    if (existing) return null;
  }
  const [row] = await db
    .insert(tasks)
    .values({ ...values, title: requiredText(values.title).slice(0, 200) || "Task", description: cleanText(values.description) })
    .onConflictDoNothing({ target: tasks.dedupeKey })
    .returning();
  if (row && notify && row.ownerId && row.ownerId !== values.createdBy) {
    await notifyUser(db, { userId: row.ownerId, type: "task", title: `New task: ${row.title}`, link: `/work-queue?task=${row.id}` });
  }
  return row ?? null;
}

const SORTABLE = {
  dueAt: tasks.dueAt,
  priority: tasks.priority,
  createdAt: tasks.createdAt,
  title: tasks.title,
  status: tasks.status,
  type: tasks.type,
} as const;

const TASK_SELECT = {
  task: tasks,
  ownerName: users.name,
  candidateName: sql<string | null>`${candidates.firstName} || ' ' || ${candidates.lastName}`,
  accountName: accounts.name,
  requisitionTitle: requisitions.title,
  submissionLabel: sql<string | null>`(select c.first_name || ' ' || c.last_name || ' · ' || r.title from ${submissions} s join ${candidates} c on c.id = s.candidate_id join ${requisitions} r on r.id = s.requisition_id where s.id = ${tasks.submissionId})`,
  placementLabel: sql<string | null>`(select c.first_name || ' ' || c.last_name || ' · ' || r.title from ${placements} p join ${submissions} s on s.id = p.submission_id join ${candidates} c on c.id = s.candidate_id join ${requisitions} r on r.id = s.requisition_id where p.id = ${tasks.placementId})`,
  messageStatus: sql<string | null>`(select m.status::text from ${messages} m where m.id = ${tasks.messageId})`,
  messageChannel: sql<string | null>`(select m.channel::text from ${messages} m where m.id = ${tasks.messageId})`,
};

export async function listTasks(user: CurrentUser, params: ListParams, opts?: { mineOnly?: boolean }) {
  const db = await getDb();
  const scope = await visibilityScope(user, tasks.ownerId, tasks.isDeleted);
  const where: SQL[] = [scope];
  const f = params.filters;
  if (opts?.mineOnly || f.mine === "true") where.push(eq(tasks.ownerId, user.id));
  if (f.status) where.push(inArray(tasks.status, f.status.split(",") as (typeof tasks.$inferSelect.status)[]));
  else where.push(inArray(tasks.status, ["open", "in_progress"]));
  if (f.type) where.push(eq(tasks.type, f.type as typeof tasks.$inferSelect.type));
  if (f.priority) where.push(eq(tasks.priority, f.priority as typeof tasks.$inferSelect.priority));
  if (f.owner) where.push(f.owner === "unassigned" ? sql`${tasks.ownerId} is null` : eq(tasks.ownerId, f.owner));
  if (f.overdue === "true") where.push(and(isNotNull(tasks.dueAt), lt(tasks.dueAt, new Date()))!);
  if (f.due === "today") where.push(sql`${tasks.dueAt}::date <= current_date`);
  else if (f.due === "week") where.push(sql`${tasks.dueAt}::date <= current_date + interval '7 days'`);
  if (f.candidate) where.push(eq(tasks.candidateId, f.candidate));
  if (f.requisition) where.push(eq(tasks.requisitionId, f.requisition));
  if (params.q) where.push(sql`(${tasks.title} ilike ${"%" + params.q + "%"} or ${tasks.description} ilike ${"%" + params.q + "%"})`);

  const sortCol = SORTABLE[(params.sort as keyof typeof SORTABLE) ?? "dueAt"] ?? tasks.dueAt;
  // Due dates sort with "no due date" last in both directions so undated tasks never bury the urgent ones.
  const order = params.dir === "asc" ? sql`${sortCol} asc nulls last` : sql`${sortCol} desc nulls last`;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select(TASK_SELECT)
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.ownerId))
      .leftJoin(candidates, eq(candidates.id, tasks.candidateId))
      .leftJoin(accounts, eq(accounts.id, tasks.accountId))
      .leftJoin(requisitions, eq(requisitions.id, tasks.requisitionId))
      .where(and(...where))
      .orderBy(order, asc(tasks.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ total: count() }).from(tasks).where(and(...where)),
  ]);
  return paginate(
    rows.map((r) => ({ ...r, id: r.task.id })),
    total,
    params,
  );
}

export type TaskListRow = Awaited<ReturnType<typeof listTasks>>["rows"][number];

export async function getTask(user: CurrentUser, id: string) {
  const db = await getDb();
  const scope = await visibilityScope(user, tasks.ownerId, tasks.isDeleted);
  const row = await db.query.tasks.findFirst({ where: and(eq(tasks.id, id), scope) });
  if (!row) throw notFound("Task");
  return row;
}

/** Task with the labels of everything it links to, plus the failed/manual message it was created for. */
export async function getTaskDetail(user: CurrentUser, id: string) {
  const db = await getDb();
  const scope = await visibilityScope(user, tasks.ownerId, tasks.isDeleted);
  const [row] = await db
    .select(TASK_SELECT)
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.ownerId))
    .leftJoin(candidates, eq(candidates.id, tasks.candidateId))
    .leftJoin(accounts, eq(accounts.id, tasks.accountId))
    .leftJoin(requisitions, eq(requisitions.id, tasks.requisitionId))
    .where(and(eq(tasks.id, id), scope))
    .limit(1);
  if (!row) throw notFound("Task");
  const message = row.task.messageId ? await db.query.messages.findFirst({ where: eq(messages.id, row.task.messageId) }) : null;
  const completedBy = row.task.completedById ? await db.query.users.findFirst({ where: eq(users.id, row.task.completedById), columns: { name: true } }) : null;
  return {
    ...row,
    id: row.task.id,
    completedByName: completedBy?.name ?? null,
    message: message ? { id: message.id, channel: message.channel, status: message.status, toAddress: message.toAddress, subject: message.subject, body: message.body, errorMessage: message.errorMessage, attempts: message.attempts, createdAt: message.createdAt } : null,
  };
}

export type TaskDetail = Awaited<ReturnType<typeof getTaskDetail>>;

export async function updateTaskStatus(user: CurrentUser, id: string, status: typeof tasks.$inferSelect.status) {
  const db = await getDb();
  await getTask(user, id);
  const done = status === "done";
  const [row] = await db
    .update(tasks)
    .set({ status, completedAt: done ? new Date() : null, completedById: done ? user.id : null })
    .where(eq(tasks.id, id))
    .returning();
  return row!;
}

/** Bulk status change scoped to tasks the user can see; returns the affected rows for revalidation. */
export async function bulkUpdateTaskStatus(user: CurrentUser, ids: string[], status: typeof tasks.$inferSelect.status) {
  const db = await getDb();
  if (ids.length === 0) return [];
  const scope = await visibilityScope(user, tasks.ownerId, tasks.isDeleted);
  const done = status === "done";
  return db
    .update(tasks)
    .set({ status, completedAt: done ? new Date() : null, completedById: done ? user.id : null })
    .where(and(inArray(tasks.id, ids), scope))
    .returning();
}

export async function bulkReassignTasks(user: CurrentUser, ids: string[], ownerId: string | null) {
  const db = await getDb();
  if (ids.length === 0) return [];
  const scope = await visibilityScope(user, tasks.ownerId, tasks.isDeleted);
  const rows = await db.update(tasks).set({ ownerId }).where(and(inArray(tasks.id, ids), scope)).returning();
  if (ownerId && ownerId !== user.id && rows.length) {
    await notifyUser(db, { userId: ownerId, type: "task", title: rows.length === 1 ? `Task assigned to you: ${rows[0]!.title}` : `${rows.length} tasks assigned to you`, link: "/work-queue?f_mine=true" });
  }
  return rows;
}

export async function reassignTask(user: CurrentUser, id: string, ownerId: string | null) {
  const db = await getDb();
  await getTask(user, id);
  const [row] = await db.update(tasks).set({ ownerId }).where(eq(tasks.id, id)).returning();
  if (ownerId) await notifyUser(db, { userId: ownerId, type: "task", title: `Task assigned to you: ${row!.title}`, link: `/work-queue?task=${id}` });
  return row!;
}

/** Work-queue summary: overdue tasks, stalled submissions, stalled requisitions, failed messages, unknown eligibility. */
export async function workQueueSummary(user: CurrentUser, stall: { submissionDays: number; requisitionDays: number }) {
  const db = await getDb();
  const now = new Date();
  const taskScope = await visibilityScope(user, tasks.ownerId, tasks.isDeleted);
  const subScope = await visibilityScope(user, submissions.ownerId, submissions.isDeleted);
  const reqScope = await visibilityScope(user, requisitions.ownerId, requisitions.isDeleted);
  const stallSub = new Date(now.getTime() - stall.submissionDays * 86_400_000);
  const stallReq = new Date(now.getTime() - stall.requisitionDays * 86_400_000);

  const [[overdue], [openTasks], [stalledSubs], [reviewSubs], [failedMsgs], [stalledReqs], [upcomingStarts]] = await Promise.all([
    db.select({ n: count() }).from(tasks).where(and(taskScope, inArray(tasks.status, ["open", "in_progress"]), isNotNull(tasks.dueAt), lt(tasks.dueAt, now))),
    db.select({ n: count() }).from(tasks).where(and(taskScope, inArray(tasks.status, ["open", "in_progress"]))),
    db
      .select({ n: count() })
      .from(submissions)
      .where(and(subScope, inArray(submissions.stage, ["sourced", "contacted", "interested", "screening", "interviewing", "presented", "customer_review", "offered"]), lt(submissions.stageChangedAt, stallSub))),
    db.select({ n: count() }).from(submissions).where(and(subScope, eq(submissions.eligibility, "review"), inArray(submissions.stage, ["sourced", "contacted", "interested", "screening"]))),
    db.select({ n: count() }).from(tasks).where(and(taskScope, eq(tasks.type, "message_failed"), inArray(tasks.status, ["open", "in_progress"]))),
    db
      .select({ n: count() })
      .from(requisitions)
      .where(
        and(
          reqScope,
          eq(requisitions.status, "open"),
          lt(requisitions.updatedAt, stallReq),
          sql`not exists (select 1 from ${submissions} s where s.requisition_id = ${requisitions.id} and s.is_deleted = false and s.stage_changed_at > ${stallReq})`,
        ),
      ),
    db
      .select({ n: count() })
      .from(placements)
      .where(and(eq(placements.isDeleted, false), eq(placements.status, "reserved"), sql`${placements.plannedStart} <= (current_date + interval '7 days')`)),
  ]);
  return {
    overdueTasks: overdue?.n ?? 0,
    openTasks: openTasks?.n ?? 0,
    stalledSubmissions: stalledSubs?.n ?? 0,
    reviewSubmissions: reviewSubs?.n ?? 0,
    failedMessages: failedMsgs?.n ?? 0,
    stalledRequisitions: stalledReqs?.n ?? 0,
    upcomingStarts: upcomingStarts?.n ?? 0,
  };
}

const ACTIVE_STAGES = ["sourced", "contacted", "interested", "screening", "interviewing", "presented", "customer_review", "offered"] as const;

/**
 * The non-task items of the work queue: stalled submissions, submissions whose eligibility is
 * unknown, open requisitions with no movement, and reserved placements about to start.
 * Everything is scoped by ownership rules and carries an owner so it can be picked up.
 */
export async function workQueueItems(user: CurrentUser, stall: { submissionDays: number; requisitionDays: number }, limit = 50) {
  const db = await getDb();
  const now = new Date();
  const subScope = await visibilityScope(user, submissions.ownerId, submissions.isDeleted);
  const reqScope = await visibilityScope(user, requisitions.ownerId, requisitions.isDeleted);
  const plScope = await visibilityScope(user, placements.ownerId, placements.isDeleted);
  const stallSub = new Date(now.getTime() - stall.submissionDays * 86_400_000);
  const stallReq = new Date(now.getTime() - stall.requisitionDays * 86_400_000);

  const submissionSelect = {
    id: submissions.id,
    stage: submissions.stage,
    eligibility: submissions.eligibility,
    stageChangedAt: submissions.stageChangedAt,
    candidateId: submissions.candidateId,
    candidateName: sql<string>`${candidates.firstName} || ' ' || ${candidates.lastName}`,
    requisitionId: submissions.requisitionId,
    requisitionTitle: requisitions.title,
    accountName: accounts.name,
    ownerId: submissions.ownerId,
    ownerName: users.name,
    unknownRules: sql<number>`coalesce((select count(*)::int from jsonb_array_elements(coalesce(${submissions.matchSnapshot}->'ruleResults', '[]'::jsonb)) r where r->>'outcome' = 'unknown'), 0)`,
  };

  const [stalledSubmissions, reviewSubmissions, stalledRequisitions, upcomingStarts] = await Promise.all([
    db
      .select(submissionSelect)
      .from(submissions)
      .innerJoin(candidates, eq(candidates.id, submissions.candidateId))
      .innerJoin(requisitions, eq(requisitions.id, submissions.requisitionId))
      .innerJoin(accounts, eq(accounts.id, requisitions.accountId))
      .leftJoin(users, eq(users.id, submissions.ownerId))
      .where(and(subScope, inArray(submissions.stage, [...ACTIVE_STAGES]), lt(submissions.stageChangedAt, stallSub)))
      .orderBy(asc(submissions.stageChangedAt))
      .limit(limit),
    db
      .select(submissionSelect)
      .from(submissions)
      .innerJoin(candidates, eq(candidates.id, submissions.candidateId))
      .innerJoin(requisitions, eq(requisitions.id, submissions.requisitionId))
      .innerJoin(accounts, eq(accounts.id, requisitions.accountId))
      .leftJoin(users, eq(users.id, submissions.ownerId))
      .where(and(subScope, eq(submissions.eligibility, "review"), inArray(submissions.stage, ["sourced", "contacted", "interested", "screening"])))
      .orderBy(asc(submissions.createdAt))
      .limit(limit),
    db
      .select({
        id: requisitions.id,
        title: requisitions.title,
        status: requisitions.status,
        priority: requisitions.priority,
        accountId: requisitions.accountId,
        accountName: accounts.name,
        ownerId: requisitions.ownerId,
        ownerName: users.name,
        updatedAt: requisitions.updatedAt,
        startDate: requisitions.startDate,
        lastMovementAt: sql<Date | null>`(select max(s.stage_changed_at) from ${submissions} s where s.requisition_id = ${requisitions.id} and s.is_deleted = false)`,
        activeSubmissions: sql<number>`(select count(*)::int from ${submissions} s where s.requisition_id = ${requisitions.id} and s.is_deleted = false and s.stage in ('sourced','contacted','interested','screening','interviewing','presented','customer_review','offered','accepted'))`,
        openSeats: sql<number>`greatest(${requisitions.headcountApproved} - (select count(*)::int from ${placements} p where p.requisition_id = ${requisitions.id} and p.is_deleted = false and p.status in ('reserved','started','active','extended')), 0)`,
      })
      .from(requisitions)
      .innerJoin(accounts, eq(accounts.id, requisitions.accountId))
      .leftJoin(users, eq(users.id, requisitions.ownerId))
      .where(
        and(
          reqScope,
          eq(requisitions.status, "open"),
          lt(requisitions.updatedAt, stallReq),
          sql`not exists (select 1 from ${submissions} s where s.requisition_id = ${requisitions.id} and s.is_deleted = false and s.stage_changed_at > ${stallReq})`,
        ),
      )
      .orderBy(asc(requisitions.updatedAt))
      .limit(limit),
    db
      .select({
        id: placements.id,
        status: placements.status,
        plannedStart: placements.plannedStart,
        candidateName: sql<string>`${candidates.firstName} || ' ' || ${candidates.lastName}`,
        requisitionTitle: requisitions.title,
        accountName: accounts.name,
        ownerId: placements.ownerId,
        ownerName: users.name,
        checklistDone: sql<number>`(select count(*)::int from jsonb_array_elements(coalesce(${placements.checklist}, '[]'::jsonb)) i where (i->>'done')::boolean = true)`,
        checklistTotal: sql<number>`(select count(*)::int from jsonb_array_elements(coalesce(${placements.checklist}, '[]'::jsonb)))`,
      })
      .from(placements)
      .innerJoin(submissions, eq(submissions.id, placements.submissionId))
      .innerJoin(candidates, eq(candidates.id, submissions.candidateId))
      .innerJoin(requisitions, eq(requisitions.id, placements.requisitionId))
      .innerJoin(accounts, eq(accounts.id, requisitions.accountId))
      .leftJoin(users, eq(users.id, placements.ownerId))
      .where(and(plScope, eq(placements.status, "reserved"), sql`${placements.plannedStart} <= (current_date + interval '14 days')`))
      .orderBy(asc(placements.plannedStart))
      .limit(limit),
  ]);
  return { stalledSubmissions, reviewSubmissions, stalledRequisitions, upcomingStarts };
}

export type WorkQueueItems = Awaited<ReturnType<typeof workQueueItems>>;
