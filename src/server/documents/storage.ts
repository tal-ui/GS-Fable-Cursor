import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";
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

/**
 * Keys are namespaced by Vercel environment, so preview deployments and local dev (with pulled env)
 * never read, overwrite or orphan production files in the shared store.
 */
const blobPath = (key: string) => `${process.env.VERCEL_ENV ?? "local"}/${key}`;

/**
 * Private Vercel Blob store (serverless file systems are read-only and per-instance). Reads skip the
 * CDN cache and uploads set the shortest cache lifetime, so an erased identity document is not
 * served from an edge copy.
 */
export const blobStorageAdapter: StorageAdapter = {
  async put(key, data) {
    await put(blobPath(key), data, { access: "private", cacheControlMaxAge: 60 });
  },
  async get(key) {
    const result = await get(blobPath(key), { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) throw new Error("Stored file not found");
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  },
  async remove(key) {
    await del(blobPath(key));
  },
};

export const storage: StorageAdapter = env.blobStorageEnabled ? blobStorageAdapter : localStorageAdapter;
