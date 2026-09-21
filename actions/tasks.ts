"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { optionalUuid, requiredText, uuid } from "@/lib/schemas/common";
import { manualTaskSchema, taskStatus } from "@/lib/schemas/tasks";
import { getDb } from "@/db/client";
import { bulkReassignTasks, bulkUpdateTaskStatus, createTask, reassignTask, updateTaskStatus } from "@/server/tasks";
import { markNotificationsRead } from "@/server/notifications";
import { requireUser } from "@/lib/auth/authorize";
import { deleteFilter, saveFilter } from "@/server/saved-filters";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { NotificationPrefs } from "@/db/schema/auth";

function touch(input: { candidateId?: string | null; accountId?: string | null; requisitionId?: string | null; submissionId?: string | null; placementId?: string | null }) {
  revalidatePath("/work-queue");
  revalidatePath("/dashboard");
  if (input.candidateId) revalidatePath(`/candidates/${input.candidateId}`);
  if (input.accountId) revalidatePath(`/accounts/${input.accountId}`);
  if (input.requisitionId) revalidatePath(`/requisitions/${input.requisitionId}`);
  if (input.submissionId) revalidatePath(`/submissions/${input.submissionId}`);
  if (input.placementId) revalidatePath(`/placements/${input.placementId}`);
}

export const createTaskAction = defineAction({ permission: "write", resource: "task", schema: manualTaskSchema }, async (input, user) => {
  const db = await getDb();
  const row = await createTask(db, {
    type: "other",
    title: input.title,
    description: input.description,
    priority: input.priority,
    dueAt: input.dueAt,
    ownerId: input.ownerId ?? user.id,
    candidateId: input.candidateId,
    accountId: input.accountId,
    requisitionId: input.requisitionId,
    submissionId: input.submissionId,
    placementId: input.placementId,
    createdBy: user.id,
  });
  touch(input);
  return { id: row?.id ?? null };
});

export const updateTaskStatusAction = defineAction({ permission: "write", resource: "task", schema: z.object({ id: uuid, status: taskStatus }) }, async ({ id, status }, user) => {
  const row = await updateTaskStatus(user, id, status);
  touch(row);
  return { status: row.status };
});

export const reassignTaskAction = defineAction({ permission: "write", resource: "task", schema: z.object({ id: uuid, ownerId: optionalUuid }) }, async ({ id, ownerId }, user) => {
  const row = await reassignTask(user, id, ownerId);
  touch(row);
});

export const bulkTaskStatusAction = defineAction({ permission: "bulk", resource: "task", schema: z.object({ ids: z.array(uuid).min(1).max(200), status: taskStatus }) }, async ({ ids, status }, user) => {
  const rows = await bulkUpdateTaskStatus(user, ids, status);
  for (const row of rows) touch(row);
  return { count: rows.length };
});

export const bulkReassignTasksAction = defineAction({ permission: "bulk", resource: "task", schema: z.object({ ids: z.array(uuid).min(1).max(200), ownerId: optionalUuid }) }, async ({ ids, ownerId }, user) => {
  const rows = await bulkReassignTasks(user, ids, ownerId);
  revalidatePath("/work-queue");
  return { count: rows.length };
});

export const markNotificationsReadAction = defineAction({ permission: "read", resource: "notification", schema: z.object({ ids: z.array(uuid).optional() }) }, async ({ ids }, user) => {
  await markNotificationsRead(user.id, ids);
  revalidatePath("/", "layout");
});

export const saveFilterAction = defineAction(
  { permission: "read", resource: "saved_filter", schema: z.object({ entity: z.string().trim().min(1).max(40), name: requiredText("Name", 60), filters: z.record(z.string(), z.string()), isDefault: z.boolean().default(false) }) },
  async (input, user) => {
    const row = await saveFilter(user.id, input);
    revalidatePath(`/${input.entity}`);
    return { id: row.id };
  },
);

export const deleteFilterAction = defineAction({ permission: "read", resource: "saved_filter", schema: z.object({ id: uuid, entity: z.string() }) }, async ({ id, entity }, user) => {
  await deleteFilter(user.id, id);
  revalidatePath(`/${entity}`);
});

const prefsSchema = z.object({ inApp: z.boolean(), email: z.boolean(), taskReminders: z.boolean(), messageFailures: z.boolean() });

/** Users manage their own notification preferences regardless of role (read-only included). */
export const updateNotificationPrefsAction = defineAction({ permission: "read", resource: "profile", schema: prefsSchema }, async (input) => {
  const user = await requireUser();
  const db = await getDb();
  await db.update(users).set({ notificationPrefs: input satisfies NotificationPrefs }).where(eq(users.id, user.id));
  revalidatePath("/profile");
});
