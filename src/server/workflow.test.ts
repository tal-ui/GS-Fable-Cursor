/**
 * Workflow-correctness and access/messaging acceptance scenarios from the plan (section 9):
 * cancellation and replacement reconcile headcount, completion prompts a fresh availability check,
 * declining one request never rejects a candidate globally, sensitive files are restricted by role and
 * logged, outreach is idempotent and re-checks permission at send time, and provider webhooks are
 * processed exactly once with opt-outs honoured.
 */
import { and, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, type Database } from "@/db/client";
import { seedDatabase } from "@/db/seed";
import { candidateAvailability, candidates, consents, documentAccessLog, messages, placements, requisitions, submissions, tasks, webhookEvents } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { consentSchema } from "@/lib/schemas/candidates";
import { stageChangeSchema } from "@/lib/schemas/pipeline";
import { grantConsent, withdrawConsent } from "@/server/candidates/mutations";
import { readDocumentForDownload, uploadDocument } from "@/server/documents/service";
import { handleWhatsAppWebhook, queueTemplateMessage, sendQueuedMessage } from "@/server/messaging/outreach";
import { cancelPlacement, completePlacement, replacePlacement, startPlacement } from "@/server/pipeline/placements";
import { changeStage, createSubmission } from "@/server/pipeline/submissions";
import { getRequisitionDetail } from "@/server/requisitions";
import { invalidateSettingsCache, setSetting } from "@/server/settings";
import { testAuth } from "@/test/auth";
import { advance, candidateByEmail, isoDay, loadSeededUsers, openRequisition, type SeededUserKey } from "@/test/fixtures";

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

const NORDSEE = "Nordsee Werft GmbH";

async function shareWith(actor: CurrentUser, candidateId: string, accountId: string) {
  const existing = await db.query.consents.findFirst({ where: and(eq(consents.candidateId, candidateId), eq(consents.accountId, accountId), eq(consents.scope, "share_with_customer"), isNull(consents.withdrawnAt)) });
  if (!existing) await grantConsent(actor, consentSchema.parse({ candidateId, scope: "share_with_customer", accountId, channel: "phone", evidence: "Agreed on a call" }));
}

/** Creates a submission and takes it to an accepted offer, which reserves a seat. */
async function acceptedSubmission(actor: CurrentUser, requisitionId: string, accountId: string, email: string, startDays: number) {
  const cand = await candidateByEmail(db, email);
  await shareWith(actor, cand.id, accountId);
  const id = await createSubmission(actor, { requisitionId, candidateId: cand.id, ownerId: null, sourceId: null, notes: null });
  await advance(actor, id, ["contacted", "interested", "presented", "customer_review", "offered"]);
  await changeStage(actor, stageChangeSchema.parse({ submissionId: id, toStage: "accepted", reason: null, notes: null, plannedStart: isoDay(startDays), plannedEnd: isoDay(startDays + 28), overrideReview: false }));
  const placement = await db.query.placements.findFirst({ where: and(eq(placements.submissionId, id), eq(placements.status, "reserved")) });
  if (!placement) throw new Error("seat was not reserved");
  return { submissionId: id, candidateId: cand.id, placement };
}

const seats = async (requisitionId: string) => (await getRequisitionDetail(user("noa"), requisitionId)).seats;

