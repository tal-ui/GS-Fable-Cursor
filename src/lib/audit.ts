import "server-only";
import type { DbOrTx } from "@/db/client";
import { auditLog, type auditActionEnum } from "@/db/schema";
import { getRequestMeta } from "@/lib/request-context";

type AuditAction = (typeof auditActionEnum.enumValues)[number];

const OMIT_KEYS = new Set(["updatedAt", "createdAt", "extractedText", "snapshot", "rows"]);

function trim(record: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!record) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (OMIT_KEYS.has(k)) continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

/** Records a before/after audit entry for sensitive changes. Works inside transactions. */
export async function recordAudit(
  db: DbOrTx,
  input: {
    entityType: string;
    entityId: string;
    action: AuditAction;
    actorId: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    note?: string;
  },
): Promise<void> {
  const meta = await getRequestMeta();
  await db.insert(auditLog).values({
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actorId: input.actorId,
    before: trim(input.before),
    after: trim(input.after),
    ip: meta.ip,
    note: input.note ?? null,
  });
}
