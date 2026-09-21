import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { candidates, uploadLinks, users } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { AppError, conflict, forbiddenError, notFound, validation } from "@/lib/errors";
import { fmtDateTime } from "@/lib/format";
import { logger } from "@/lib/logger";
import { getRequestMeta } from "@/lib/request-context";
import { cleanText } from "@/lib/sanitize";
import { logActivity } from "../activities";
import { getCandidate } from "../candidates/queries";
import { canEditRecord } from "../scope";
import { createTask } from "../tasks";
import { uploadDocument } from "./service";

/**
 * Secure upload links (plan §4 "route sensitive ID collection through secure upload links").
 * A recruiter mints a link pinned to one candidate and a set of document kinds; the candidate opens it
 * without an account and uploads files that land privately on their record. Only a hash of the token is
 * stored, links expire and can be revoked, and each upload raises a review task for the recruiter.
 */

export type UploadLinkKind = (typeof uploadLinks.$inferSelect.kinds)[number];

/** Kinds a candidate may be asked to supply; CVs and contracts stay staff-side. */
export const REQUESTABLE_KINDS: UploadLinkKind[] = ["passport", "id_document", "certificate", "license", "photo", "transcript", "other"];
export const MAX_LINK_HOURS = 24 * 14;
export const MAX_LINK_FILES = 10;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const publicUrl = (token: string) => new URL(`/upload/${token}`, env.APP_URL).toString();

export type UploadLinkSummary = {
  id: string;
  kinds: UploadLinkKind[];
  purpose: string | null;
  maxFiles: number;
  usedCount: number;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  createdByName: string | null;
  state: "active" | "expired" | "revoked" | "used_up";
};

function stateOf(link: { expiresAt: Date; revokedAt: Date | null; usedCount: number; maxFiles: number }, now = new Date()): UploadLinkSummary["state"] {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt <= now) return "expired";
  if (link.usedCount >= link.maxFiles) return "used_up";
  return "active";
}

export async function createUploadLink(user: CurrentUser, input: { candidateId: string; kinds: UploadLinkKind[]; expiresInHours: number; maxFiles: number; purpose?: string | null }) {
  const db = await getDb();
  const candidate = await getCandidate(user, input.candidateId);
  if (!(await canEditRecord(user, candidate.ownerId))) throw forbiddenError();
  if (candidate.anonymizedAt) throw conflict("This profile has been erased.");
  if (candidate.status === "withdrawn") throw conflict("The candidate withdrew permission to process their profile, so no new documents can be requested.");
  const kinds = [...new Set(input.kinds)].filter((k): k is UploadLinkKind => REQUESTABLE_KINDS.includes(k));
  if (kinds.length === 0) throw validation("Choose at least one document type the candidate should upload.");
  if (input.expiresInHours < 1 || input.expiresInHours > MAX_LINK_HOURS) throw validation(`Links can stay open between 1 hour and ${MAX_LINK_HOURS / 24} days.`);
  if (input.maxFiles < 1 || input.maxFiles > MAX_LINK_FILES) throw validation(`Allow between 1 and ${MAX_LINK_FILES} files.`);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + input.expiresInHours * 3_600_000);
  const [link] = await db
    .insert(uploadLinks)
    .values({ candidateId: candidate.id, tokenHash: hashToken(token), kinds, purpose: cleanText(input.purpose) ?? null, maxFiles: input.maxFiles, expiresAt, createdBy: user.id })
    .returning();
  await recordAudit(db, { entityType: "upload_link", entityId: link!.id, action: "create", actorId: user.id, after: { candidateId: candidate.id, kinds, expiresAt, maxFiles: input.maxFiles } });
  await logActivity(db, {
    type: "system",
    subject: `Secure upload link sent for ${kinds.map((k) => k.replace(/_/g, " ")).join(", ")}`,
    body: `Open until ${fmtDateTime(expiresAt)} · up to ${input.maxFiles} file${input.maxFiles === 1 ? "" : "s"}${input.purpose ? ` · ${cleanText(input.purpose)}` : ""}`,
    candidateId: candidate.id,
    actorId: user.id,
  });
  logger.info("upload_link.created", { linkId: link!.id, candidateId: candidate.id, kinds, expiresAt });
  // The plaintext token exists only in this response; it is never persisted or logged.
  return { id: link!.id, url: publicUrl(token), expiresAt, kinds, maxFiles: input.maxFiles };
}

export async function revokeUploadLink(user: CurrentUser, linkId: string) {
  const db = await getDb();
  const link = await db.query.uploadLinks.findFirst({ where: and(eq(uploadLinks.id, linkId), eq(uploadLinks.isDeleted, false)) });
  if (!link) throw notFound("Upload link");
  const candidate = await getCandidate(user, link.candidateId);
  if (!(await canEditRecord(user, candidate.ownerId))) throw forbiddenError();
  if (link.revokedAt) return link;
  const [after] = await db.update(uploadLinks).set({ revokedAt: new Date() }).where(eq(uploadLinks.id, linkId)).returning();
  await recordAudit(db, { entityType: "upload_link", entityId: linkId, action: "update", actorId: user.id, before: { revokedAt: null }, after: { revokedAt: after!.revokedAt }, note: "revoked" });
  await logActivity(db, { type: "system", subject: "Secure upload link revoked", candidateId: link.candidateId, actorId: user.id });
  return after!;
}

