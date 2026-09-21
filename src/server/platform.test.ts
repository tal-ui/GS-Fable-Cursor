/**
 * Integration suite against a fresh embedded database seeded through the service layer.
 * Covers the invariants the plan calls out: role enforcement at the API boundary, data isolation,
 * atomic seat reservation, permission-gated disclosure, duplicate detection and failed-job visibility.
 */
import { and, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getDb, type Database } from "@/db/client";
import { seedDatabase } from "@/db/seed";
import { candidates, consents, placements, requisitions, securityAuditLog, submissions } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { defineAction } from "@/lib/actions";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/auth/authorize";
import { consentSchema, intakeSchema } from "@/lib/schemas/candidates";
import { disclosureSchema, stageChangeSchema } from "@/lib/schemas/pipeline";
import { requirementsVersionSchema } from "@/lib/schemas/requisitions";
import { updateUserAction } from "@/actions/admin";
import { updateCandidateAction } from "@/actions/candidates";
import { jobCounts, listJobs, retryJob } from "@/server/admin";
import { listCandidates } from "@/server/candidates/queries";
import { createCandidate, grantConsent, withdrawConsent } from "@/server/candidates/mutations";
import { defaultDisclosureFields, discloseCandidate } from "@/server/pipeline/disclosures";
import { startPlacement } from "@/server/pipeline/placements";
import { changeStage, createSubmission } from "@/server/pipeline/submissions";
import { saveRequirementsVersion } from "@/server/requisitions";
import { invalidateSettingsCache, setSetting } from "@/server/settings";
import { testAuth } from "@/test/auth";
import { accountByName as accountByNameIn, advance, candidateByEmail as candidateByEmailIn, isoDay, loadSeededUsers, openRequisition as openRequisitionIn, type SeededUserKey } from "@/test/fixtures";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/auth/session")>();
  const { testAuth } = await import("@/test/auth");
  return { ...mod, getCurrentUser: async () => testAuth.user };
});

let db: Database;
let user: (key: SeededUserKey) => CurrentUser;
const candidateByEmail = (email: string) => candidateByEmailIn(db, email);
const accountByName = (name: string) => accountByNameIn(db, name);
const openRequisition = (owner: CurrentUser, accountName: string, headcount: number, startDays: number) => openRequisitionIn(db, owner, accountName, headcount, startDays);

beforeAll(async () => {
  db = await getDb();
  await seedDatabase();
  user = await loadSeededUsers(db);
});

