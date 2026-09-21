"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { optionalPhone, optionalText } from "@/lib/schemas/common";
import { getSessionContext } from "@/lib/auth/session";
import { revokeOtherSessions, updateNotificationPrefs, updateOwnProfile } from "@/server/profile";

/** Profile edits are self-service for every role, including Read Only — they never touch role or status. */
export const updateProfileAction = defineAction({ permission: "read", resource: "profile", schema: z.object({ jobTitle: optionalText(80), phone: optionalPhone }) }, async (input, user) => {
  const row = await updateOwnProfile(user.id, input);
  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return row;
});

export const updateNotificationPrefsAction = defineAction(
  {
    permission: "read",
    resource: "notification_prefs",
    schema: z.object({ inApp: z.boolean().optional(), email: z.boolean().optional(), taskReminders: z.boolean().optional(), messageFailures: z.boolean().optional() }),
  },
  async (input, user) => {
    const prefs = await updateNotificationPrefs(user.id, input);
    revalidatePath("/profile");
    return prefs;
  },
);

export const revokeOtherSessionsAction = defineAction({ permission: "read", resource: "session", schema: z.object({}) }, async (_input, user) => {
  const ctx = await getSessionContext();
  const count = await revokeOtherSessions(user.id, ctx?.sessionId ?? null);
  revalidatePath("/profile");
  return { count };
});
