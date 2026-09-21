/**
 * Retention and erasure (plan §8, control 22): withdrawn processing permission makes a profile due at
 * once, inactivity makes it due after the configured period, live engagement keeps it out of the queue,
 * a documented hold suppresses review tasks and blocks erasure, the grace period is enforced, and
 * erasure scrubs personal data, files and AI records while commercial history survives — all of it
 * restricted to Super Admins at the action boundary.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eraseCandidateAction, setRetentionHoldAction } from "@/actions/admin";
import { getDb, type Database } from "@/db/client";
import { seedDatabase } from "@/db/seed";
import { aiAuditLog, auditLog, candidates, consents, documents, messages, sourceEvents, submissions, tasks } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { updateCandidate, withdrawConsent } from "@/server/candidates/mutations";
import { getCandidate, getCandidateDetail, listCandidates } from "@/server/candidates/queries";
import { uploadDocument } from "@/server/documents/service";
import { storage } from "@/server/documents/storage";
import { createSubmission } from "@/server/pipeline/submissions";
import { listParamsSchema } from "@/server/list";
import { anonymizeCandidate, raiseRetentionReviews, retentionQueue, retentionStats, setRetentionHold } from "@/server/retention";
import { invalidateSettingsCache, setSetting } from "@/server/settings";
import { testAuth } from "@/test/auth";
import { candidateByEmail, loadSeededUsers, openRequisition, type SeededUserKey } from "@/test/fixtures";

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

async function withdrawProcessing(actor: CurrentUser, candidateId: string) {
  const consent = await db.query.consents.findFirst({ where: and(eq(consents.candidateId, candidateId), eq(consents.scope, "process_profile"), isNull(consents.withdrawnAt)) });
  if (!consent) throw new Error("no active processing permission to withdraw");
  await withdrawConsent(actor, consent.id, "Candidate asked us to stop processing their profile");
}

async function setGraceDays(days: number) {
  await setSetting("retention_grace_days", days, user("noa").id);
  invalidateSettingsCache();
}

describe("retention queue", () => {
  it("reflects the seeded scenarios: a withdrawal past grace, a dormant profile, and a dormant profile on hold; nothing erased", async () => {
    const queue = await retentionQueue();
    const byEmail = new Map(queue.map((q) => [q.email, q]));
    expect(byEmail.get("b.ivanov.weld@example.com")).toMatchObject({ reason: "permission_withdrawn", eligible: true, onHold: false });
    expect(byEmail.get("dana.klein.log@example.com")).toMatchObject({ reason: "inactive", eligible: true, onHold: false });
    expect(byEmail.get("yaakov.bergman.sec@example.com")).toMatchObject({ reason: "inactive", eligible: false, onHold: true });
    expect(byEmail.get("yaakov.bergman.sec@example.com")?.holdReason).toMatch(/Helios/);
    expect(queue).toHaveLength(3);
    expect(await retentionStats(queue)).toMatchObject({ due: 3, eligible: 2, onHold: 1, withdrawn: 1, erased: 0 });
    // The seed ran daily maintenance once: review tasks exist for the two profiles not on hold.
    const reviews = await db.select().from(tasks).where(eq(tasks.type, "retention_review"));
    expect(reviews.map((t) => t.candidateId).sort()).toEqual([byEmail.get("b.ivanov.weld@example.com")!.id, byEmail.get("dana.klein.log@example.com")!.id].sort());
  });

  it("puts a profile in the queue as soon as processing permission is withdrawn, but not while it has a live submission", async () => {
    const noa = user("noa");
    const maya = user("maya");
    const eden = await candidateByEmail(db, "eden.shalev@example.com");
    const tomer = await candidateByEmail(db, "tomer.azoulay@example.com");

    // Tomer is in customer review in the seed; withdrawing permission must not make him erasable while that runs.
    const live = await db.query.submissions.findFirst({ where: and(eq(submissions.candidateId, tomer.id), eq(submissions.isDeleted, false), eq(submissions.stage, "customer_review")) });
    expect(live).toBeTruthy();
    await withdrawProcessing(noa, tomer.id);

    await withdrawProcessing(maya, eden.id);

    const queue = await retentionQueue();
    const ids = queue.map((q) => q.id);
    expect(ids).toContain(eden.id);
    expect(ids).not.toContain(tomer.id);

    const entry = queue.find((q) => q.id === eden.id)!;
    expect(entry.reason).toBe("permission_withdrawn");
    expect(entry.processingWithdrawnAt).toBeInstanceOf(Date);
    expect(entry.onHold).toBe(false);
    // Default grace period is 30 days, so the profile is due but not yet eligible.
    expect(entry.eligible).toBe(false);
    expect(entry.eligibleFrom.getTime()).toBeGreaterThan(Date.now());
    expect((await db.query.candidates.findFirst({ where: eq(candidates.id, eden.id) }))?.status).toBe("withdrawn");
  });

  it("treats a long-inactive profile as due and ignores it again once the retention period is widened", async () => {
    const noa = user("noa");
    const adi = await candidateByEmail(db, "adi.mor@example.com");
    // Close every seeded submission for this profile so nothing counts as live engagement, then age it.
    await db.update(submissions).set({ stage: "declined_by_candidate", stageChangedAt: new Date("2023-01-01T00:00:00Z") }).where(eq(submissions.candidateId, adi.id));
    const old = new Date("2022-06-01T00:00:00Z");
    await db.update(candidates).set({ createdAt: old, updatedAt: old }).where(eq(candidates.id, adi.id));
    await db.execute(sql`update activities set occurred_at = ${old} where candidate_id = ${adi.id}`);
    await db.execute(sql`update consents set granted_at = ${old}, withdrawn_at = null where candidate_id = ${adi.id}`);

    const entry = (await retentionQueue()).find((q) => q.id === adi.id);
    expect(entry?.reason).toBe("inactive");
    expect(entry?.eligible).toBe(true);

    await setSetting("candidate_retention_months", 120, noa.id);
    invalidateSettingsCache();
    try {
      expect((await retentionQueue()).some((q) => q.id === adi.id)).toBe(false);
    } finally {
      await setSetting("candidate_retention_months", 24, noa.id);
      invalidateSettingsCache();
    }
  });
});

describe("review tasks and holds", () => {
  it("raises one owned review task per due profile per month and skips profiles on hold", async () => {
    const noa = user("noa");
    const eden = await candidateByEmail(db, "eden.shalev@example.com");
    const adi = await candidateByEmail(db, "adi.mor@example.com");

    const created = await raiseRetentionReviews(db);
    expect(created).toBeGreaterThanOrEqual(2);
    const edenTask = await db.query.tasks.findFirst({ where: and(eq(tasks.candidateId, eden.id), eq(tasks.type, "retention_review")) });
    expect(edenTask).toMatchObject({ ownerId: eden.ownerId, priority: "high", status: "open" });
    expect(edenTask?.title).toMatch(/withdrew permission/);

    expect(await raiseRetentionReviews(db)).toBe(0);

    const hold = await setRetentionHold(noa, { candidateId: adi.id, reason: "Open dispute over the Baltic Wind invoice", until: null });
    expect(hold).toEqual({ holdReason: "Open dispute over the Baltic Wind invoice", holdUntil: null });
    const held = (await retentionQueue()).find((q) => q.id === adi.id);
    expect(held).toMatchObject({ onHold: true, eligible: false });

    await db.delete(tasks).where(and(eq(tasks.candidateId, adi.id), eq(tasks.type, "retention_review")));
    await raiseRetentionReviews(db);
    expect(await db.query.tasks.findFirst({ where: and(eq(tasks.candidateId, adi.id), eq(tasks.type, "retention_review")) })).toBeUndefined();

    const audit = await db.query.auditLog.findFirst({ where: and(eq(auditLog.entityId, adi.id), eq(auditLog.action, "retention_hold")) });
    expect(audit?.after).toMatchObject({ holdReason: "Open dispute over the Baltic Wind invoice" });
  });

  it("rejects a hold that ends in the past and blocks erasure while a hold is in place", async () => {
    const noa = user("noa");
    const adi = await candidateByEmail(db, "adi.mor@example.com");
    await expect(setRetentionHold(noa, { candidateId: adi.id, reason: "Backdated", until: "2020-01-01" })).rejects.toMatchObject({ code: "validation" });
    await expect(anonymizeCandidate(noa, adi.id, null)).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("hold") });
  });

  it("enforces the grace period and refuses profiles that are not due at all", async () => {
    const noa = user("noa");
    const eden = await candidateByEmail(db, "eden.shalev@example.com");
    const gal = await candidateByEmail(db, "gal.peretz@example.com");
    await expect(anonymizeCandidate(noa, eden.id, null)).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("grace period") });
    await expect(anonymizeCandidate(noa, gal.id, null)).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("not due") });
  });
});

describe("erasure", () => {
  it("is a Super Admin action: Standard and Read Only callers get a logged 403", async () => {
    const eden = await candidateByEmail(db, "eden.shalev@example.com");
    for (const key of ["maya", "lior"] as const) {
      testAuth.user = user(key);
      const denied = await eraseCandidateAction({ candidateId: eden.id, note: null, confirmation: "ERASE" });
      expect(denied.ok).toBe(false);
      if (!denied.ok) expect(denied.code).toBe("forbidden");
      const deniedHold = await setRetentionHoldAction({ candidateId: eden.id, reason: "Trying", until: null });
      expect(deniedHold.ok).toBe(false);
    }
    testAuth.user = user("noa");
    expect(await db.query.candidates.findFirst({ where: eq(candidates.id, eden.id), columns: { anonymizedAt: true } })).toMatchObject({ anonymizedAt: null });
  });

  it("requires the typed confirmation", async () => {
    const eden = await candidateByEmail(db, "eden.shalev@example.com");
    const result = await eraseCandidateAction({ candidateId: eden.id, note: null, confirmation: "erase" as "ERASE" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("validation");
  });

  it("scrubs personal data, files, messages and AI records while submissions and source history keep their links", async () => {
    const noa = user("noa");
    const maya = user("maya");
    const eden = await candidateByEmail(db, "eden.shalev@example.com");
    const pdf = new File(["%PDF-1.4\n%eden cv\n"], "eden-cv.pdf", { type: "application/pdf" });
    const cv = await uploadDocument(maya, { file: pdf, kind: "cv", candidateId: eden.id, extract: false });
    await db.update(documents).set({ extractedText: "Eden Shalev, welder, +972 50 000 0000" }).where(eq(documents.id, cv.id));
    await db.insert(aiAuditLog).values({ purpose: "cv_extraction", provider: "test", model: "test", entityType: "document", entityId: cv.id, input: { text: "Eden Shalev" }, output: { firstName: "Eden" }, confidence: "0.900", latencyMs: 1, status: "succeeded", userId: maya.id });
    await db.insert(messages).values({ candidateId: eden.id, channel: "email", direction: "outbound", status: "sent", toAddress: "eden.shalev@example.com", subject: "Hi Eden", body: "Personal content", sendKey: `test:${eden.id}:erasure`, createdBy: maya.id });
    // A closed submission from before the withdrawal — commercial history that must survive.
    const req = await openRequisition(db, noa, "Nordsee Werft GmbH", 1, 30);
    const submissionId = await createSubmission(noa, { requisitionId: req.id, candidateId: eden.id, ownerId: null, sourceId: null, notes: null });
    await db.update(submissions).set({ stage: "declined_by_candidate", decisionNotes: "Eden said no" }).where(eq(submissions.id, submissionId));
    const sourceEventsBefore = await db.select().from(sourceEvents).where(eq(sourceEvents.candidateId, eden.id));
    expect(sourceEventsBefore.length).toBeGreaterThan(0);
    const docsBefore = await db.select({ id: documents.id, storageKey: documents.storageKey }).from(documents).where(eq(documents.candidateId, eden.id));
    expect(docsBefore.length).toBeGreaterThanOrEqual(2); // seeded CV + the one uploaded above

    await setGraceDays(0);
    try {
      const entry = (await retentionQueue()).find((q) => q.id === eden.id);
      expect(entry?.eligible).toBe(true);
      const result = await anonymizeCandidate(noa, eden.id, "Erasure request received by email");
      expect(result).toMatchObject({ candidateId: eden.id, documents: docsBefore.length, messages: 1 });
      expect(result.aiRecords).toBeGreaterThanOrEqual(1);
    } finally {
      await setGraceDays(30);
    }

    const after = await db.query.candidates.findFirst({ where: eq(candidates.id, eden.id) });
    expect(after).toMatchObject({ firstName: "Erased", email: null, phone: null, phoneNormalized: null, dateOfBirth: null, passportCountry: null, status: "archived", isDeleted: true, retentionHoldReason: null });
    expect(after?.anonymizedAt).toBeInstanceOf(Date);
    expect(after?.lastName).not.toContain("Shalev");

    for (const d of docsBefore) {
      const doc = await db.query.documents.findFirst({ where: eq(documents.id, d.id) });
      expect(doc).toMatchObject({ isDeleted: true, filename: "erased", extractedText: null });
      expect(doc?.storageKey).not.toBe(d.storageKey);
      await expect(storage.get(d.storageKey)).rejects.toThrow();
      await expect(fs.access(path.join(process.env.UPLOADS_DIR!, d.storageKey))).rejects.toThrow();
    }

    const msg = await db.query.messages.findFirst({ where: eq(messages.candidateId, eden.id) });
    expect(msg).toMatchObject({ body: "[erased]", subject: null, toAddress: "[erased]" });
    const ai = await db.query.aiAuditLog.findFirst({ where: eq(aiAuditLog.entityId, cv.id) });
    expect(ai?.input).toEqual({ erased: true });
    expect(ai?.output).toEqual({ erased: true });

    const sub = await db.query.submissions.findFirst({ where: eq(submissions.id, submissionId) });
    expect(sub).toMatchObject({ candidateId: eden.id, stage: "declined_by_candidate", decisionNotes: null });
    expect((await db.select().from(sourceEvents).where(eq(sourceEvents.candidateId, eden.id))).length).toBe(sourceEventsBefore.length);
    const openTask = await db.query.tasks.findFirst({ where: and(eq(tasks.candidateId, eden.id), eq(tasks.type, "retention_review")) });
    expect(openTask?.status).toBe("cancelled");
    expect(openTask?.title).not.toContain("Shalev");

    const audit = await db.query.auditLog.findFirst({ where: and(eq(auditLog.entityId, eden.id), eq(auditLog.action, "anonymize")) });
    expect(audit?.actorId).toBe(noa.id);
    expect(audit?.note).toBe("Erasure request received by email");
    expect(JSON.stringify(audit?.before) + JSON.stringify(audit?.after)).not.toMatch(/Shalev|eden\.shalev/);

    // Gone from the working pool and the retention queue; counted as erased.
    const list = await listCandidates(noa, listParamsSchema.parse({ pageSize: 200, q: "Shalev" }));
    expect(list.rows.some((r) => r.id === eden.id)).toBe(false);
    expect((await retentionQueue()).some((q) => q.id === eden.id)).toBe(false);
    expect((await retentionStats()).erased).toBe(1);

    // The placeholder stays reachable from its submissions and the erasure register, read-only and free of personal data.
    const detail = await getCandidateDetail(noa, eden.id);
    expect(detail.candidate).toMatchObject({ id: eden.id, anonymizedAt: expect.any(Date), email: null, phone: null, status: "archived" });
    expect(`${detail.candidate.firstName} ${detail.candidate.lastName}`).toMatch(/^Erased profile [0-9a-f]{8}$/);
    expect(detail.submissions.some((s) => s.submission.id === submissionId)).toBe(true);
    await expect(getCandidate(noa, eden.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(updateCandidate(noa, { id: eden.id, city: "Haifa" })).rejects.toMatchObject({ code: "not_found" });

    await expect(anonymizeCandidate(noa, eden.id, null)).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("already been erased") });
  });

  it("surfaces unknown candidates as not found", async () => {
    await expect(anonymizeCandidate(user("noa"), "00000000-0000-4000-8000-000000000000", null)).rejects.toBeInstanceOf(AppError);
  });
});
