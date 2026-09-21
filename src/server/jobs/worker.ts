import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { handlers, onJobDead } from "./handlers";
import { claimNextJob, completeJob, enqueueJob, failJob, recoverStaleJobs } from "./queue";

const workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;

/** Processes up to `limit` due jobs. Safe to call concurrently from multiple runners. */
export async function runPendingJobs(limit = 20): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  await recoverStaleJobs();
  for (let i = 0; i < limit; i++) {
    const job = await claimNextJob(workerId);
    if (!job) break;
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`No handler registered for job type ${job.type}`);
      const result = await handler(job);
      await completeJob(job, result ?? undefined);
      processed += 1;
    } catch (error) {
      failed += 1;
      await failJob(job, error, onJobDead);
    }
  }
  return { processed, failed };
}

/** Ensures the daily maintenance job exists for today (idempotent). */
export async function scheduleDailyMaintenance(): Promise<void> {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  await enqueueJob(db, { type: "maintenance:daily", payload: { date: today }, idempotencyKey: `maintenance:daily:${today}`, maxAttempts: 2 });
}

type Globals = typeof globalThis & { __staffingWorker?: { timer: NodeJS.Timeout; busy: boolean } };

/** Starts the in-process poller once per Node process (used in dev and single-instance deployments). */
export function startInlineWorker(): void {
  const g = globalThis as Globals;
  if (g.__staffingWorker || !env.jobsInlineRunner) return;
  const state = { busy: false, timer: null as unknown as NodeJS.Timeout };
  state.timer = setInterval(async () => {
    if (state.busy) return;
    state.busy = true;
    try {
      await scheduleDailyMaintenance();
      const { processed, failed } = await runPendingJobs();
      if (processed || failed) logger.info("jobs.tick", { processed, failed });
    } catch (error) {
      logger.error("jobs.tick_failed", { error: String(error) });
    } finally {
      state.busy = false;
    }
  }, env.JOBS_POLL_INTERVAL_MS);
  state.timer.unref();
  g.__staffingWorker = state;
  logger.info("jobs.inline_worker_started", { intervalMs: env.JOBS_POLL_INTERVAL_MS, workerId });
}
