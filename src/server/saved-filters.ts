import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { savedFilters } from "@/db/schema";
import { notFound } from "@/lib/errors";
import { cleanText } from "@/lib/sanitize";

export async function listSavedFilters(userId: string, entity: string) {
  const db = await getDb();
  return db.select().from(savedFilters).where(and(eq(savedFilters.userId, userId), eq(savedFilters.entity, entity), eq(savedFilters.isDeleted, false))).orderBy(asc(savedFilters.name));
}

export async function listAllSavedFilters(userId: string) {
  const db = await getDb();
  return db.select().from(savedFilters).where(and(eq(savedFilters.userId, userId), eq(savedFilters.isDeleted, false))).orderBy(asc(savedFilters.entity), asc(savedFilters.name));
}

export async function saveFilter(userId: string, input: { entity: string; name: string; filters: Record<string, string>; isDefault?: boolean }) {
  const db = await getDb();
  const name = cleanText(input.name)?.slice(0, 60) || "Saved view";
  return db.transaction(async (tx) => {
    if (input.isDefault) await tx.update(savedFilters).set({ isDefault: false }).where(and(eq(savedFilters.userId, userId), eq(savedFilters.entity, input.entity)));
    const [row] = await tx
      .insert(savedFilters)
      .values({ userId, entity: input.entity, name, filters: input.filters, isDefault: input.isDefault ?? false, createdBy: userId })
      .returning();
    return row!;
  });
}

export async function deleteFilter(userId: string, id: string) {
  const db = await getDb();
  const [row] = await db.update(savedFilters).set({ isDeleted: true }).where(and(eq(savedFilters.id, id), eq(savedFilters.userId, userId))).returning();
  if (!row) throw notFound("Saved view");
}
