import "server-only";
import type { Job, JobHandler } from "./queue";

/**
 * Job type registry. Handlers are loaded lazily so the queue module stays free of
 * heavy dependencies (PDF parsing, AI adapters) until a job actually needs them.
 */
export const handlers: Record<string, JobHandler> = {
  "whatsapp:send": async (job) => sendMessage(job),
  "email:send": async (job) => sendMessage(job),
  "ai:extract_cv": async (job) => {
    const { runCvExtractionJob } = await import("../ai/extraction");
    return runCvExtractionJob(String(job.payload.documentId), String(job.payload.candidateId), (job.payload.actorId as string) ?? null);
  },
  "matching:recompute": async (job) => {
    const { recomputeSubmissionSnapshots } = await import("../matching");
    return recomputeSubmissionSnapshots(String(job.payload.requisitionId));
  },
  "import:commit": async (job) => {
    const { commitImportBatch } = await import("../imports");
    return commitImportBatch(String(job.payload.batchId), (job.payload.actorId as string) ?? null);
  },
  "maintenance:daily": async () => {
    const { runDailyMaintenance } = await import("../maintenance");
    return runDailyMaintenance();
  },
};

async function sendMessage(job: Job) {
  const { sendQueuedMessage } = await import("../messaging/outreach");
  return sendQueuedMessage(String(job.payload.messageId));
}

/** Invoked when a job dies so the failure is visible to an owner, not just in a log. */
export async function onJobDead(job: Job, message: string): Promise<void> {
  if (job.type.endsWith(":send") && job.payload.messageId) {
    const { markMessageFailed } = await import("../messaging/outreach");
    await markMessageFailed(String(job.payload.messageId), message);
    return;
  }
  const { getDb } = await import("@/db/client");
  const { createTask } = await import("../tasks");
  const db = await getDb();
  await createTask(db, {
    title: `Background job failed: ${job.type}`,
    description: `${message}\n\nPayload: ${JSON.stringify(job.payload).slice(0, 500)}`,
    type: "other",
    priority: "high",
    dueAt: new Date(Date.now() + 24 * 3_600_000),
    ownerId: job.ownerId ?? null,
    dedupeKey: `job-dead:${job.id}`,
    createdBy: null,
  });
}
