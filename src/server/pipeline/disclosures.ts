import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@/db/client";
import { candidateLanguages, candidateSkillClaims, candidateWorkAuthorizations, candidateAvailability, candidates, contacts, disclosures, documents, requisitions, skills } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { AppError, forbiddenError, notFound } from "@/lib/errors";
import { cleanText } from "@/lib/sanitize";
import type { disclosureSchema } from "@/lib/schemas/pipeline";
import { logActivity } from "../activities";
import { activeConsent } from "../consents";
import { logDocumentAccess } from "../documents/service";
import { snapshotFor } from "../matching";
import { canEditRecord } from "../scope";
import { getSettings } from "../settings";
import { changeStage, getSubmission } from "./submissions";

export const SHAREABLE_FIELDS = [
  { key: "headline", label: "Headline" },
  { key: "summary", label: "Profile summary" },
  { key: "skills", label: "Skills and verification status" },
  { key: "languages", label: "Languages" },
  { key: "availability", label: "Availability window" },
  { key: "work_authorization", label: "Work authorization (destination)" },
  { key: "military_role", label: "Military role and service dates" },
  { key: "experience", label: "Years of experience" },
  { key: "location", label: "Current city / country" },
  { key: "compensation", label: "Expected compensation" },
] as const;

/** Builds the approved-fields summary text that is actually delivered; nothing else leaves the system. */
export async function buildCandidateSummary(candidateId: string, fields: string[]): Promise<string> {
  const db = await getDb();
  const c = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!c) throw notFound("Candidate");
  const lines: string[] = [`Candidate: ${c.firstName} ${c.lastName.charAt(0)}.`];
  const want = new Set(fields);
  if (want.has("headline") && c.headline) lines.push(`Headline: ${c.headline}`);
  if (want.has("summary") && c.summary) lines.push(`Summary: ${c.summary}`);
  if (want.has("location")) lines.push(`Location: ${[c.city, c.country].filter(Boolean).join(", ") || "n/a"}`);
  if (want.has("experience") && c.yearsExperience) lines.push(`Experience: ${c.yearsExperience} years`);
  if (want.has("military_role") && c.militaryRole) lines.push(`Military role: ${c.militaryRole}${c.militaryServiceStart ? ` (${c.militaryServiceStart} – ${c.militaryServiceEnd ?? "present"})` : ""}`);
  if (want.has("skills")) {
    const claims = await db
      .select({ name: skills.name, proficiency: candidateSkillClaims.declaredProficiency, status: candidateSkillClaims.verificationStatus })
      .from(candidateSkillClaims)
      .innerJoin(skills, eq(skills.id, candidateSkillClaims.skillId))
      .where(and(eq(candidateSkillClaims.candidateId, candidateId), eq(candidateSkillClaims.isDeleted, false)));
    if (claims.length) lines.push(`Skills: ${claims.map((k) => `${k.name} (${k.proficiency}${k.status === "verified" ? ", verified" : ", declared"})`).join("; ")}`);
  }
  if (want.has("languages")) {
    const langs = await db.select().from(candidateLanguages).where(and(eq(candidateLanguages.candidateId, candidateId), eq(candidateLanguages.isDeleted, false)));
    if (langs.length) lines.push(`Languages: ${langs.map((l) => `${l.language.toUpperCase()} ${l.proficiency}`).join(", ")}`);
  }
  if (want.has("work_authorization")) {
    const auths = await db.select().from(candidateWorkAuthorizations).where(and(eq(candidateWorkAuthorizations.candidateId, candidateId), eq(candidateWorkAuthorizations.isDeleted, false)));
    if (auths.length) lines.push(`Work authorization: ${auths.map((a) => `${a.country} ${a.type.replace(/_/g, " ")} (${a.verificationStatus.replace(/_/g, " ")})`).join("; ")}`);
  }
  if (want.has("availability")) {
    const a = await db.query.candidateAvailability.findFirst({ where: and(eq(candidateAvailability.candidateId, candidateId), eq(candidateAvailability.isCurrent, true), eq(candidateAvailability.isDeleted, false)) });
    if (a) lines.push(`Available: from ${a.availableFrom}${a.availableUntil ? ` to ${a.availableUntil}` : ""}${a.lastConfirmedAt ? ` (confirmed ${a.lastConfirmedAt.toISOString().slice(0, 10)})` : " (unconfirmed)"}`);
  }
  if (want.has("compensation")) {
    const comp = await db.query.candidateCompensation.findFirst({ where: (t, { and: a, eq: e }) => a(e(t.candidateId, candidateId), e(t.type, "expected"), e(t.isDeleted, false)) });
    if (comp) lines.push(`Expected compensation: ${comp.amount} ${comp.currency} per ${comp.period} (${comp.grossNet})`);
  }
  return lines.join("\n");
}

/**
 * Records a controlled disclosure of the approved candidate summary to a customer. Requires an
 * active customer-specific sharing permission (withdrawal blocks new disclosures), a non-failing
 * eligibility check, and logs every document shared. Previously delivered copies cannot be recalled.
 */