describe("role matrix", () => {
  it("grants and denies permissions per role", () => {
    expect(can(user("noa"), "admin")).toBe(true);
    expect(can(user("maya"), "write")).toBe(true);
    expect(can(user("maya"), "admin")).toBe(false);
    expect(can(user("maya"), "verify")).toBe(false);
    expect(can(user("daniel"), "verify")).toBe(true);
    expect(can(user("lior"), "read")).toBe(true);
    expect(can(user("lior"), "write")).toBe(false);
    expect(can(user("lior"), "export")).toBe(false);
    expect(can(user("lior"), "bulk")).toBe(false);
    expect(can({ ...user("maya"), status: "pending" }, "read")).toBe(false);
  });

  it("blocks a Read Only caller at the action boundary and logs the 403", async () => {
    const lior = user("lior");
    const before = await db.select().from(securityAuditLog).where(and(eq(securityAuditLog.userId, lior.id), eq(securityAuditLog.statusCode, 403)));
    testAuth.user = lior;
    const target = await candidateByEmail("tomer.azoulay@example.com");
    const result = await updateCandidateAction({ id: target.id, headline: "Should not be saved" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("forbidden");
    const after = await db.select().from(securityAuditLog).where(and(eq(securityAuditLog.userId, lior.id), eq(securityAuditLog.statusCode, 403)));
    expect(after.length).toBe(before.length + 1);
    expect(after.at(-1)?.action).toBe("denied:write");
    const unchanged = await db.query.candidates.findFirst({ where: eq(candidates.id, target.id) });
    expect(unchanged?.headline).not.toBe("Should not be saved");
  });

  it("blocks a Standard caller from admin actions and lets a Super Admin through", async () => {
    testAuth.user = user("maya");
    const denied = await updateUserAction({ id: user("lior").id, role: "standard" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("forbidden");

    testAuth.user = user("noa");
    const allowed = await updateUserAction({ id: user("lior").id, role: "read_only", canVerify: false });
    expect(allowed.ok).toBe(true);
  });

  it("rejects unauthenticated and inactive callers", async () => {
    const probe = defineAction({ permission: "read", resource: "probe", schema: z.object({}) }, async () => "ok");
    testAuth.user = null;
    const anon = await probe({});
    expect(anon.ok).toBe(false);
    if (!anon.ok) expect(anon.code).toBe("unauthorized");
    testAuth.user = (await db.query.users.findFirst({ where: (t, { eq: e }) => e(t.email, "tamar.levi@relaystaffing.example") })) ?? null;
    const pending = await probe({});
    expect(pending.ok).toBe(false);
    if (!pending.ok) expect(pending.code).toBe("forbidden");
    testAuth.user = null;
  });
});

describe("data isolation", () => {
  it("scopes list queries to owned or unassigned records under the owner sharing model", async () => {
    const maya = user("maya");
    const noa = user("noa");
    const team = await listCandidates(maya, { page: 1, pageSize: 200, dir: "desc", filters: {} });
    await setSetting("sharing_model", "owner", noa.id);
    invalidateSettingsCache();
    try {
      const owned = await listCandidates(maya, { page: 1, pageSize: 200, dir: "desc", filters: {} });
      expect(owned.total).toBeLessThan(team.total);
      expect(owned.rows.every((r) => r.ownerId === maya.id || r.ownerId === null)).toBe(true);
      const admin = await listCandidates(noa, { page: 1, pageSize: 200, dir: "desc", filters: {} });
      expect(admin.total).toBe(team.total);
    } finally {
      await setSetting("sharing_model", "team", noa.id);
      invalidateSettingsCache();
    }
  });
});

describe("seat reservation", () => {
  it("lets exactly one of two competing acceptances take the last seat", async () => {
    const yossi = user("yossi");
    const req = await openRequisition(yossi, "Nordsee Werft GmbH", 1, 400);
    const a = await candidateByEmail("tomer.azoulay@example.com");
    const b = await candidateByEmail("sergei.volkov@example.com");
    const subA = await createSubmission(yossi, { requisitionId: req.id, candidateId: a.id, ownerId: null, sourceId: null, notes: null });
    const subB = await createSubmission(yossi, { requisitionId: req.id, candidateId: b.id, ownerId: null, sourceId: null, notes: null });
    for (const id of [subA, subB]) await advance(yossi, id, ["contacted", "interested", "presented", "customer_review", "offered"]);

    const accept = (submissionId: string) => changeStage(yossi, stageChangeSchema.parse({ submissionId, toStage: "accepted", reason: null, notes: null, plannedStart: isoDay(400), plannedEnd: isoDay(428), overrideReview: false }));
    const results = await Promise.allSettled([accept(subA), accept(subB)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(AppError);
    expect((rejected[0]!.reason as AppError).message).toMatch(/No open seats/);

    const reserved = await db.select().from(placements).where(and(eq(placements.requisitionId, req.id), eq(placements.status, "reserved")));
    expect(reserved).toHaveLength(1);
    // A reserved seat blocks further acceptances but the requisition only becomes "filled" once the assignment starts.
    expect((await db.query.requisitions.findFirst({ where: eq(requisitions.id, req.id) }))?.status).toBe("open");
    await startPlacement(yossi, { id: reserved[0]!.id, actualStart: isoDay(400) });
    expect((await db.query.requisitions.findFirst({ where: eq(requisitions.id, req.id) }))?.status).toBe("filled");
    expect((await db.query.submissions.findFirst({ where: eq(submissions.id, reserved[0]!.submissionId) }))?.stage).toBe("placed");
  });

  it("blocks an acceptance that overlaps an existing assignment", async () => {
    const yossi = user("yossi");
    const req = await openRequisition(yossi, "Nordsee Werft GmbH", 2, 21);
    const dmytro = await candidateByEmail("d.bondar@example.com");
    const sub = await createSubmission(yossi, { requisitionId: req.id, candidateId: dmytro.id, ownerId: null, sourceId: null, notes: null });
    await advance(yossi, sub, ["contacted", "interested", "presented", "customer_review"]);
    await expect(
      changeStage(yossi, stageChangeSchema.parse({ submissionId: sub, toStage: "offered", reason: null, notes: null, plannedStart: isoDay(21), plannedEnd: isoDay(49), overrideReview: false })),
    ).rejects.toThrow(/conflict|already holds/i);
  });
});

describe("controlled disclosure", () => {
  let michalSubmissionId = "";

  it("refuses to share a candidate who withdrew permission for that customer", async () => {
    const maya = user("maya");
    const michal = await candidateByEmail("michal.oren@example.com");
    const delta = await accountByName("Delta Offshore Services B.V.");
    const withdrawn = await db.query.consents.findFirst({ where: and(eq(consents.candidateId, michal.id), eq(consents.accountId, delta.id), eq(consents.scope, "share_with_customer")) });
    expect(withdrawn?.withdrawnAt).not.toBeNull();

    const req = await openRequisition(maya, "Delta Offshore Services B.V.", 1, 300);
    const sub = await createSubmission(maya, { requisitionId: req.id, candidateId: michal.id, ownerId: null, sourceId: null, notes: null });
    michalSubmissionId = sub;
    await advance(maya, sub, ["contacted", "interested"]);
    await expect(discloseCandidate(maya, disclosureSchema.parse({ submissionId: sub, contactId: null, channel: "email", fieldsShared: await defaultDisclosureFields(), documentIds: [], notes: null }))).rejects.toThrow(/withdrawn/);
    await expect(changeStage(maya, stageChangeSchema.parse({ submissionId: sub, toStage: "presented", reason: null, notes: null, plannedStart: null, plannedEnd: null, overrideReview: false }))).rejects.toThrow(/permission/);
  });

  it("shares once permission is re-granted, and never shares identity documents", async () => {
    const maya = user("maya");
    const michal = await candidateByEmail("michal.oren@example.com");
    const delta = await accountByName("Delta Offshore Services B.V.");
    await grantConsent(maya, consentSchema.parse({ candidateId: michal.id, scope: "share_with_customer", accountId: delta.id, channel: "phone", evidence: "Re-granted on a call" }));
    expect(michalSubmissionId).toBeTruthy();
    const result = await discloseCandidate(maya, disclosureSchema.parse({ submissionId: michalSubmissionId, contactId: null, channel: "email", fieldsShared: ["headline", "skills", "passport_number"], documentIds: [], notes: null }));
    expect(result.summary).not.toMatch(/passport/i);
    const after = await db.query.submissions.findFirst({ where: eq(submissions.id, michalSubmissionId) });
    expect(after?.stage).toBe("presented");
    expect(after?.sharingConsentId).not.toBeNull();
  });

  it("requires an explicit override to present a candidate whose eligibility is under review", async () => {
    const yossi = user("yossi");
    const req = await openRequisition(yossi, "Nordsee Werft GmbH", 1, 500);
    await saveRequirementsVersion(
      yossi,
      requirementsVersionSchema.parse({
        requisitionId: req.id,
        changeSummary: "Customer added a service requirement",
        requirements: [{ kind: "mandatory", field: "military_role", operator: "in", value: ["infantry", "combat"], justification: "Customer tender requires prior service" }],
      }),
    );
    const sergei = await candidateByEmail("sergei.volkov@example.com");
    const sub = await createSubmission(yossi, { requisitionId: req.id, candidateId: sergei.id, ownerId: null, sourceId: null, notes: null });
    const row = await db.query.submissions.findFirst({ where: eq(submissions.id, sub) });
    expect(row?.eligibility).toBe("review");
    await advance(yossi, sub, ["contacted", "interested"]);
    const fields = await defaultDisclosureFields();
    await expect(discloseCandidate(yossi, disclosureSchema.parse({ submissionId: sub, contactId: null, channel: "email", fieldsShared: fields, documentIds: [], notes: null }))).rejects.toThrow(/under review/);
    const disclosed = await discloseCandidate(yossi, disclosureSchema.parse({ submissionId: sub, contactId: null, channel: "email", fieldsShared: fields, documentIds: [], notes: "Customer waived the service requirement in writing", overrideReview: true }));
    expect(disclosed.id).toBeTruthy();
    const after = await db.query.submissions.findFirst({ where: eq(submissions.id, sub) });
    expect(after?.stage).toBe("presented");
  });

  it("withdrawing permission after presentation blocks any further sharing", async () => {
    const yossi = user("yossi");
    const tomer = await candidateByEmail("tomer.azoulay@example.com");
    const nordsee = await accountByName("Nordsee Werft GmbH");
    const active = await db.query.consents.findFirst({ where: and(eq(consents.candidateId, tomer.id), eq(consents.accountId, nordsee.id), eq(consents.scope, "share_with_customer"), isNull(consents.withdrawnAt)) });
    expect(active).toBeDefined();
    await withdrawConsent(yossi, active!.id, "Test withdrawal");
    const sub = await db.query.submissions.findFirst({ where: and(eq(submissions.candidateId, tomer.id), eq(submissions.stage, "customer_review")) });
    expect(sub).toBeDefined();
    await expect(discloseCandidate(yossi, disclosureSchema.parse({ submissionId: sub!.id, contactId: null, channel: "email", fieldsShared: await defaultDisclosureFields(), documentIds: [], notes: null }))).rejects.toThrow(/withdrawn/);
    await expect(changeStage(yossi, stageChangeSchema.parse({ submissionId: sub!.id, toStage: "offered", reason: null, notes: null, plannedStart: isoDay(21), plannedEnd: null, overrideReview: false }))).rejects.toThrow(/permission/);
  });
});

describe("candidate intake", () => {
  it("detects duplicates by phone and email before creating a record", async () => {
    const maya = user("maya");
    const result = await createCandidate(
      maya,
      intakeSchema.parse({ firstName: "Amir", lastName: "Levy", email: "different@example.com", phone: "052-410-7781", country: "IL", citizenships: ["IL"], processingConsent: true, communicationConsent: true, consentChannel: "phone" }),
    );
    expect("duplicates" in result).toBe(true);
    if ("duplicates" in result) {
      expect(result.duplicates.length).toBeGreaterThan(0);
      expect(result.duplicates[0]!.matchedOn).toContain("phone");
    }
    const forced = await createCandidate(
      maya,
      intakeSchema.parse({ firstName: "Amir", lastName: "Levy", email: "different@example.com", phone: "052-410-7781", country: "IL", citizenships: ["IL"], processingConsent: true, communicationConsent: true, consentChannel: "phone", forceCreate: true }),
    );
    expect("candidateId" in forced).toBe(true);
  });
});

describe("background jobs", () => {
  it("surfaces dead jobs to admins and lets them be retried", async () => {
    const counts = await jobCounts();
    expect(counts.dead).toBeGreaterThanOrEqual(1);
    const dead = await listJobs("dead");
    expect(dead.length).toBeGreaterThanOrEqual(1);
    expect(dead[0]!.lastError).toMatch(/WhatsApp/);
    await retryJob(user("noa"), dead[0]!.id);
    const requeued = await listJobs("queued");
    expect(requeued.some((j) => j.id === dead[0]!.id)).toBe(true);
    await expect(retryJob(user("noa"), dead[0]!.id)).rejects.toThrow(/Only dead or failed/);
  });
});
