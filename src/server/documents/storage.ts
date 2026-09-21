import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * Private object storage adapter. The local implementation writes under UPLOADS_DIR, which is
 * never served statically; every download goes through the authorisation-checked route handler.
 * Swap for S3/Supabase Storage by implementing the same three methods.
 */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

function safeKeyPath(key: string): string {
  // Runtime data directory, not a build asset: keep Turbopack from tracing the whole project.
  const root = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.UPLOADS_DIR);
  const target = path.resolve(root, key);
  if (!target.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return target;
}

export const localStorageAdapter: StorageAdapter = {
  async put(key, data) {
    const target = safeKeyPath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data, { mode: 0o600 });
  },
  async get(key) {
    return fs.readFile(safeKeyPath(key));
  },
  async remove(key) {
    await fs.rm(safeKeyPath(key), { force: true });
  },
};

export const storage: StorageAdapter = localStorageAdapter;
