/**
 * CLI entry point: `pnpm db:seed [--reset]`.
 *
 * Seeds the pilot dataset through the service layer. Refuses to run against a database that already
 * has users unless `--reset` is passed, in which case every application table is emptied first
 * (the embedded PGlite directory and local uploads are removed outright).
 *
 * Must run with the `react-server` condition so `server-only` modules load outside Next.js; the
 * package.json script sets it.
 */
import fs from "node:fs";
import path from "node:path";

function loadDotEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (fs.existsSync(full)) process.loadEnvFile(full);
  }
}

function printSummary(summary: Record<string, number>) {
  const width = Math.max(...Object.keys(summary).map((k) => k.length));
  for (const [key, value] of Object.entries(summary).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${key.padEnd(width)}  ${String(value).padStart(5)}`);
  }
}

async function main() {
  loadDotEnv();
  const args = new Set(process.argv.slice(2));
  const reset = args.has("--reset");
  const usingPostgres = Boolean(process.env.DATABASE_URL);

  if (reset && !usingPostgres) {
    for (const dir of [process.env.PGLITE_DATA_DIR ?? ".data/pglite", process.env.UPLOADS_DIR ?? ".data/uploads"]) {
      fs.rmSync(path.resolve(process.cwd(), dir), { recursive: true, force: true });
    }
    console.log("Removed local PGlite data and uploads.");
  }

  const { closeDb, getDb } = await import("@/db/client");
  const { isDatabaseEmpty, seedDatabase } = await import("@/db/seed");
  const { sql } = await import("drizzle-orm");
  const db = await getDb();

  if (reset && usingPostgres) {
    const result = await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`);
    const rows = ((result as { rows?: { table_name: string }[] }).rows ?? []) as { table_name: string }[];
    const names = rows.map((r) => `"${r.table_name}"`);
    if (names.length) await db.execute(sql.raw(`truncate table ${names.join(", ")} restart identity cascade`));
    console.log(`Truncated ${names.length} tables.`);
  }

  if (!(await isDatabaseEmpty(db))) {
    console.error("The database already contains users. Re-run with --reset to wipe it and seed again.");
    await closeDb();
    process.exit(1);
  }

  const started = Date.now();
  console.log(`Seeding pilot dataset into ${usingPostgres ? "Postgres" : "PGlite"} …`);
  const summary = await seedDatabase();
  printSummary(summary);
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
