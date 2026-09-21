import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { candidates, documentAccessLog, documents, submissions } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { AppError, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getRequestMeta } from "@/lib/request-context";
import { cleanText } from "@/lib/sanitize";
import { enqueueJob } from "../jobs/queue";
import { visibilityScope } from "../scope";
import { storage } from "./storage";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED: Record<string, { ext: string[]; magic?: (b: Buffer) => boolean }> = {
  "application/pdf": { ext: ["pdf"], magic: (b) => b.subarray(0, 4).toString("latin1") === "%PDF" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: ["docx"], magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
  "application/msword": { ext: ["doc"] },
  "text/plain": { ext: ["txt"] },
  "image/jpeg": { ext: ["jpg", "jpeg"], magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  "image/png": { ext: ["png"], magic: (b) => b[0] === 0x89 && b[1] === 0x50 },
};
const SENSITIVE_KINDS = new Set(["passport", "id_document", "contract"]);

type DocumentKind = typeof documents.$inferSelect.kind;

export async function extractDocumentText(buffer: Buffer, mimeType: string): Promise<string | null> {
  try {
    if (mimeType === "application/pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      return text.trim() || null;
    }
    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim() || null;
    }
    if (mimeType === "text/plain") return buffer.toString("utf8").trim() || null;
  } catch (error) {
    logger.warn("document.text_extraction_failed", { mimeType, error: String(error) });
  }
  return null;
}

/** Placeholder for a malware scanner integration; records `skipped` so the gap is visible, never silent. */
async function scanBuffer(buffer: Buffer): Promise<"clean" | "infected" | "skipped"> {
  // EICAR test signature lets the "infected" path be exercised end to end without a scanner.
  if (buffer.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) return "infected";
  return "skipped";
}

export async function uploadDocument(
  user: CurrentUser,
  input: {
    file: File;
    kind: DocumentKind;
    candidateId?: string | null;
    accountId?: string | null;
    submissionId?: string | null;
    placementId?: string | null;
    replacesDocumentId?: string | null;
    extract?: boolean;
    /** Set when the candidate uploads through a secure link: the link already pins the candidate, and the access log records the link rather than a staff user. */
    viaUploadLinkId?: string | null;
  },
) {
  const db = await getDb();
  if (input.file.size === 0) throw new AppError("validation", "The file is empty.");
  if (input.file.size > MAX_BYTES) throw new AppError("validation", "Files must be smaller than 15 MB.");
  const mime = input.file.type || "application/octet-stream";
  const rule = ALLOWED[mime];
  const ext = input.file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!rule || !rule.ext.includes(ext)) throw new AppError("validation", "Allowed file types: PDF, DOCX, DOC, TXT, JPG, PNG.");
  const buffer = Buffer.from(await input.file.arrayBuffer());
  if (rule.magic && !rule.magic(buffer)) throw new AppError("validation", "The file content does not match its type.");

  if (input.candidateId && !input.viaUploadLinkId) {
    const scope = await visibilityScope(user, candidates.ownerId, candidates.isDeleted);
    const cand = await db.query.candidates.findFirst({ where: and(eq(candidates.id, input.candidateId), scope) });
    if (!cand) throw notFound("Candidate");
  }

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const safeName = (cleanText(input.file.name) ?? "file").replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const folder = input.candidateId ?? input.accountId ?? "misc";
  const storageKey = `${folder}/${randomUUID()}-${safeName}`;
  await storage.put(storageKey, buffer);
  const scanStatus = await scanBuffer(buffer);
  const wantText = input.extract ?? (input.kind === "cv" || input.kind === "certificate");
  const extractedText = wantText ? await extractDocumentText(buffer, mime) : null;

  let version = 1;
  if (input.replacesDocumentId) {
    const prev = await db.query.documents.findFirst({ where: eq(documents.id, input.replacesDocumentId) });
    if (prev) version = prev.version + 1;
  }

  const [doc] = await db
    .insert(documents)
    .values({
      candidateId: input.candidateId ?? null,
      accountId: input.accountId ?? null,
      submissionId: input.submissionId ?? null,
      placementId: input.placementId ?? null,
      kind: input.kind,
      filename: safeName,
      mimeType: mime,
      sizeBytes: buffer.length,
      storageKey,
      sha256,
      version,
      previousVersionId: input.replacesDocumentId ?? null,
      scanStatus,
      isSensitive: SENSITIVE_KINDS.has(input.kind),
      extractedText: extractedText?.slice(0, 200_000) ?? null,
      uploadedById: input.viaUploadLinkId ? null : user.id,
      createdBy: user.id,
    })
    .returning();
  await logDocumentAccess(doc!.id, input.viaUploadLinkId ? null : user.id, "upload", input.viaUploadLinkId ? { uploadLinkId: input.viaUploadLinkId, by: "candidate" } : undefined);

  if (input.kind === "cv" && input.candidateId) {
    await enqueueJob(db, {
      type: "ai:extract_cv",
      payload: { documentId: doc!.id, candidateId: input.candidateId, actorId: user.id },
      idempotencyKey: `extract:${doc!.id}`,
      ownerId: user.id,
    });
  }
  return doc!;
}

