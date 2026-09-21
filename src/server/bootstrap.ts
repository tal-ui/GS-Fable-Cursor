import "server-only";
import { getDb, type Database } from "@/db/client";
import { seedIfEmpty } from "@/db/seed";
import { env } from "@/lib/env";
import { startInlineWorker } from "@/server/jobs/worker";

/**
 * First-request initialisation shared by every entry point that touches the database from a
 * request (login page, app shell, dev sign-in). Runs migrations, seeds the pilot dataset when the
 * database is empty and SEED_ON_EMPTY allows it, and starts the in-process job poller.
 *
 * In production the database is never seeded; the first Google sign-in bootstraps a Super Admin.
 */
export async function ensureBootstrapped(): Promise<Database> {
  const db = await getDb();
  if (env.seedOnEmpty) await seedIfEmpty(db);
  startInlineWorker();
  return db;
}