describe("placement lifecycle reconciles headcount", () => {
  it("cancellation releases the seat, reopens the requisition and prompts an availability recheck", async () => {
    const yossi = user("yossi");
    const req = await openRequisition(db, yossi, NORDSEE, 1, 600);
    const { placement, submissionId, candidateId } = await acceptedSubmission(yossi, req.id, req.accountId, "noam.friedman@example.com", 600);
    await startPlacement(yossi, { id: placement.id, actualStart: isoDay(600) });
    expect((await db.query.requisitions.findFirst({ where: eq(requisitions.id, req.id) }))?.status).toBe("filled");
    expect(await seats(req.id)).toMatchObject({ headcount: 1, open: 0 });

    await cancelPlacement(yossi, { id: placement.id, reason: "customer_cancelled", notes: "Project postponed" });

    const after = await db.query.placements.findFirst({ where: eq(placements.id, placement.id) });
    expect(after?.status).toBe("cancelled");
    expect(after?.cancellationReason).toBe("customer_cancelled");
    expect((await db.query.submissions.findFirst({ where: eq(submissions.id, submissionId) }))?.stage).toBe("rejected_by_customer");
    expect((await db.query.requisitions.findFirst({ where: eq(requisitions.id, req.id) }))?.status).toBe("open");
    expect(await seats(req.id)).toMatchObject({ headcount: 1, open: 1 });
    // The candidate is free again but must re-confirm availability before being matched.
    expect((await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) }))?.status).toBe("active");
    const availability = await db.query.candidateAvailability.findFirst({ where: and(eq(candidateAvailability.candidateId, candidateId), eq(candidateAvailability.isCurrent, true)) });
    expect(availability?.lastConfirmedAt).toBeNull();
    const recheck = await db.query.tasks.findFirst({ where: and(eq(tasks.placementId, placement.id), eq(tasks.type, "availability_check")) });
    expect(recheck?.status).toBe("open");
    expect(recheck?.ownerId).toBe(yossi.id);

    // The released seat can be taken by someone else.
    const next = await acceptedSubmission(yossi, req.id, req.accountId, "eitan.shapiro@example.com", 600);
    expect(next.placement.status).toBe("reserved");
    expect(await seats(req.id)).toMatchObject({ headcount: 1, open: 0 });
  });

  it("replacement hands the seat to another presented candidate without exceeding headcount", async () => {
    const yossi = user("yossi");
    const req = await openRequisition(db, yossi, NORDSEE, 1, 700);
    const first = await acceptedSubmission(yossi, req.id, req.accountId, "itai.benami@example.com", 700);
    await startPlacement(yossi, { id: first.placement.id, actualStart: isoDay(700) });

    const shira = await candidateByEmail(db, "shira.katz@example.com");
    await shareWith(yossi, shira.id, req.accountId);
    const backup = await createSubmission(yossi, { requisitionId: req.id, candidateId: shira.id, ownerId: null, sourceId: null, notes: null });
    await advance(yossi, backup, ["contacted", "interested", "presented"]);
    // While the seat is filled nobody else can accept an offer on it.
    await expect(changeStage(yossi, stageChangeSchema.parse({ submissionId: backup, toStage: "customer_review", reason: null, notes: null, plannedStart: null, plannedEnd: null, overrideReview: false }))).resolves.toBeTruthy();
    await advance(yossi, backup, ["offered"], { plannedStart: isoDay(702), plannedEnd: isoDay(728) });
    await expect(changeStage(yossi, stageChangeSchema.parse({ submissionId: backup, toStage: "accepted", reason: null, notes: null, plannedStart: isoDay(702), plannedEnd: isoDay(728), overrideReview: false }))).rejects.toThrow(/No open seats/);

    const replacementId = await replacePlacement(yossi, { id: first.placement.id, replacementSubmissionId: backup, plannedStart: isoDay(702), reason: "failed_start", notes: "Did not pass the site induction" });

    const old = await db.query.placements.findFirst({ where: eq(placements.id, first.placement.id) });
    const replacement = await db.query.placements.findFirst({ where: eq(placements.id, replacementId) });
    expect(old?.status).toBe("replaced");
    expect(replacement).toMatchObject({ status: "reserved", replacementOfId: first.placement.id, candidateId: shira.id, plannedStart: isoDay(702) });
    expect(replacement?.billRateAmount).toBe(old?.billRateAmount);
    expect((await db.query.submissions.findFirst({ where: eq(submissions.id, first.submissionId) }))?.stage).toBe("withdrawn");
    expect((await db.query.submissions.findFirst({ where: eq(submissions.id, backup) }))?.stage).toBe("accepted");
    // Exactly one seat is still counted: the replacement's.
    expect(await seats(req.id)).toMatchObject({ headcount: 1, open: 0 });
    const live = await db.select().from(placements).where(and(eq(placements.requisitionId, req.id), eq(placements.isDeleted, false)));
    expect(live.filter((p) => ["reserved", "started", "active", "extended"].includes(p.status))).toHaveLength(1);
  });

  it("completion returns the candidate to the pool with a re-confirmation task", async () => {
    const yossi = user("yossi");
    const req = await openRequisition(db, yossi, NORDSEE, 1, 800);
    const { placement, candidateId } = await acceptedSubmission(yossi, req.id, req.accountId, "hanna.weiss@example.com", 800);
    await startPlacement(yossi, { id: placement.id, actualStart: isoDay(800) });
    expect((await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) }))?.status).toBe("placed");

    await completePlacement(yossi, { id: placement.id, actualEnd: isoDay(828), notes: "Contract ended as planned" });

    expect((await db.query.placements.findFirst({ where: eq(placements.id, placement.id) }))).toMatchObject({ status: "completed", actualEnd: isoDay(828) });
    expect((await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) }))?.status).toBe("active");
    const recheck = await db.query.tasks.findFirst({ where: and(eq(tasks.placementId, placement.id), eq(tasks.type, "availability_check")) });
    expect(recheck?.title).toMatch(/completion/);
    expect(await seats(req.id)).toMatchObject({ headcount: 1, open: 1 });
  });

  it("declining one request neither rejects the candidate elsewhere nor keeps the seat", async () => {
    const yossi = user("yossi");
    const reqA = await openRequisition(db, yossi, NORDSEE, 1, 900);
    const reqB = await openRequisition(db, yossi, NORDSEE, 1, 950);
    const a = await acceptedSubmission(yossi, reqA.id, reqA.accountId, "daniel.rosen@example.com", 900);
    const subB = await createSubmission(yossi, { requisitionId: reqB.id, candidateId: a.candidateId, ownerId: null, sourceId: null, notes: null });
    await advance(yossi, subB, ["contacted", "interested", "presented"]);
    const statusBefore = (await db.query.candidates.findFirst({ where: eq(candidates.id, a.candidateId) }))?.status;

    await changeStage(yossi, stageChangeSchema.parse({ submissionId: a.submissionId, toStage: "declined_by_candidate", reason: "candidate_withdrew", notes: "Took another offer", plannedStart: null, plannedEnd: null, overrideReview: false }));

    const declined = await db.query.submissions.findFirst({ where: eq(submissions.id, a.submissionId) });
    expect(declined?.stage).toBe("declined_by_candidate");
    expect(declined?.decisionReason).toBe("candidate_withdrew");
    expect((await db.query.placements.findFirst({ where: eq(placements.id, a.placement.id) }))?.status).toBe("cancelled");
    expect(await seats(reqA.id)).toMatchObject({ headcount: 1, open: 1 });
    // The other submission and the person record are untouched.
    expect((await db.query.submissions.findFirst({ where: eq(submissions.id, subB) }))?.stage).toBe("presented");
    expect((await db.query.candidates.findFirst({ where: eq(candidates.id, a.candidateId) }))?.status).toBe(statusBefore);
  });
});