export async function logDocumentAccess(documentId: string, userId: string | null, action: typeof documentAccessLog.$inferInsert.action, details?: Record<string, unknown>) {
  const db = await getDb();
  const meta = await getRequestMeta();
  await db.insert(documentAccessLog).values({ documentId, userId, action, ip: meta.ip, userAgent: meta.userAgent, details: details ?? null });
}

/**
 * Authorisation for reading a document: caller must be able to see the owning candidate/account,
 * and sensitive documents (passport, ID, contracts) additionally require ownership of the candidate
 * or of a submission for that candidate, the verifier flag, or Super Admin.
 */
export async function authorizeDocumentRead(user: CurrentUser, documentId: string) {
  const db = await getDb();
  const doc = await db.query.documents.findFirst({ where: and(eq(documents.id, documentId), eq(documents.isDeleted, false)) });
  if (!doc) throw notFound("Document");
  if (user.role === "super_admin") return doc;
  if (doc.candidateId) {
    const scope = await visibilityScope(user, candidates.ownerId, candidates.isDeleted);
    const cand = await db.query.candidates.findFirst({ where: and(eq(candidates.id, doc.candidateId), scope) });
    if (!cand) throw notFound("Document");
    if (doc.isSensitive) {
      if (user.canVerify || cand.ownerId === user.id) return doc;
      const mine = await db.query.submissions.findFirst({ where: and(eq(submissions.candidateId, cand.id), eq(submissions.ownerId, user.id), eq(submissions.isDeleted, false)) });
      if (!mine) throw new AppError("forbidden", "This document is restricted to the candidate's owner, submission owners and verifiers.");
    }
  }
  return doc;
}

export async function readDocumentForDownload(user: CurrentUser, documentId: string) {
  const doc = await authorizeDocumentRead(user, documentId);
  if (doc.scanStatus === "infected") throw new AppError("forbidden", "This file failed the malware scan and cannot be downloaded.");
  const data = await storage.get(doc.storageKey);
  await logDocumentAccess(doc.id, user.id, "download");
  return { doc, data };
}

export async function listCandidateDocuments(candidateId: string) {
  const db = await getDb();
  return db.select().from(documents).where(and(eq(documents.candidateId, candidateId), eq(documents.isDeleted, false))).orderBy(desc(documents.createdAt));
}

export async function softDeleteDocument(user: CurrentUser, documentId: string) {
  const db = await getDb();
  await authorizeDocumentRead(user, documentId);
  await db.update(documents).set({ isDeleted: true }).where(eq(documents.id, documentId));
  await logDocumentAccess(documentId, user.id, "delete");
}
