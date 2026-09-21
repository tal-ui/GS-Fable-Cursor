import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@/db/client";
import { sources } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { cleanText, normalizeEmail } from "@/lib/sanitize";
import type { sourceSchema } from "@/lib/schemas/crm";

export async function listSources(activeOnly = false) {
  const db = await getDb();
  return db
    .select()
    .from(sources)
    .where(and(eq(sources.isDeleted, false), activeOnly ? eq(sources.isActive, true) : undefined))
    .orderBy(asc(sources.name));
}

export async function upsertSource(user: CurrentUser, input: z.output<typeof sourceSchema>) {
  const db = await getDb();
  const values = {
    name: cleanText(input.name)!,
    type: input.type,
    contactName: cleanText(input.contactName),
    contactEmail: normalizeEmail(input.contactEmail),
    contactPhone: input.contactPhone,
    commissionTerms: cleanText(input.commissionTerms),
    isActive: input.isActive,
  };
  if (input.id) {
    const [row] = await db.update(sources).set(values).where(and(eq(sources.id, input.id), eq(sources.isDeleted, false))).returning();
    if (!row) throw notFound("Source");
    await recordAudit(db, { entityType: "source", entityId: row.id, action: "update", actorId: user.id, after: values });
    return row;
  }
  const [row] = await db.insert(sources).values({ ...values, createdBy: user.id }).returning();
  await recordAudit(db, { entityType: "source", entityId: row!.id, action: "create", actorId: user.id, after: values });
  return row!;
}

export async function archiveSource(user: CurrentUser, id: string) {
  const db = await getDb();
  const [row] = await db.update(sources).set({ isDeleted: true, isActive: false }).where(eq(sources.id, id)).returning();
  if (!row) throw notFound("Source");
  await recordAudit(db, { entityType: "source", entityId: id, action: "delete", actorId: user.id });
}
