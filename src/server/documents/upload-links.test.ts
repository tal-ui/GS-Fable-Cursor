/**
 * Secure upload links (plan §4, §8.21): a recruiter mints an expiring, capped link for one candidate and
 * a set of document kinds; the candidate uploads without an account; only a hash of the token is stored;
 * expiry, revocation, the file cap and the kind list are enforced server-side; every upload is logged,
 * quarantined if infected, and raises a verification task for the recruiter. Read Only users cannot mint
 * links, and erasure kills any open link.
 */
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createUploadLinkAction, revokeUploadLinkAction } from "@/actions/documents";
import { getDb, type Database } from "@/db/client";
import { seedDatabase } from "@/db/seed";
import { activities, candidates, documentAccessLog, documents, tasks, uploadLinks } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { readDocumentForDownload } from "@/server/documents/service";
import { acceptLinkUpload, createUploadLink, listUploadLinks, resolveUploadLink, revokeUploadLink } from "@/server/documents/upload-links";
import { anonymizeCandidate } from "@/server/retention";
import { invalidateSettingsCache, setSetting } from "@/server/settings";
import { testAuth } from "@/test/auth";
import { candidateByEmail, loadSeededUsers, type SeededUserKey } from "@/test/fixtures";

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

const tokenOf = (url: string) => url.split("/upload/")[1]!;
const pdf = (name: string, body = "%PDF-1.4\n%candidate upload\n") => new File([body], name, { type: "application/pdf" });
const png = (name: string) => new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], name, { type: "image/png" });

describe("minting links", () => {
  it("stores only a hash, returns a one-time URL, logs an activity and lists the link as active", async () => {
    const maya = user("maya");
    const eden = await candidateByEmail(db, "eden.shalev@example.com");
    const link = await createUploadLink(maya, { candidateId: eden.id, kinds: ["passport", "certificate"], expiresInHours: 72, maxFiles: 2, purpose: "Visa file for Nordsee Werft" });
    expect(link.url).toMatch(/\/upload\/[A-Za-z0-9_-]{40,50}$/);
    const row = await db.query.uploadLinks.findFirst({ where: eq(uploadLinks.id, link.id) });
    expect(row?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row?.tokenHash).not.toBe(tokenOf(link.url));
    expect(row?.kinds).toEqual(["passport", "certificate"]);
    expect(row?.createdBy).toBe(maya.id);
    const activity = await db.query.activities.findFirst({ where: and(eq(activities.candidateId, eden.id), eq(activities.type, "system")), orderBy: (t, { desc }) => desc(t.createdAt) });
    expect(activity?.subject).toMatch(/Secure upload link sent for passport, certificate/);
    const listed = await listUploadLinks(maya, eden.id);
    expect(listed[0]).toMatchObject({ id: link.id, state: "active", usedCount: 0, maxFiles: 2, createdByName: "Maya Cohen" });
  });

  it("refuses CVs and contracts as requestable kinds, unreasonable expiry, and candidates who withdrew permission", async () => {
    const maya = user("maya");
    const eden = await candidateByEmail(db, "eden.shalev@example.com");
    await expect(createUploadLink(maya, { candidateId: eden.id, kinds: ["cv" as never], expiresInHours: 24, maxFiles: 1 })).rejects.toMatchObject({ code: "validation" });
    await expect(createUploadLink(maya, { candidateId: eden.id, kinds: ["passport"], expiresInHours: 24 * 60, maxFiles: 1 })).rejects.toMatchObject({ code: "validation" });
    const boris = await candidateByEmail(db, "b.ivanov.weld@example.com");
    await expect(createUploadLink(user("noa"), { candidateId: boris.id, kinds: ["passport"], expiresInHours: 24, maxFiles: 1 })).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("withdrew") });
  });

  it("is a write action: Read Only callers get 403 and a non-owner under the owner model gets 404/403", async () => {
    const eden = await candidateByEmail(db, "eden.shalev@example.com");
    testAuth.user = user("lior");
    const denied = await createUploadLinkAction({ candidateId: eden.id, kinds: ["passport"], expiresInHours: 24, maxFiles: 1, purpose: null });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("forbidden");
    testAuth.user = user("noa");

    await setSetting("sharing_model", "owner", user("noa").id);
    invalidateSettingsCache();
    try {
      // Eden is owned by Maya; Yossi cannot see her under the owner model.
      await expect(createUploadLink(user("yossi"), { candidateId: eden.id, kinds: ["passport"], expiresInHours: 24, maxFiles: 1 })).rejects.toMatchObject({ code: "not_found" });
    } finally {
      await setSetting("sharing_model", "team", user("noa").id);
      invalidateSettingsCache();
    }
  });
});

