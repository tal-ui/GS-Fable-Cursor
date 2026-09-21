import "server-only";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sessions, users, type NotificationPrefs } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { cleanText } from "@/lib/sanitize";

/** Active sessions for the signed-in user, current one first. */
export async function listSessions(userId: string, currentSessionId: string | null) {
  const db = await getDb();
  const rows = await db
    .select({ id: sessions.id, ip: sessions.ip, userAgent: sessions.userAgent, createdAt: sessions.createdAt, lastActiveAt: sessions.lastActiveAt, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastActiveAt));
  return rows.map((r) => ({ ...r, isCurrent: r.id === currentSessionId })).sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
}

export async function revokeOtherSessions(userId: string, currentSessionId: string | null) {
  const db = await getDb();
  const rows = await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), currentSessionId ? ne(sessions.id, currentSessionId) : undefined))
    .returning({ id: sessions.id });
  await recordAudit(db, { entityType: "user", entityId: userId, action: "update", actorId: userId, note: `Revoked ${rows.length} other session(s)` });
  return rows.length;
}

/** Users may only edit their own contact details; role, status and verifier rights are admin-only. */
export async function updateOwnProfile(userId: string, input: { jobTitle?: string | null; phone?: string | null }) {
  const db = await getDb();
  const patch: Partial<typeof users.$inferInsert> = {};
  if (input.jobTitle !== undefined) patch.jobTitle = cleanText(input.jobTitle);
  if (input.phone !== undefined) patch.phone = cleanText(input.phone);
  const [row] = await db.update(users).set(patch).where(eq(users.id, userId)).returning({ id: users.id, jobTitle: users.jobTitle, phone: users.phone });
  return row!;
}

/** Per-user mute switches honoured by notifyUser and the email digest. */
export async function updateNotificationPrefs(userId: string, patch: Partial<NotificationPrefs>) {
  const db = await getDb();
  const current = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { notificationPrefs: true } });
  const next: NotificationPrefs = { ...(current?.notificationPrefs ?? { inApp: true, email: false, taskReminders: true, messageFailures: true }), ...patch };
  const [row] = await db.update(users).set({ notificationPrefs: next }).where(eq(users.id, userId)).returning({ notificationPrefs: users.notificationPrefs });
  return row!.notificationPrefs;
}
