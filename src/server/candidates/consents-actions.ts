import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { consents } from "@/db/schema";
import { recordAudit } from "@/lib/audit";

/** System-initiated withdrawal (e.g. WhatsApp STOP keyword). No user context; audited as system. */
export async function withdrawConsentByCandidate(candidateId: string, scope: typeof consents.$inferSelect.scope, evidence: string): Promise<void> {
  const db = await getDb();
  const rows = await db
    .update(consents)
    .set({ withdrawnAt: new Date(), evidence })
    .where(and(eq(consents.candidateId, candidateId), eq(consents.scope, scope), isNull(consents.withdrawnAt)))
    .returning({ id: consents.id });
  for (const r of rows) {
    await recordAudit(db, { entityType: "consent", entityId: r.id, action: "update", actorId: null, after: { withdrawnAt: new Date().toISOString(), evidence }, note: "withdrawn by candidate" });
  }
}
