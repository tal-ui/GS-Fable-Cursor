import "server-only";
import path from "node:path";
import fs from "node:fs";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import * as schema from "./schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Driver-agnostic database type. Both the PGlite and node-postgres drivers extend PgDatabase, so
 * services are written once against this base type. Transactions extend it too, so any service
 * helper accepting `DbOrTx` works inside or outside a transaction.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Transaction = PgTransaction<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
export type DbOrTx = Database;

type Globals = typeof globalThis & {
  __staffingDb?: Promise<Database>;
  __staffingDbClose?: () => Promise<void>;
  __staffingDbMigrate?: () => Promise<void>;
  __staffingDbJournal?: string;
  __staffingDbHooks?: boolean;
};

const globals = globalThis as Globals;
const migrationsFolder = path.join(process.cwd(), "drizzle");
const journalPath = path.join(migrationsFolder, "meta", "_journal.json");

/** Identity of the migration set on disk; drizzle-kit rewrites the journal whenever it generates a migration. */
function journalSignature(): string {
  try {
    const s = fs.statSync(journalPath);
    return `${s.size}:${s.mtimeMs}`;
  } catch {
    return "";
  }
}

async function createDatabase(): Promise<Database> {
  if (env.DATABASE_URL) {
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
    const db = drizzlePg(pool, { schema, casing: "snake_case" });
    globals.__staffingDbMigrate = () => migratePg(db, { migrationsFolder });
    globals.__staffingDbJournal = journalSignature();
    await globals.__staffingDbMigrate();
    globals.__staffingDbClose = () => pool.end();
    logger.info("db.ready", { driver: "postgres" });
    return db as unknown as Database;
  }

  // Runtime data directory, not a build asset: keep Turbopack from tracing the whole project.
  const dataDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.PGLITE_DATA_DIR);
  fs.mkdirSync(dataDir, { recursive: true });
  const client = await openPglite(dataDir);
  const db = drizzlePglite(client, { schema, casing: "snake_case" });
  globals.__staffingDbMigrate = () => migratePglite(db, { migrationsFolder });
  globals.__staffingDbJournal = journalSignature();
  await globals.__staffingDbMigrate();
  globals.__staffingDbClose = () => client.close();
  installShutdownHooks();
  logger.info("db.ready", { driver: "pglite", dataDir });
  return db as unknown as Database;
}

/**
 * The handle is cached for the life of the dev server, but `pnpm db:generate` can add a migration
 * while it runs. Hot reload then serves code that expects the new columns against a database that
 * never saw them ("column … does not exist" on every page). Outside production the journal is
 * re-checked on access and any new migration is applied before the next query; the drizzle
 * migrator only runs entries that are not yet recorded, so this is idempotent.
 */
function catchUpMigrations(current: Promise<Database>): Promise<Database> {
  const migrate = globals.__staffingDbMigrate;
  if (env.isProd || !migrate) return current;
  const signature = journalSignature();
  if (signature === globals.__staffingDbJournal) return current;
  globals.__staffingDbJournal = signature;
  return current.then(async (db) => {
    try {
      await migrate();
      logger.info("db.migrated", { reason: "migration journal changed while running" });
    } catch (error) {
      logger.error("db.migrate_failed", { message: "A migration generated while the server was running could not be applied. Restart the dev server after fixing it.", cause: String(error).slice(0, 300) });
    }
    return db;
  });
}

/**
 * Opens the embedded database. PGlite has no background checkpointer, so a dev server that is killed
 * mid-write can leave a directory Postgres refuses to recover ("could not locate a valid checkpoint
 * record"). Outside production the directory is quarantined next to itself and a fresh one is opened;
 * SEED_ON_EMPTY then rebuilds the pilot dataset on the next request. Nothing is deleted.
 */
async function openPglite(dataDir: string): Promise<PGlite> {
  try {
    const client = new PGlite(dataDir);
    await client.waitReady;
    return client;
  } catch (error) {
    if (env.isProd || !fs.existsSync(path.join(dataDir, "PG_VERSION"))) throw error;
    const quarantine = `${dataDir}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.renameSync(dataDir, quarantine);
    logger.error("db.pglite_unrecoverable", {
      message: "The embedded database could not be recovered after an interrupted shutdown. It was moved aside and a fresh database was created.",
      quarantine,
      cause: String(error).slice(0, 200),
    });
    fs.mkdirSync(dataDir, { recursive: true });
    const client = new PGlite(dataDir);
    await client.waitReady;
    return client;
  }
}

/**
 * Best-effort checkpoint on SIGINT/SIGTERM so Ctrl-C on the dev server leaves a consistent directory.
 * When nothing else listens for the signal (CLI entry points) the process still terminates with the
 * conventional 128+signal exit code once the database is closed; under Next the server's own handler exits.
 */
function installShutdownHooks() {
  if (globals.__staffingDbHooks) return;
  globals.__staffingDbHooks = true;
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
    const alone = process.listenerCount(signal) === 0;
    process.once(signal, () => {
      void closeDb()
        .catch(() => undefined)
        .finally(() => {
          if (alone) process.exit(code);
        });
    });
  }
}

/** Flushes and releases the connection. Used by CLI entry points (seed, one-shot job runner). */
export async function closeDb(): Promise<void> {
  if (!globals.__staffingDb) return;
  await globals.__staffingDb.catch(() => undefined);
  await globals.__staffingDbClose?.();
  globals.__staffingDb = undefined;
  globals.__staffingDbClose = undefined;
  globals.__staffingDbMigrate = undefined;
  globals.__staffingDbJournal = undefined;
}

/**
 * Lazily initialised, process-wide database handle. Migrations run on first access and, outside
 * production, again whenever the migration journal changes on disk.
 * Cached on globalThis so Next.js dev HMR does not open a second PGlite instance on the same directory.
 */
export function getDb(): Promise<Database> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    // A page reached the database while `next build` was prerendering it. Build machines hold no data
    // and must never seed one; the route needs `export const dynamic = "force-dynamic"` (or a request API first).
    return Promise.reject(new Error("The database cannot be opened during `next build`. Every route that reads it must render per request."));
  }
  if (!globals.__staffingDb) {
    globals.__staffingDb = createDatabase().catch((error) => {
      globals.__staffingDb = undefined;
      throw error;
    });
  } else {
    globals.__staffingDb = catchUpMigrations(globals.__staffingDb);
  }
  return globals.__staffingDb;
}

export { schema };
