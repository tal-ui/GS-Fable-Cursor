/**
 * Scenario helpers shared by the integration suites. They drive the real service layer, so every fixture
 * passes the same validation, permission and audit code paths as a recruiter would.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import type { Database } from "@/db/client";
import { candidates, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { stageChangeSchema } from "@/lib/schemas/pipeline";
import { requirementsVersionSchema, requisitionSchema } from "@/lib/schemas/requisitions";
import { changeStage, confirmInterest, type Stage } from "@/server/pipeline/submissions";
import { changeRequisitionStatus, createRequisition, saveRequirementsVersion } from "@/server/requisitions";

export type SeededUserKey = "noa" | "daniel" | "maya" | "yossi" | "lior";

const EMAILS: Record<SeededUserKey, string> = {
  noa: "noa.adler@relaystaffing.example",
  daniel: "daniel.peretz@relaystaffing.example",
  maya: "maya.cohen@relaystaffing.example",
  yossi: "yossi.bendavid@relaystaffing.example",
  lior: "lior.katz@relaystaffing.example",
};

export async function loadSeededUsers(db: Database): Promise<(key: SeededUserKey) => CurrentUser> {
  const byEmail = new Map<string, CurrentUser>();
  for (const row of await db.select().from(users)) byEmail.set(row.email, row);
  return (key) => {
    const u = byEmail.get(EMAILS[key]);
    if (!u) throw new Error(`missing seeded user ${key}`);
    return u;
  };
}

export const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

export async function candidateByEmail(db: Database, email: string) {
  const row = await db.query.candidates.findFirst({ where: and(eq(candidates.email, email), isNull(candidates.mergedIntoId)) });
  if (!row) throw new Error(`missing seeded candidate ${email}`);
  return row;
}

export async function accountByName(db: Database, name: string) {
  const row = await db.query.accounts.findFirst({ where: (t, { eq: e }) => e(t.name, name) });
  if (!row) throw new Error(`missing seeded account ${name}`);
  return row;
}

/** Walks a submission through the given stages, using the interest confirmation flow where the stage machine requires it. */
export async function advance(actor: CurrentUser, submissionId: string, path: Stage[], extra: Partial<z.input<typeof stageChangeSchema>> = {}) {
  for (const toStage of path) {
    if (toStage === "interested") {
      await confirmInterest(actor, { submissionId, interest: true, availabilityConfirmed: true, channel: "phone", notes: null });
      continue;
    }
    await changeStage(actor, stageChangeSchema.parse({ submissionId, toStage, reason: null, notes: null, plannedStart: null, plannedEnd: null, overrideReview: false, ...extra }));
  }
}

/** A requisition whose only mandatory rule every seeded candidate passes, so eligibility hinges on consent. */
export async function openRequisition(db: Database, owner: CurrentUser, accountName: string, headcount: number, startDays: number) {
  const account = await accountByName(db, accountName);
  const id = await createRequisition(
    owner,
    requisitionSchema.parse({
      accountId: account.id,
      title: `Test requisition ${headcount} seat(s)`,
      description: null,
      locationCountry: account.country ?? "DE",
      startDate: isoDay(startDays),
      endDate: isoDay(startDays + 28),
      durationWeeks: 4,
      headcountApproved: headcount,
      status: "draft",
      priority: "medium",
      ownerId: owner.id,
    }),
  );
  await saveRequirementsVersion(
    owner,
    requirementsVersionSchema.parse({
      requisitionId: id,
      changeSummary: "Test rules",
      requirements: [{ kind: "mandatory", field: "experience_years", operator: "gte", value: 1, justification: "Customer requires prior professional experience", weight: 1 }],
    }),
  );
  await changeRequisitionStatus(owner, { id, status: "open", closeReason: null });
  return { id, accountId: account.id };
}
