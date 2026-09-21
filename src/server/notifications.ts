import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { notifications, users } from "@/db/schema";
import { logger } from "@/lib/logger";

type NotificationType = (typeof notifications.$inferInsert)["type"];

/** Creates an in-app notification, honouring the recipient's mute preferences. */
export async function notifyUser(
  db: DbOrTx,
  input: { userId: string | null | undefined; type: NotificationType; title: string; body?: string; link?: string },
): Promise<void> {
  if (!input.userId) return;
  try {
    const user = await db.query.users.findFirst({ where: eq(users.id, input.userId), columns: { notificationPrefs: true, status: true } });
    if (!user || user.status !== "active") return;
    const prefs = user.notificationPrefs;
    if (!prefs.inApp) return;
    if (input.type === "task" && !prefs.taskReminders) return;
    if (input.type === "message" && !prefs.messageFailures) return;
    await db.insert(notifications).values({ userId: input.userId, type: input.type, title: input.title, body: input.body ?? null, link: input.link ?? null });
  } catch (error) {
    logger.error("notification.create_failed", { error: String(error) });
  }
}

export async function listNotifications(userId: string, limit = 20) {
  const db = await getDb();
  const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { rows, unread: unread ?? 0 };
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  const db = await getDb();
  const now = new Date();
  if (ids && ids.length > 0) {
    for (const id of ids) {
      await db.update(notifications).set({ readAt: now }).where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)));
    }
    return;
  }
  await db.update(notifications).set({ readAt: now }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
