import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { consents } from "@/db/schema";

type Scope = typeof consents.$inferSelect.scope;

/** Returns the active (granted, not withdrawn) consent for a scope, optionally for a named customer. */
export async function activeConsent(db: DbOrTx, candidateId: string, scope: Scope, accountId?: string | null) {
  const where = [eq(consents.candidateId, candidateId), eq(consents.scope, scope), isNull(consents.withdrawnAt), eq(consents.isDeleted, false)];
  if (scope === "share_with_customer") {
    if (!accountId) return null;
    where.push(eq(consents.accountId, accountId));
  }
  const rows = await db
    .select()
    .from(consents)
    .where(and(...where))
    .orderBy(desc(consents.grantedAt))
    .limit(1);
  return rows[0] ?? null;
}

export function describeScope(scope: Scope): string {
  switch (scope) {
    case "process_profile":
      return "permission to process the profile";
    case "communicate":
      return "permission to contact the candidate";
    case "share_with_customer":
      return "permission to share with this customer";
  }
}
