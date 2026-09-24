import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, vi } from "vitest";

/**
 * Global test harness. Each vitest worker gets its own embedded PGlite directory so integration
 * suites can seed and mutate freely, and the Next.js request-scoped modules are replaced with
 * inert equivalents since there is no request in a unit test.
 */
const runDir = path.join(os.tmpdir(), `staffing-crm-test-${process.pid}-${randomUUID().slice(0, 8)}`);
process.env.PGLITE_DATA_DIR = path.join(runDir, "pglite");
process.env.UPLOADS_DIR = path.join(runDir, "uploads");
process.env.SEED_ON_EMPTY = "false";
process.env.JOBS_INLINE_RUNNER = "false";
process.env.DEV_LOGIN_ENABLED = "false";
delete process.env.DATABASE_URL;
delete process.env.BLOB_READ_WRITE_TOKEN;

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-invoke-path": "/test", "user-agent": "vitest", "x-forwarded-for": "127.0.0.1" }),
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

afterAll(async () => {
  try {
    const { closeDb } = await import("@/db/client");
    await closeDb();
  } catch {
    // The suite never opened a database.
  }
  fs.rmSync(runDir, { recursive: true, force: true });
});