describe("candidate uploads", () => {
  it("resolves to first name + constraints only, accepts requested kinds, logs the upload without a staff user and raises a review task for the recruiter", async () => {
    const maya = user("maya");
    const eden = await candidateByEmail(db, "eden.shalev@example.com");
    const link = await createUploadLink(maya, { candidateId: eden.id, kinds: ["passport", "certificate"], expiresInHours: 24, maxFiles: 2, purpose: "Visa file" });
    const token = tokenOf(link.url);

    const pub = await resolveUploadLink(token);
    expect(pub).toEqual({ linkId: link.id, candidateFirstName: "Eden", kinds: ["passport", "certificate"], purpose: "Visa file", remaining: 2, expiresAt: link.expiresAt });
    expect(JSON.stringify(pub)).not.toMatch(/Shalev|example\.com|\+972/);

    await expect(acceptLinkUpload(token, pdf("cv.pdf"), "cv")).rejects.toMatchObject({ code: "validation" });
    await expect(acceptLinkUpload(token, new File(["not a pdf"], "x.pdf", { type: "application/pdf" }), "passport")).rejects.toMatchObject({ code: "validation" });
    expect((await resolveUploadLink(token))?.remaining).toBe(2); // failed validation must not consume a slot

    const first = await acceptLinkUpload(token, png("passport.png"), "passport");
    expect(first).toMatchObject({ kind: "passport", remaining: 1 });
    const doc = await db.query.documents.findFirst({ where: eq(documents.id, first.documentId) });
    expect(doc).toMatchObject({ candidateId: eden.id, kind: "passport", isSensitive: true, uploadedById: null, createdBy: maya.id });
    const log = await db.query.documentAccessLog.findFirst({ where: and(eq(documentAccessLog.documentId, first.documentId), eq(documentAccessLog.action, "upload")) });
    expect(log?.userId).toBeNull();
    expect(log?.details).toMatchObject({ uploadLinkId: link.id, by: "candidate" });
    const task = await db.query.tasks.findFirst({ where: eq(tasks.dedupeKey, `upload-link-review:${first.documentId}`) });
    expect(task).toMatchObject({ type: "verification", ownerId: maya.id, candidateId: eden.id, priority: "high", status: "open" });
    expect(task?.title).toBe("Review passport uploaded by Eden");

    // Sensitive document: the owning recruiter and admins can read it; a Standard user with no submission cannot.
    await expect(readDocumentForDownload(maya, first.documentId)).resolves.toBeTruthy();
    await expect(readDocumentForDownload(user("yossi"), first.documentId)).rejects.toMatchObject({ code: expect.stringMatching(/forbidden|not_found/) });

    const second = await acceptLinkUpload(token, pdf("gwo.pdf"), "certificate");
    expect(second.remaining).toBe(0);
    // A used-up link still resolves (so the page can say "all done") but accepts nothing more.
    expect((await resolveUploadLink(token))?.remaining).toBe(0);
    await expect(acceptLinkUpload(token, pdf("extra.pdf"), "certificate")).rejects.toMatchObject({ code: "conflict" });
    expect((await listUploadLinks(maya, eden.id)).find((l) => l.id === link.id)).toMatchObject({ state: "used_up", usedCount: 2 });
  });

  it("quarantines an infected upload but still records it and tells the recruiter", async () => {
    const maya = user("maya");
    const eden = await candidateByEmail(db, "eden.shalev@example.com");
    const link = await createUploadLink(maya, { candidateId: eden.id, kinds: ["other"], expiresInHours: 24, maxFiles: 1 });
    const result = await acceptLinkUpload(tokenOf(link.url), pdf("eicar.pdf", "%PDF-1.4 X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"), "other");
    expect(result.scanStatus).toBe("infected");
    await expect(readDocumentForDownload(user("noa"), result.documentId)).rejects.toThrow(/malware/);
    const activity = await db.query.activities.findFirst({ where: and(eq(activities.candidateId, eden.id), eq(activities.type, "system")), orderBy: (t, { desc }) => desc(t.createdAt) });
    expect(activity?.body).toMatch(/failed the malware scan/);
  });

  it("rejects unknown, revoked and expired tokens, and revocation is audited", async () => {
    const maya = user("maya");
    const eden = await candidateByEmail(db, "eden.shalev@example.com");
    expect(await resolveUploadLink("not-a-real-token")).toBeNull();
    expect(await resolveUploadLink("A".repeat(43))).toBeNull();

    const link = await createUploadLink(maya, { candidateId: eden.id, kinds: ["license"], expiresInHours: 24, maxFiles: 1 });
    const token = tokenOf(link.url);
    testAuth.user = user("lior");
    const denied = await revokeUploadLinkAction({ id: link.id, candidateId: eden.id });
    expect(denied.ok).toBe(false);
    testAuth.user = user("noa");
    await revokeUploadLink(user("noa"), link.id);
    expect(await resolveUploadLink(token)).toBeNull();
    await expect(acceptLinkUpload(token, pdf("license.pdf"), "license")).rejects.toMatchObject({ code: "not_found" });

    const expiring = await createUploadLink(maya, { candidateId: eden.id, kinds: ["license"], expiresInHours: 1, maxFiles: 1 });
    await db.update(uploadLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(uploadLinks.id, expiring.id));
    expect(await resolveUploadLink(tokenOf(expiring.url))).toBeNull();
    expect((await listUploadLinks(maya, eden.id)).find((l) => l.id === expiring.id)?.state).toBe("expired");
  });

  it("dies with the profile: erasure revokes open links", async () => {
    const noa = user("noa");
    const dana = await candidateByEmail(db, "dana.klein.log@example.com");
    const link = await createUploadLink(noa, { candidateId: dana.id, kinds: ["passport"], expiresInHours: 24, maxFiles: 1 });
    // Sending a link is profile activity and resets the retention clock; age it again so the profile is due.
    const old = new Date("2022-06-01T00:00:00Z");
    await db.execute(sql`update activities set occurred_at = ${old} where candidate_id = ${dana.id}`);
    await db.update(candidates).set({ updatedAt: old }).where(eq(candidates.id, dana.id));
    await setSetting("retention_grace_days", 0, noa.id);
    invalidateSettingsCache();
    try {
      await anonymizeCandidate(noa, dana.id, "Test erasure");
    } finally {
      await setSetting("retention_grace_days", 30, noa.id);
      invalidateSettingsCache();
    }
    expect(await resolveUploadLink(tokenOf(link.url))).toBeNull();
    const row = await db.query.uploadLinks.findFirst({ where: eq(uploadLinks.id, link.id) });
    expect(row?.revokedAt).toBeInstanceOf(Date);
    expect(row?.isDeleted).toBe(true);
  });
});
