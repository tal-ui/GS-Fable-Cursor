import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { placements, requisitions } from "@/db/schema";
import { conflict } from "@/lib/errors";
import { SEAT_HOLDING_STATUSES } from "../requisitions";

export type Overlap = { placementId: string; requisitionId: string; start: string; end: string | null };

/**
 * Finds seat-holding placements for the candidate whose dates overlap the proposed window.
 * An open-ended placement (no end) overlaps anything that starts after it does.
 */
export async function detectOverlap(db: DbOrTx, candidateId: string, start: string, end: string | null, excludePlacementId?: string | null): Promise<Overlap[]> {
  const rows = await db
    .select({ id: placements.id, requisitionId: placements.requisitionId, plannedStart: placements.plannedStart, plannedEnd: placements.plannedEnd, actualStart: placements.actualStart, actualEnd: placements.actualEnd })
    .from(placements)
    .where(and(eq(placements.candidateId, candidateId), eq(placements.isDeleted, false), inArray(placements.status, [...SEAT_HOLDING_STATUSES]), excludePlacementId ? ne(placements.id, excludePlacementId) : undefined));
  const out: Overlap[] = [];
  for (const p of rows) {
    const pStart = p.actualStart ?? p.plannedStart;
    const pEnd = p.actualEnd ?? p.plannedEnd;
    const startsBeforeOtherEnds = pEnd === null || start <= pEnd;
    const endsAfterOtherStarts = end === null || end >= pStart;
    if (startsBeforeOtherEnds && endsAfterOtherStarts) out.push({ placementId: p.id, requisitionId: p.requisitionId, start: pStart, end: pEnd });
  }
  return out;
}

/**
 * Reserves one seat atomically. The requisition row is locked for the duration of the transaction
 * so two concurrent acceptances cannot both pass the headcount check and take the last seat.
 * Must be called inside a transaction.
 */
export async function reserveSeat(
  tx: DbOrTx,
  input: {
    requisitionId: string;
    submissionId: string;
    candidateId: string;
    accountId: string;
    plannedStart: string;
    plannedEnd: string | null;
    ownerId: string | null;
    actorId: string | null;
    replacementOfId?: string | null;
    terms?: Partial<Pick<typeof placements.$inferInsert, "billRateAmount" | "billRateCurrency" | "billRatePeriod" | "payRateAmount" | "payRateCurrency" | "payRatePeriod" | "grossNet">>;
  },
): Promise<typeof placements.$inferSelect> {
  await tx.execute(sql`select id from ${requisitions} where id = ${input.requisitionId} for update`);
  const [req] = await tx.select({ headcount: requisitions.headcountApproved, status: requisitions.status }).from(requisitions).where(eq(requisitions.id, input.requisitionId));
  if (!req) throw conflict("The requisition no longer exists.");
  if (["closed", "cancelled"].includes(req.status)) throw conflict("This requisition is closed; reopen it before reserving a seat.");
  const [taken] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(placements)
    .where(and(eq(placements.requisitionId, input.requisitionId), eq(placements.isDeleted, false), inArray(placements.status, [...SEAT_HOLDING_STATUSES])));
  const seatsTaken = taken?.n ?? 0;
  if (seatsTaken >= req.headcount) {
    throw conflict(`No open seats: ${seatsTaken} of ${req.headcount} seats are already reserved or filled.`);
  }
  const overlaps = await detectOverlap(tx, input.candidateId, input.plannedStart, input.plannedEnd);
  if (overlaps.length) {
    throw conflict(`This candidate already holds an assignment from ${overlaps[0]!.start}${overlaps[0]!.end ? ` to ${overlaps[0]!.end}` : ""} that overlaps the proposed dates.`);
  }
  const [placement] = await tx
    .insert(placements)
    .values({
      submissionId: input.submissionId,
      candidateId: input.candidateId,
      requisitionId: input.requisitionId,
      accountId: input.accountId,
      status: "reserved",
      plannedStart: input.plannedStart,
      plannedEnd: input.plannedEnd,
      ownerId: input.ownerId,
      replacementOfId: input.replacementOfId ?? null,
      checklist: DEFAULT_CHECKLIST.map((c) => ({ ...c, done: false })),
      createdBy: input.actorId,
      ...(input.terms ?? {}),
    })
    .returning();
  return placement!;
}

export const DEFAULT_CHECKLIST = [
  { key: "contract_signed", label: "Contract signed by candidate" },
  { key: "work_auth_confirmed", label: "Work authorization evidence confirmed for destination" },
  { key: "travel_arranged", label: "Travel / relocation arranged" },
  { key: "customer_confirmed_start", label: "Customer confirmed start date and site" },
  { key: "onboarding_docs", label: "Onboarding documents delivered" },
];
