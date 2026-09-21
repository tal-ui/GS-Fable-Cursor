/**
 * CLI entry point: `pnpm jobs:run`.
 *
 * Processes every due job once and exits. Intended for cron-style deployments where the inline
 * poller is disabled (JOBS_INLINE_RUNNER=false) and for local debugging of job handlers.
 */
import fs from "node:fs";
import path from "node:path";

function loadDotEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (fs.existsSync(full)) process.loadEnvFile(full);
  }
}

async function main() {
  loadDotEnv();
  const { closeDb } = await import("@/db/client");
  const { runPendingJobs, scheduleDailyMaintenance } = await import("@/server/jobs/worker");
  await scheduleDailyMaintenance();
  const result = await runPendingJobs(200);
  console.log(JSON.stringify(result));
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
