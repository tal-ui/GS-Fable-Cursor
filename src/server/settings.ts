import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appSettings } from "@/db/schema";

export type AppSettingsShape = {
  /** team: all active staff share the pool and CRM (one staffing company). owner: users only see records they own or that are unassigned. */
  sharing_model: "team" | "owner";
  availability_freshness_days: number;
  verification_stale_days: number;
  submission_stall_days: number;
  requisition_stall_days: number;
  task_default_due_hours: number;
  disclosure_default_fields: string[];
  whatsapp_service_window_hours: number;
  /** Months of inactivity after which a candidate profile falls due for retention review. */
  candidate_retention_months: number;
  /** Days between the retention review being raised and the profile becoming eligible for erasure. */
  retention_grace_days: number;
};

export const DEFAULT_SETTINGS: AppSettingsShape = {
  sharing_model: "team",
  availability_freshness_days: 30,
  verification_stale_days: 365,
  submission_stall_days: 5,
  requisition_stall_days: 7,
  task_default_due_hours: 48,
  disclosure_default_fields: ["headline", "summary", "skills", "languages", "availability", "work_authorization", "military_role"],
  whatsapp_service_window_hours: 24,
  candidate_retention_months: 24,
  retention_grace_days: 30,
};

export const SETTING_DESCRIPTIONS: Record<keyof AppSettingsShape, string> = {
  sharing_model: "Who can see records: the whole team, or only owners (plus unassigned records).",
  availability_freshness_days: "Days after which an unconfirmed availability is treated as stale (matching → review).",
  verification_stale_days: "Days after which a verification must be re-reviewed before it counts as evidence.",
  submission_stall_days: "Days without a stage change before a submission is flagged as stalled.",
  requisition_stall_days: "Days an open requisition may go without a new submission before it is flagged.",
  task_default_due_hours: "Default due window for automation-created tasks.",
  disclosure_default_fields: "Fields pre-selected when sharing a candidate summary with a customer.",
  whatsapp_service_window_hours: "Free-form WhatsApp replies are allowed only within this window after the last inbound message.",
  candidate_retention_months: "Months without any activity, submission or permission change after which a profile is due for retention review. Withdrawn processing permission makes it due immediately.",
  retention_grace_days: "Days after the retention review is raised before the profile can be erased. Erasure is always a deliberate Super Admin action.",
};

let cache: { value: AppSettingsShape; loadedAt: number } | null = null;
const TTL_MS = 15_000;

export async function getSettings(): Promise<AppSettingsShape> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.value;
  const db = await getDb();
  const rows = await db.select().from(appSettings);
  const merged: AppSettingsShape = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in merged) (merged as Record<string, unknown>)[row.key] = row.value;
  }
  cache = { value: merged, loadedAt: Date.now() };
  return merged;
}

export async function setSetting<K extends keyof AppSettingsShape>(key: K, value: AppSettingsShape[K], userId: string): Promise<void> {
  const db = await getDb();
  await db
    .insert(appSettings)
    .values({ key, value, description: SETTING_DESCRIPTIONS[key], updatedBy: userId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
  cache = null;
}

export async function getSettingsRows() {
  const db = await getDb();
  const rows = await db.select().from(appSettings);
  const byKey = new Map(rows.map((r) => [r.key, r] as const));
  return (Object.keys(DEFAULT_SETTINGS) as (keyof AppSettingsShape)[]).map((key) => ({
    key,
    value: byKey.get(key)?.value ?? DEFAULT_SETTINGS[key],
    description: SETTING_DESCRIPTIONS[key],
    updatedAt: byKey.get(key)?.updatedAt ?? null,
    isDefault: !byKey.has(key),
  }));
}

export function invalidateSettingsCache() {
  cache = null;
}

export { eq };
