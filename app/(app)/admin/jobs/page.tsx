import { requireAdminPage } from "@/lib/auth/viewer";
import { env } from "@/lib/env";
import { integrationErrors, jobCounts, listJobs, webhookLog } from "@/server/admin";
import { Page, PageHeader } from "@/components/app/page-header";
import { JobsView } from "./jobs-view";

export const metadata = { title: "Jobs & integrations" };

const STATUSES = new Set(["queued", "running", "succeeded", "failed", "dead"]);

export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  const params = await searchParams;
  const requested = typeof params.status === "string" ? params.status.split(",").filter((s) => STATUSES.has(s)) : [];
  const statusFilter = requested.length ? requested.join(",") : undefined;
  const tab = typeof params.tab === "string" ? params.tab : "jobs";

  const [counts, jobs, errors, webhooks] = await Promise.all([jobCounts(), listJobs(statusFilter, 150), integrationErrors(100), webhookLog(100)]);

  return (
    <Page wide>
      <PageHeader
        title="Jobs & integrations"
        description="Every outbound call (WhatsApp, email, AI, matching recompute, imports) runs as a background job with exponential backoff and at most 3 attempts. Dead jobs stay visible here until retried."
      />
      <JobsView
        counts={counts}
        statusFilter={requested}
        initialTab={tab}
        jobs={jobs.map((j) => ({ id: j.id, type: j.type, status: j.status, attempts: j.attempts, maxAttempts: j.maxAttempts, runAt: j.runAt, startedAt: j.startedAt, finishedAt: j.finishedAt, lastError: j.lastError, payload: j.payload, result: j.result, updatedAt: j.updatedAt, createdAt: j.createdAt, lockedBy: j.lockedBy }))}
        errors={errors.map((e) => ({ id: e.id, integration: e.integration, operation: e.operation, errorMessage: e.errorMessage, errorCode: e.errorCode, attempts: e.attempts, jobId: e.jobId, resolvedAt: e.resolvedAt, createdAt: e.createdAt, payload: e.payload }))}
        webhooks={webhooks.map((w) => ({ id: w.id, provider: w.provider, externalEventId: w.externalEventId, signatureValid: w.signatureValid, processedAt: w.processedAt, error: w.error, createdAt: w.createdAt, payload: w.payload }))}
        runner={{ inline: env.jobsInlineRunner, pollMs: env.JOBS_POLL_INTERVAL_MS, timeoutMs: env.INTEGRATION_TIMEOUT_MS, slack: Boolean(env.SLACK_ALERT_WEBHOOK_URL) }}
      />
    </Page>
  );
}