export async function listUploadLinks(user: CurrentUser, candidateId: string): Promise<UploadLinkSummary[]> {
  const db = await getDb();
  await getCandidate(user, candidateId);
  const rows = await db
    .select({ link: uploadLinks, createdByName: users.name })
    .from(uploadLinks)
    .leftJoin(users, eq(users.id, uploadLinks.createdBy))
    .where(and(eq(uploadLinks.candidateId, candidateId), eq(uploadLinks.isDeleted, false)))
    .orderBy(desc(uploadLinks.createdAt))
    .limit(20);
  return rows.map(({ link, createdByName }) => ({
    id: link.id,
    kinds: link.kinds,
    purpose: link.purpose,
    maxFiles: link.maxFiles,
    usedCount: link.usedCount,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    lastUsedAt: link.lastUsedAt,
    createdAt: link.createdAt,
    createdByName,
    state: stateOf(link),
  }));
}

/** What the public page may know: enough to greet the candidate and constrain the form, nothing else. */
export type PublicUploadLink = {
  linkId: string;
  candidateFirstName: string;
  kinds: UploadLinkKind[];
  purpose: string | null;
  remaining: number;
  expiresAt: Date;
};

async function loadUsableLink(token: string) {
  const db = await getDb();
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const now = new Date();
  const row = await db
    .select({ link: uploadLinks, firstName: candidates.firstName, candidateStatus: candidates.status, anonymizedAt: candidates.anonymizedAt })
    .from(uploadLinks)
    .innerJoin(candidates, eq(candidates.id, uploadLinks.candidateId))
    .where(and(eq(uploadLinks.tokenHash, hashToken(token)), eq(uploadLinks.isDeleted, false), isNull(uploadLinks.revokedAt), gt(uploadLinks.expiresAt, now), eq(candidates.isDeleted, false)))
    .limit(1);
  const hit = row[0];
  if (!hit || hit.anonymizedAt || hit.candidateStatus === "withdrawn") return null;
  return hit;
}

export async function resolveUploadLink(token: string): Promise<PublicUploadLink | null> {
  const hit = await loadUsableLink(token);
  if (!hit) return null;
  return {
    linkId: hit.link.id,
    candidateFirstName: hit.firstName,
    kinds: hit.link.kinds,
    purpose: hit.link.purpose,
    remaining: Math.max(0, hit.link.maxFiles - hit.link.usedCount),
    expiresAt: hit.link.expiresAt,
  };
}

/**
 * Accepts one file from the candidate. Runs the same validation, scanning and storage path as a staff
 * upload, attributed to the link's creator as the accountable owner, then raises a review task.
 */
export async function acceptLinkUpload(token: string, file: File, kind: string) {
  const db = await getDb();
  const hit = await loadUsableLink(token);
  if (!hit) throw new AppError("not_found", "This upload link is no longer valid. Ask your recruiter for a new one.");
  const { link } = hit;
  if (!link.kinds.includes(kind as UploadLinkKind)) throw validation("That document type was not requested through this link.");

  // Reserve a slot atomically so parallel submissions cannot exceed the limit.
  const [claimed] = await db
    .update(uploadLinks)
    .set({ usedCount: sql`${uploadLinks.usedCount} + 1`, lastUsedAt: new Date(), lastUsedIp: (await getRequestMeta()).ip })
    .where(and(eq(uploadLinks.id, link.id), sql`${uploadLinks.usedCount} < ${uploadLinks.maxFiles}`))
    .returning({ id: uploadLinks.id, usedCount: uploadLinks.usedCount });
  if (!claimed) throw conflict("This link has already received the maximum number of files.");

  const creator = link.createdBy ? await db.query.users.findFirst({ where: eq(users.id, link.createdBy) }) : null;
  if (!creator) {
    await db.update(uploadLinks).set({ usedCount: sql`${uploadLinks.usedCount} - 1` }).where(eq(uploadLinks.id, link.id));
    throw new AppError("not_found", "This upload link is no longer valid. Ask your recruiter for a new one.");
  }

  let doc;
  try {
    doc = await uploadDocument(creator, { file, kind: kind as UploadLinkKind, candidateId: link.candidateId, extract: kind === "certificate", viaUploadLinkId: link.id });
  } catch (error) {
    await db.update(uploadLinks).set({ usedCount: sql`${uploadLinks.usedCount} - 1` }).where(eq(uploadLinks.id, link.id));
    throw error;
  }

  const kindLabel = kind.replace(/_/g, " ");
  await logActivity(db, { type: "system", subject: `Candidate uploaded a ${kindLabel} through the secure link`, body: doc.scanStatus === "infected" ? "The file failed the malware scan and is quarantined." : `${doc.filename} · ${(doc.sizeBytes / 1024).toFixed(0)} KB`, candidateId: link.candidateId, actorId: null });
  await createTask(db, {
    type: "verification",
    title: `Review ${kindLabel} uploaded by ${hit.firstName}`,
    description: `The candidate uploaded ${doc.filename} through a secure link${link.purpose ? ` (${link.purpose})` : ""}. Check it against the claim it supports, then record the verification.`,
    priority: doc.isSensitive ? "high" : "medium",
    status: "open",
    ownerId: creator.id,
    candidateId: link.candidateId,
    dueAt: new Date(Date.now() + 48 * 3_600_000),
    dedupeKey: `upload-link-review:${doc.id}`,
    createdBy: null,
  });
  const remaining = Math.max(0, link.maxFiles - claimed.usedCount);
  return { documentId: doc.id, filename: doc.filename, kind: doc.kind, remaining, scanStatus: doc.scanStatus };
}

/** Upload links that would otherwise linger: expired for more than 30 days are soft-deleted by maintenance. */
export async function purgeStaleUploadLinks(db: Awaited<ReturnType<typeof getDb>>) {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const rows = await db.update(uploadLinks).set({ isDeleted: true }).where(and(eq(uploadLinks.isDeleted, false), sql`${uploadLinks.expiresAt} < ${cutoff}`)).returning({ id: uploadLinks.id });
  return rows.length;
}
