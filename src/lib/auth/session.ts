import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const SESSION_COOKIE = "scrm_session";
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type CurrentUser = typeof users.$inferSelect;
export type SessionContext = { user: CurrentUser; sessionId: string };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function idleMs(): number {
  return env.SESSION_IDLE_HOURS * 60 * 60 * 1000;
}

export async function createSession(userId: string, meta: { ip: string | null; userAgent: string | null }): Promise<void> {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + idleMs());
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt, ip: meta.ip, userAgent: meta.userAgent });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
    maxAge: Math.floor(idleMs() / 1000),
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

/**
 * Resolves the signed-in user for this request. Cached per request.
 * Enforces the idle timeout (sliding window) and refuses deactivated/deleted users.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const now = new Date();
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.user.isDeleted || row.user.status === "deactivated") {
    await db.delete(sessions).where(eq(sessions.id, row.session.id));
    return null;
  }
  if (now.getTime() - row.session.lastActiveAt.getTime() > TOUCH_INTERVAL_MS) {
    db.update(sessions)
      .set({ lastActiveAt: now, expiresAt: new Date(now.getTime() + idleMs()) })
      .where(eq(sessions.id, row.session.id))
      .catch((error: unknown) => logger.warn("session.touch_failed", { error: String(error) }));
  }
  return { user: row.user, sessionId: row.session.id };
});

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const ctx = await getSessionContext();
  return ctx?.user ?? null;
}
