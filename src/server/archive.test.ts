/**
 * Archive and restore. Archiving is the soft delete behind every trash icon; these tests prove the
 * guards the dialogs promise are enforced server-side, that archived rows leave the working views
 * without losing history, and that only a Super Admin can bring them back.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { restoreRecordAction } from "@/actions/admin";
import { getDb, type Database } from "@/db/client";
import { seedDatabase } from "@/db/seed";
import { activities, auditLog, requisitions, securityAuditLog } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { softDeleteAccount, getAccount, listAccounts } from "@/server/accounts";
import { archivedCount, listArchived, restoreRecord } from "@/server/archive";
import { softDeleteCandidate } from "@/server/candidates/mutations";
import { getCandidate, getCandidateDetail, listCandidates } from "@/server/candidates/queries";
import { listParamsSchema } from "@/server/list";
import { testAuth } from "@/test/auth";
import { accountByName, candidateByEmail, loadSeededUsers, type SeededUserKey } from "@/test/fixtures";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/auth/session")>();
  const { testAuth } = await import("@/test/auth");
  return { ...mod, getCurrentUser: async () => testAuth.user };
});

let db: Database;
let user: (key: SeededUserKey) => CurrentUser;

beforeAll(async () => {
  db = await getDb();
  await seedDatabase();
  user = await loadSeededUsers(db);
  testAuth.user = user("noa");
});

describe("archiving guards", () => {
  it("refuses to archive a candidate with an open submission and an account with an open requisition", async () => {
    const noa = user("noa");
    const tomer = await candidateByEmail(db, "tomer.azoulay@example.com"); // seeded in customer_review
    await expect(softDeleteCandidate(noa, tomer.id)).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("open submission") });
    expect((await getCandidate(noa, tomer.id)).isDeleted).toBe(false);

    const nordsee = await accountByName(db, "Nordsee Werft GmbH");
    const open = await db.query.requisitions.findFirst({ where: and(eq(requisitions.accountId, nordsee.id), eq(requisitions.status, "open")) });
    expect(open).toBeTruthy();
    await expect(softDeleteAccount(noa, nordsee.id)).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("open requisition") });
    expect((await getAccount(noa, nordsee.id)).isDeleted).toBe(false);
  });
});

describe("archive and restore", () => {
  it("hides an archived candidate from lists and detail, keeps the history, and lets a Super Admin restore it", async () => {
    const noa = user("noa");
    const yaakov = await candidateByEmail(db, "yaakov.bergman.sec@example.com");
    const activitiesBefore = await db.select().from(activities).where(eq(activities.candidateId, yaakov.id));

    await softDeleteCandidate(noa, yaakov.id);
    expect((await listCandidates(noa, listParamsSchema.parse({ pageSize: 200, q: "Bergman" }))).rows.some((r) => r.id === yaakov.id)).toBe(false);
    await expect(getCandidateDetail(noa, yaakov.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await listArchived(noa)).find((r) => r.id === yaakov.id)).toMatchObject({ entityType: "candidate", label: "Yaakov Bergman", archivedByName: "Noa Adler" });
    expect(await archivedCount()).toBeGreaterThanOrEqual(1);

    const restored = await restoreRecord(noa, { entityType: "candidate", id: yaakov.id });
    expect(restored).toMatchObject({ entityType: "candidate", id: yaakov.id, label: "Yaakov Bergman" });
    expect((await getCandidateDetail(noa, yaakov.id)).candidate.isDeleted).toBe(false);
    expect((await listArchived(noa)).some((r) => r.id === yaakov.id)).toBe(false);

    // History survived the round trip and both steps are in the change log.
    const activitiesAfter = await db.select().from(activities).where(eq(activities.candidateId, yaakov.id));
    expect(activitiesAfter.length).toBe(activitiesBefore.length + 1);
    const actions = (await db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.entityId, yaakov.id))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["delete", "restore"]));

    await expect(restoreRecord(noa, { entityType: "candidate", id: yaakov.id })).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("not archived") });
  });

  it("does the same for an account without open requisitions", async () => {
    const noa = user("noa");
    const atlantic = await accountByName(db, "Atlantic Medical Staffing");
    await softDeleteAccount(noa, atlantic.id);
    expect((await listAccounts(noa, listParamsSchema.parse({ pageSize: 200, q: "Atlantic" }))).rows.some((r) => r.id === atlantic.id)).toBe(false);
    expect((await listArchived(noa)).find((r) => r.id === atlantic.id)).toMatchObject({ entityType: "account", label: "Atlantic Medical Staffing" });

    await restoreRecord(noa, { entityType: "account", id: atlantic.id });
    expect((await getAccount(noa, atlantic.id)).isDeleted).toBe(false);
  });

  it("is a Super Admin action: Standard callers get a logged 403 and never see the archive", async () => {
    const maya = user("maya");
    const yaakov = await candidateByEmail(db, "yaakov.bergman.sec@example.com");
    await expect(listArchived(maya)).rejects.toMatchObject({ code: "forbidden" });

    testAuth.user = maya;
    const result = await restoreRecordAction({ entityType: "candidate", id: yaakov.id });
    testAuth.user = user("noa");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("forbidden");
    const denied = await db.query.securityAuditLog.findFirst({ where: and(eq(securityAuditLog.userId, maya.id), eq(securityAuditLog.resource, "archive_restore")) });
    expect(denied?.statusCode).toBe(403);
  });

  it("refuses to restore an erased or unknown record", async () => {
    const noa = user("noa");
    await expect(restoreRecord(noa, { entityType: "candidate", id: "00000000-0000-4000-8000-000000000000" })).rejects.toMatchObject({ code: "not_found" });
    await expect(restoreRecord(noa, { entityType: "account", id: "00000000-0000-4000-8000-000000000000" })).rejects.toMatchObject({ code: "not_found" });
  });
});