export async function discloseCandidate(user: CurrentUser, input: z.output<typeof disclosureSchema>) {
  const db = await getDb();
  const sub = await getSubmission(user, input.submissionId);
  if (!(await canEditRecord(user, sub.ownerId))) throw forbiddenError();
  const req = await db.query.requisitions.findFirst({ where: eq(requisitions.id, sub.requisitionId) });
  if (!req) throw notFound("Requisition");
  const consent = await activeConsent(db, sub.candidateId, "share_with_customer", req.accountId);
  if (!consent) throw new AppError("validation", "Sharing blocked: the candidate has not granted (or has withdrawn) permission to be shared with this customer.");
  const fresh = await snapshotFor(db, sub.requisitionId, sub.candidateId);
  if (fresh?.eligibility === "ineligible") throw new AppError("validation", "Sharing blocked: the candidate currently fails a mandatory eligibility rule.");
  const movesToPresented = ["interested", "screening", "interviewing"].includes(sub.stage);
  if (movesToPresented && fresh?.eligibility === "review" && !input.overrideReview) {
    const unknown = fresh.ruleResults.filter((r) => r.kind === "mandatory" && r.outcome === "unknown").map((r) => r.reason);
    throw new AppError("validation", `Eligibility is still under review: ${unknown[0] ?? "missing evidence"}. Resolve the evidence or record an explicit override before sharing.`, { overrideReview: "Confirm the override to share anyway" });
  }
  if (input.contactId) {
    const contact = await db.query.contacts.findFirst({ where: and(eq(contacts.id, input.contactId), eq(contacts.accountId, req.accountId), eq(contacts.isDeleted, false)) });
    if (!contact) throw new AppError("validation", "The chosen contact does not belong to this customer.");
  }
  const allowedKeys = new Set(SHAREABLE_FIELDS.map((f) => f.key as string));
  const fields = input.fieldsShared.filter((f) => allowedKeys.has(f));
  if (fields.length === 0) throw new AppError("validation", "Choose at least one approved field to share.");
  const docs = input.documentIds.length
    ? await db.select().from(documents).where(and(inArray(documents.id, input.documentIds), eq(documents.candidateId, sub.candidateId), eq(documents.isDeleted, false)))
    : [];
  if (docs.length !== input.documentIds.length) throw new AppError("validation", "One of the documents does not belong to this candidate.");
  if (docs.some((d) => d.isSensitive || d.kind === "passport" || d.kind === "id_document")) {
    throw new AppError("validation", "Identity documents and sensitive files cannot be shared in a summary. Use a secure channel with a separate permission.");
  }
  const summary = await buildCandidateSummary(sub.candidateId, fields);
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(disclosures)
      .values({
        submissionId: sub.id,
        candidateId: sub.candidateId,
        accountId: req.accountId,
        contactId: input.contactId,
        consentId: consent.id,
        channel: input.channel,
        fieldsShared: fields,
        documentIds: docs.map((d) => d.id),
        summaryText: summary,
        sharedById: user.id,
        notes: cleanText(input.notes),
        createdBy: user.id,
      })
      .returning();
    await recordAudit(tx, { entityType: "disclosure", entityId: row!.id, action: "disclose", actorId: user.id, after: { accountId: req.accountId, candidateId: sub.candidateId, fields, documents: docs.map((d) => d.id), channel: input.channel } });
    await logActivity(tx, { type: "system", subject: `Candidate summary shared with customer via ${input.channel} (${fields.length} fields, ${docs.length} documents)`, submissionId: sub.id, candidateId: sub.candidateId, requisitionId: req.id, accountId: req.accountId, contactId: input.contactId, actorId: user.id });
    return row!.id;
  });
  for (const d of docs) await logDocumentAccess(d.id, user.id, "share", { disclosureId: id, accountId: req.accountId });
  if (movesToPresented) {
    await changeStage(user, { submissionId: sub.id, toStage: "presented", reason: null, notes: "Presented via disclosure", plannedStart: null, plannedEnd: null, overrideReview: input.overrideReview });
  }
  return { id, summary };
}

export async function revokeDisclosure(user: CurrentUser, id: string) {
  const db = await getDb();
  const row = await db.query.disclosures.findFirst({ where: and(eq(disclosures.id, id), eq(disclosures.isDeleted, false)) });
  if (!row) throw notFound("Disclosure");
  const sub = await getSubmission(user, row.submissionId);
  if (!(await canEditRecord(user, sub.ownerId))) throw forbiddenError();
  await db.update(disclosures).set({ isRevoked: true, revokedAt: new Date() }).where(eq(disclosures.id, id));
  await recordAudit(db, { entityType: "disclosure", entityId: id, action: "update", actorId: user.id, before: { isRevoked: false }, after: { isRevoked: true }, note: "Revoked; copies already delivered cannot be recalled." });
  await logActivity(db, { type: "system", subject: "Disclosure marked revoked (delivered copies cannot be recalled)", submissionId: sub.id, candidateId: sub.candidateId, actorId: user.id });
}

export async function defaultDisclosureFields(): Promise<string[]> {
  const s = await getSettings();
  return s.disclosure_default_fields;
}
