import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { integrationErrorLog, jobs } from "@/db/schema";
import { logger } from "@/lib/logger";
import { alertOps } from "../alerts";

export type Job = typeof jobs.$inferSelect;
export type JobHandler = (job: Job) => Promise<Record<string, unknown> | void>;

const STALE_LOCK_MS = 10 * 60_000;
const BASE_BACKOFF_MS = 30_000;

export async function enqueueJob(
  db: DbOrTx,
  input: { type: string; payload: Record<string, unknown>; runAt?: Date; maxAttempts?: number; idempotencyKey?: string; ownerId?: string | null },
): Promise<Job | null> {
  const [row] = await db
    .insert(jobs)
    .values({
      type: input.type,
      payload: input.payload,
      runAt: input.runAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? 3,
      idempotencyKey: input.idempotencyKey ?? null,
      ownerId: input.ownerId ?? null,
    })
    .onConflictDoNothing({ target: jobs.idempotencyKey })
    .returning();
  return row ?? null;
}

/** Atomically claims the next due job so concurrent workers never process the same job twice. */
export async function claimNextJob(workerId: string): Promise<Job | null> {
  const db = await getDb();
  const now = new Date();
  const result = await db.execute(sql`
    update ${jobs}
    set status = 'running', locked_at = ${now}, locked_by = ${workerId}, started_at = ${now}, attempts = attempts + 1, updated_at = ${now}
    where id = (
      select id from ${jobs}
      where status = 'queued' and run_at <= ${now}
      order by run_at asc
      limit 1
      for update skip locked
    )
    returning *
  `);
  // Both drivers return `{ rows }`; the base PgDatabase type erases the driver-specific shape.
  const rows = ((result as { rows?: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    type: row.type as string,
    payload: row.payload as Record<string, unknown>,
    status: row.status as Job["status"],
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    runAt: new Date(row.run_at as string),
    lockedAt: row.locked_at ? new Date(row.locked_at as string) : null,
    lockedBy: (row.locked_by as string) ?? null,
    startedAt: row.started_at ? new Date(row.started_at as string) : null,
    finishedAt: row.finished_at ? new Date(row.finished_at as string) : null,
    lastError: (row.last_error as string) ?? null,
    result: (row.result as Record<string, unknown>) ?? null,
    idempotencyKey: (row.idempotency_key as string) ?? null,
    ownerId: (row.owner_id as string) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function completeJob(job: Job, result: Record<string, unknown> | void): Promise<void> {
  const db = await getDb();
  await db.update(jobs).set({ status: "succeeded", finishedAt: new Date(), result: result ?? null, lockedAt: null, lockedBy: null }).where(eq(jobs.id, job.id));
}

/** Exponential backoff (30s, 60s, 120s...) up to maxAttempts, then dead + alert. */
export async function failJob(job: Job, error: unknown, onDead?: (job: Job, message: string) => Promise<void>): Promise<void> {
  const db = await getDb();
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = job.attempts >= job.maxAttempts;
  await db
    .update(jobs)
    .set({
      status: exhausted ? "dead" : "queued",
      runAt: exhausted ? job.runAt : new Date(Date.now() + BASE_BACKOFF_MS * 2 ** (job.attempts - 1)),
      lastError: message.slice(0, 1000),
      finishedAt: exhausted ? new Date() : null,
      lockedAt: null,
      lockedBy: null,
    })
    .where(eq(jobs.id, job.id));
  await db.insert(integrationErrorLog).values({
    integration: job.type.split(":")[0] ?? job.type,
    operation: job.type,
    errorMessage: message.slice(0, 1000),
    payload: job.payload,
    jobId: job.id,
    attempts: job.attempts,
  });
  logger.warn("job.failed", { jobId: job.id, type: job.type, attempts: job.attempts, exhausted, error: message });
  if (exhausted) {
    await alertOps(`Job ${job.type} (${job.id}) failed permanently after ${job.attempts} attempts: ${message}`);
    if (onDead) await onDead(job, message);
  }
}

/** Returns jobs stuck in `running` for too long (crashed worker) to the queue. */
export async function recoverStaleJobs(): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - STALE_LOCK_MS);
  const rows = await db
    .update(jobs)
    .set({ status: "queued", lockedAt: null, lockedBy: null, lastError: "Recovered from stale lock" })
    .where(and(eq(jobs.status, "running"), lt(jobs.lockedAt, cutoff)))
    .returning({ id: jobs.id });
  return rows.length;
}

export async function retryDeadJob(id: string): Promise<void> {
  const db = await getDb();
  await db.update(jobs).set({ status: "queued", attempts: 0, runAt: new Date(), lastError: null, finishedAt: null }).where(eq(jobs.id, id));
}
