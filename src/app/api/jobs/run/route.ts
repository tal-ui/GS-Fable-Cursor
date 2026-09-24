import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { runPendingJobs, scheduleDailyMaintenance } from "@/server/jobs/worker";

function authorized(request: NextRequest): boolean {
  if (!env.JOBS_SECRET) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token.length !== env.JOBS_SECRET.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(env.JOBS_SECRET));
}

/**
 * External job runner endpoint for cron/scheduler deployments (e.g. Vercel Cron, GitHub Actions).
 * Protected by JOBS_SECRET. The inline poller covers local and single-instance deployments.
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await scheduleDailyMaintenance();
    const result = await runPendingJobs(50);
    return NextResponse.json(result);
  } catch (error) {
    logger.error("jobs.run_endpoint_failed", { error: String(error) });
    return NextResponse.json({ error: "Job run failed" }, { status: 500 });
  }
}

/** Vercel Cron calls with GET and `Authorization: Bearer $CRON_SECRET`; set JOBS_SECRET to the same value. */
export const GET = POST;