describe("file access by role", () => {
  const pdf = (name: string, body = "%PDF-1.4\n%test document\n") => new File([body], name, { type: "application/pdf" });

  it("restricts identity documents to the owner, verifiers, submission owners and admins, and logs every download", async () => {
    const maya = user("maya");
    const yossi = user("yossi");
    const eden = await candidateByEmail(db, "eden.shalev@example.com");
    expect(eden.ownerId).toBe(maya.id);
    expect(await db.query.submissions.findFirst({ where: eq(submissions.candidateId, eden.id) })).toBeUndefined();
    const passport = await uploadDocument(maya, { file: pdf("passport.pdf"), kind: "passport", candidateId: eden.id });
    const cv = await uploadDocument(maya, { file: pdf("cv.pdf"), kind: "cv", candidateId: eden.id, extract: false });
    expect(passport.isSensitive).toBe(true);
    expect(cv.isSensitive).toBe(false);

    // Team sharing: everyone can read the CV; the passport needs a placement-related reason to see it.
    await expect(readDocumentForDownload(user("lior"), cv.id)).resolves.toBeTruthy();
    await expect(readDocumentForDownload(user("lior"), passport.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(readDocumentForDownload(yossi, passport.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(readDocumentForDownload(user("daniel"), passport.id)).resolves.toBeTruthy(); // verifier
    await expect(readDocumentForDownload(maya, passport.id)).resolves.toBeTruthy(); // owner
    const { data } = await readDocumentForDownload(user("noa"), passport.id);
    expect(data.subarray(0, 4).toString("latin1")).toBe("%PDF");

    // Owning a submission for the candidate is such a reason.
    const req = await openRequisition(db, yossi, NORDSEE, 1, 1000);
    await createSubmission(yossi, { requisitionId: req.id, candidateId: eden.id, ownerId: yossi.id, sourceId: null, notes: null });
    await expect(readDocumentForDownload(yossi, passport.id)).resolves.toBeTruthy();

    const log = await db.select().from(documentAccessLog).where(eq(documentAccessLog.documentId, passport.id));
    expect(log.filter((l) => l.action === "upload")).toHaveLength(1);
    expect(log.filter((l) => l.action === "download").map((l) => l.userId).sort()).toEqual([user("daniel").id, maya.id, user("noa").id, yossi.id].sort());
  });

  it("hides files of candidates outside the caller's scope under the owner sharing model", async () => {
    const maya = user("maya");
    const omer = await candidateByEmail(db, "omer.dahan@example.com");
    const cv = await uploadDocument(maya, { file: pdf("cv-v2.pdf"), kind: "cv", candidateId: omer.id, extract: false });
    await setSetting("sharing_model", "owner", user("noa").id);
    invalidateSettingsCache();
    try {
      await expect(readDocumentForDownload(user("yossi"), cv.id)).rejects.toMatchObject({ code: "not_found" });
      await expect(readDocumentForDownload(maya, cv.id)).resolves.toBeTruthy();
    } finally {
      await setSetting("sharing_model", "team", user("noa").id);
      invalidateSettingsCache();
    }
  });

  it("rejects mislabelled files and never serves a file that failed the malware scan", async () => {
    const maya = user("maya");
    const omer = await candidateByEmail(db, "omer.dahan@example.com");
    await expect(uploadDocument(maya, { file: pdf("notreally.pdf", "hello, not a pdf"), kind: "other", candidateId: omer.id })).rejects.toThrow(/does not match its type/);
    const infected = await uploadDocument(maya, { file: pdf("eicar.pdf", "%PDF-1.4 X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"), kind: "other", candidateId: omer.id });
    expect(infected.scanStatus).toBe("infected");
    await expect(readDocumentForDownload(user("noa"), infected.id)).rejects.toThrow(/malware/);
  });
});

describe("outreach permission and idempotency", () => {
  it("queues a send key once and suppresses outreach when permission to communicate is missing", async () => {
    const maya = user("maya");
    const omer = await candidateByEmail(db, "omer.dahan@example.com");
    const sendKey = `test:interest:${omer.id}`;
    const first = await queueTemplateMessage({ candidateId: omer.id, templateName: "Interest check", actorId: maya.id, sendKey });
    const second = await queueTemplateMessage({ candidateId: omer.id, templateName: "Interest check", actorId: maya.id, sendKey });
    expect(first.messageId).toBeTruthy();
    expect(second.messageId).toBe(first.messageId);
    expect(second.note).toMatch(/Already queued/);
    expect(await db.select().from(messages).where(eq(messages.sendKey, sendKey))).toHaveLength(1);
    // No provider is configured in tests, so the permitted fallback is a logged manual task with the rendered text.
    expect(first.status).toBe("manual_pending");
    const fallback = await db.query.tasks.findFirst({ where: eq(tasks.dedupeKey, `manual:${sendKey}`) });
    expect(fallback?.type).toBe("manual_contact");
    expect(fallback?.description).toMatch(/Omer/);

    const communicate = await db.query.consents.findFirst({ where: and(eq(consents.candidateId, omer.id), eq(consents.scope, "communicate"), isNull(consents.withdrawnAt)) });
    expect(communicate).toBeDefined();
    await withdrawConsent(maya, communicate!.id, "Asked to stop");
    const suppressed = await queueTemplateMessage({ candidateId: omer.id, templateName: "Interest check", actorId: maya.id, sendKey: `${sendKey}:after-withdrawal` });
    expect(suppressed.status).toBe("suppressed");
    expect((await db.query.messages.findFirst({ where: eq(messages.id, suppressed.messageId!) }))?.errorMessage).toMatch(/permission/i);
  });

  it("re-checks permission at send time so a withdrawal between queueing and sending suppresses the message", async () => {
    const maya = user("maya");
    const itai = await candidateByEmail(db, "itai.benami@example.com");
    const [queued] = await db
      .insert(messages)
      .values({ channel: "whatsapp", status: "queued", candidateId: itai.id, toAddress: itai.phone!, body: "Hi Itai", sendKey: `test:send-time:${itai.id}`, createdBy: maya.id })
      .returning();
    const communicate = await db.query.consents.findFirst({ where: and(eq(consents.candidateId, itai.id), eq(consents.scope, "communicate"), isNull(consents.withdrawnAt)) });
    await withdrawConsent(maya, communicate!.id, "Opted out by phone");
    const result = await sendQueuedMessage(queued!.id);
    expect(result).toEqual({ suppressed: true });
    expect((await db.query.messages.findFirst({ where: eq(messages.id, queued!.id) }))).toMatchObject({ status: "suppressed", errorMessage: "Permission withdrawn before send" });
  });
});

describe("provider webhooks", () => {
  it("processes each delivery event once and turns a provider failure into an owned task", async () => {
    const maya = user("maya");
    const gal = await candidateByEmail(db, "gal.peretz@example.com");
    const [sent] = await db
      .insert(messages)
      .values({ channel: "whatsapp", status: "sent", candidateId: gal.id, toAddress: gal.phone!, body: "Hi Gal", sendKey: `test:webhook:${gal.id}`, providerMessageId: "wamid.TEST-1", sentAt: new Date(), createdBy: maya.id })
      .returning();
    const delivered = { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.TEST-1", status: "delivered", timestamp: "1" }] } }] }] };
    expect(await handleWhatsAppWebhook(delivered, true)).toEqual({ processed: 1 });
    expect(await handleWhatsAppWebhook(delivered, true)).toEqual({ processed: 0 });
    expect((await db.query.messages.findFirst({ where: eq(messages.id, sent!.id) }))?.status).toBe("delivered");
    expect(await db.select().from(webhookEvents).where(eq(webhookEvents.externalEventId, "wa-status:wamid.TEST-1:delivered"))).toHaveLength(1);

    const failed = { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.TEST-1", status: "failed", timestamp: "2", errors: [{ title: "Re-engagement message", message: "Message failed to send because more than 24 hours have passed" }] }] } }] }] };
    expect(await handleWhatsAppWebhook(failed, true)).toEqual({ processed: 1 });
    const message = await db.query.messages.findFirst({ where: eq(messages.id, sent!.id) });
    expect(message?.status).toBe("failed");
    expect(message?.errorMessage).toMatch(/24 hours/);
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, message!.fallbackTaskId!) });
    expect(task).toMatchObject({ type: "message_failed", status: "open", ownerId: gal.ownerId, candidateId: gal.id });
  });

  it("treats a STOP reply as an opt-out that blocks further outreach", async () => {
    const maya = user("maya");
    const alexey = await candidateByEmail(db, "alexey.petrov@example.com");
    expect(alexey.phoneNormalized).toBeTruthy();
    const inbound = { entry: [{ changes: [{ value: { messages: [{ id: "wamid.IN-1", from: alexey.phoneNormalized!, timestamp: "3", type: "text", text: { body: "STOP" } }] } }] }] };
    expect(await handleWhatsAppWebhook(inbound, true)).toEqual({ processed: 1 });
    expect(await handleWhatsAppWebhook(inbound, true)).toEqual({ processed: 0 });

    const active = await db.query.consents.findFirst({ where: and(eq(consents.candidateId, alexey.id), eq(consents.scope, "communicate"), isNull(consents.withdrawnAt)) });
    expect(active).toBeUndefined();
    const reply = await db.query.tasks.findFirst({ where: eq(tasks.dedupeKey, "reply:wa-in:wamid.IN-1") });
    expect(reply?.candidateId).toBe(alexey.id);
    const attempt = await queueTemplateMessage({ candidateId: alexey.id, templateName: "Interest check", actorId: maya.id, sendKey: `test:after-stop:${alexey.id}` });
    expect(attempt.status).toBe("suppressed");
  });

  it("rejects stage moves for unknown submissions with a typed error", async () => {
    await expect(changeStage(user("noa"), stageChangeSchema.parse({ submissionId: "00000000-0000-4000-8000-000000000000", toStage: "contacted", reason: null, notes: null, plannedStart: null, plannedEnd: null, overrideReview: false }))).rejects.toBeInstanceOf(AppError);
  });
});
