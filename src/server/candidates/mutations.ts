import "server-only";
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  candidateAvailability,
  candidateCompensation,
  candidateLanguages,
  candidateSkillClaims,
  candidateWorkAuthorizations,
  candidates,
  consents,
  skills,
  sourceEvents,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { AppError, conflict, forbiddenError, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { can } from "@/lib/auth/authorize";
import { cleanText, normalizeEmail, normalizePhone } from "@/lib/sanitize";
import type {
  availabilitySchema,
  candidatePatchSchema,
  compensationSchema,
  consentSchema,
  extractionDecisionSchema,
  intakeSchema,
  languageSchema,
  reviewClaimSchema,
  reviewWorkAuthSchema,
  skillClaimSchema,
  workAuthorizationSchema,
} from "@/lib/schemas/candidates";
import { logActivity } from "../activities";
import { emitEvent } from "../automations";
import { assertCandidateArchivable } from "../archive";
import { canEditRecord } from "../scope";
import { findDuplicateCandidates, getCandidate } from "./queries";

type Intake = z.output<typeof intakeSchema>;

async function ensureEditable(user: CurrentUser, candidateId: string) {
  const candidate = await getCandidate(user, candidateId);
  if (!(await canEditRecord(user, candidate.ownerId))) throw forbiddenError();
  return candidate;
}

export type IntakeResult = { candidateId: string } | { duplicates: Awaited<ReturnType<typeof findDuplicateCandidates>> };

/** Guided intake: duplicate check, record + source event + consents + availability + compensation in one transaction. */
export async function createCandidate(user: CurrentUser, input: Intake): Promise<IntakeResult> {
  const db = await getDb();
  if (!input.forceCreate) {
    const duplicates = await findDuplicateCandidates(user, input);
    if (duplicates.length > 0) return { duplicates };
  }
  const now = new Date();
  const candidateId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(candidates)
      .values({
        firstName: cleanText(input.firstName)!,
        lastName: cleanText(input.lastName)!,
        email: normalizeEmail(input.email),
        phone: input.phone,
        phoneNormalized: normalizePhone(input.phone, input.country),
        city: input.city,
        country: input.country,
        dateOfBirth: input.dateOfBirth,
        headline: input.headline,
        summary: input.summary,
        status: input.status,
        ownerId: input.ownerId ?? user.id,
        primarySourceId: input.primarySourceId,
        citizenships: input.citizenships,
        passportCountry: input.passportCountry,
        passportExpiry: input.passportExpiry,
        militaryRole: input.militaryRole,
        militaryUnit: input.militaryUnit,
        militaryRank: input.militaryRank,
        militaryServiceStart: input.militaryServiceStart,
        militaryServiceEnd: input.militaryServiceEnd,
        yearsExperience: input.yearsExperience?.toString() ?? null,
        willingToRelocate: input.willingToRelocate,
        relocationConstraints: input.relocationConstraints,
        preferredCountries: input.preferredCountries,
        externalRef: input.externalRef,
        createdBy: user.id,
      })
      .returning();
    const id = created!.id;
    await tx.insert(sourceEvents).values({
      candidateId: id,
      sourceId: input.primarySourceId,
      eventType: input.referrerName ? "referred" : "applied",
      occurredAt: now,
      referrerName: input.referrerName,
      createdBy: user.id,
    });
    await tx.insert(consents).values({
      candidateId: id,
      scope: "process_profile",
      noticeVersion: input.noticeVersion,
      grantedAt: now,
      channel: input.consentChannel,
      evidence: "Recorded at intake",
      recordedById: user.id,
      createdBy: user.id,
    });
    if (input.communicationConsent) {
      await tx.insert(consents).values({
        candidateId: id,
        scope: "communicate",
        noticeVersion: input.noticeVersion,
        grantedAt: now,
        channel: input.consentChannel,
        evidence: "Recorded at intake",
        recordedById: user.id,
        createdBy: user.id,
      });
    }
    if (input.availableFrom) {
      await tx.insert(candidateAvailability).values({
        candidateId: id,
        availableFrom: input.availableFrom,
        availableUntil: input.availableUntil,
        minDurationWeeks: input.minDurationWeeks,
        maxDurationWeeks: input.maxDurationWeeks,
        rotationPreference: input.rotationPreference,
        willingToRelocate: input.willingToRelocate ?? true,
        relocationConstraints: input.relocationConstraints,
        lastConfirmedAt: now,
        confirmedById: user.id,
        confirmationChannel: "intake",
        isCurrent: true,
        createdBy: user.id,
      });
    }
    if (input.expectedAmount !== null && input.expectedCurrency && input.expectedPeriod) {
      await tx.insert(candidateCompensation).values({
        candidateId: id,
        type: "expected",
        amount: input.expectedAmount.toString(),
        currency: input.expectedCurrency,
        period: input.expectedPeriod,
        grossNet: input.expectedGrossNet,
        effectiveDate: now.toISOString().slice(0, 10),
        createdBy: user.id,
      });
    }
    await logActivity(tx, { type: "system", subject: "Candidate created via guided intake", candidateId: id, actorId: user.id });
    await recordAudit(tx, { entityType: "candidate", entityId: id, action: "create", actorId: user.id, after: created as unknown as Record<string, unknown> });
    return id;
  });
  await emitEvent({
    trigger: "candidate_created",
    entityType: "candidate",
    entityId: candidateId,
    eventKey: "created",
    payload: { status: input.status, hasCommunicationConsent: input.communicationConsent },
    actorId: user.id,
    context: { ownerId: input.ownerId ?? user.id, candidateId, label: `${input.firstName} ${input.lastName}` },
  });
  return { candidateId };
}

export async function updateCandidate(user: CurrentUser, input: z.output<typeof candidatePatchSchema>) {
  const db = await getDb();
  const before = await ensureEditable(user, input.id);
  const { id, ...patch } = input;
  const values: Partial<typeof candidates.$inferInsert> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    (values as Record<string, unknown>)[k] = v;
  }
  if (values.firstName !== undefined) values.firstName = cleanText(values.firstName) ?? before.firstName;
  if (values.lastName !== undefined) values.lastName = cleanText(values.lastName) ?? before.lastName;
  if (values.email !== undefined) values.email = normalizeEmail(values.email);
  if (values.phone !== undefined || values.country !== undefined) values.phoneNormalized = normalizePhone(values.phone ?? before.phone, values.country ?? before.country);
  if ("yearsExperience" in patch && patch.yearsExperience !== undefined) values.yearsExperience = patch.yearsExperience === null ? null : String(patch.yearsExperience);
  if (Object.keys(values).length === 0) return before;
  const [after] = await db.update(candidates).set(values).where(eq(candidates.id, id)).returning();
  await recordAudit(db, { entityType: "candidate", entityId: id, action: "update", actorId: user.id, before: before as unknown as Record<string, unknown>, after: values as Record<string, unknown> });
  if (values.status && values.status !== before.status) {
    await logActivity(db, { type: "status_change", subject: `Status changed ${before.status} → ${values.status}`, candidateId: id, actorId: user.id });
  }
  return after!;
}

export async function softDeleteCandidate(user: CurrentUser, id: string) {
  const db = await getDb();
  const before = await ensureEditable(user, id);
  await assertCandidateArchivable(id);
  await db.update(candidates).set({ isDeleted: true }).where(eq(candidates.id, id));
  await recordAudit(db, { entityType: "candidate", entityId: id, action: "delete", actorId: user.id, before: before as unknown as Record<string, unknown> });
}

export async function upsertSkillClaim(user: CurrentUser, input: z.output<typeof skillClaimSchema>) {
  const db = await getDb();
  await ensureEditable(user, input.candidateId);
  const skill = await db.query.skills.findFirst({ where: and(eq(skills.id, input.skillId), eq(skills.isDeleted, false)) });
  if (!skill) throw notFound("Skill");
  const values = {
    candidateId: input.candidateId,
    skillId: input.skillId,
    originalWording: input.originalWording,
    declaredProficiency: input.declaredProficiency,
    yearsExperience: input.yearsExperience?.toString() ?? null,
    lastUsedYear: input.lastUsedYear,
    evidenceNotes: input.evidenceNotes,
    evidenceDocumentId: input.evidenceDocumentId,
    expiresAt: input.expiresAt,
  };
  if (input.id) {
    const existing = await db.query.candidateSkillClaims.findFirst({ where: eq(candidateSkillClaims.id, input.id) });
    if (!existing) throw notFound("Skill claim");
    const changedEvidence = existing.evidenceDocumentId !== input.evidenceDocumentId;
    const [row] = await db
      .update(candidateSkillClaims)
      .set({ ...values, verificationStatus: changedEvidence && existing.verificationStatus === "verified" ? "pending_review" : existing.verificationStatus })
      .where(eq(candidateSkillClaims.id, input.id))
      .returning();
    return row!;
  }
  const existing = await db.query.candidateSkillClaims.findFirst({
    where: and(eq(candidateSkillClaims.candidateId, input.candidateId), eq(candidateSkillClaims.skillId, input.skillId), eq(candidateSkillClaims.isDeleted, false)),
  });
  if (existing) throw conflict(`${skill.name} is already on this profile.`);
  const [row] = await db
    .insert(candidateSkillClaims)
    .values({ ...values, origin: "recruiter_entered", verificationStatus: input.evidenceDocumentId ? "pending_review" : "unverified", createdBy: user.id })
    .returning();
  return row!;
}

export async function removeSkillClaim(user: CurrentUser, claimId: string) {
  const db = await getDb();
  const claim = await db.query.candidateSkillClaims.findFirst({ where: eq(candidateSkillClaims.id, claimId) });
  if (!claim) throw notFound("Skill claim");
  await ensureEditable(user, claim.candidateId);
  await db.update(candidateSkillClaims).set({ isDeleted: true }).where(eq(candidateSkillClaims.id, claimId));
}

/** Only designated reviewers may change verification status. Every decision is audited. */
export async function reviewSkillClaim(user: CurrentUser, input: z.output<typeof reviewClaimSchema>) {
  if (!can(user, "verify")) throw forbiddenError();
  const db = await getDb();
  const claim = await db.query.candidateSkillClaims.findFirst({ where: eq(candidateSkillClaims.id, input.claimId) });
  if (!claim) throw notFound("Skill claim");
  await getCandidate(user, claim.candidateId);
  if (input.decision === "verified" && !input.evidenceDocumentId && !claim.evidenceDocumentId && !input.evidenceNotes) {
    throw new AppError("validation", "Verification requires evidence: attach a document or describe the evidence reviewed.");
  }
  const skill = await db.query.skills.findFirst({ where: eq(skills.id, claim.skillId) });
  let expiresAt = input.expiresAt ?? claim.expiresAt;
  if (input.decision === "verified" && !expiresAt && skill?.defaultValidityMonths) {
    const d = new Date();
    d.setMonth(d.getMonth() + skill.defaultValidityMonths);
    expiresAt = d.toISOString().slice(0, 10);
  }
  const [after] = await db
    .update(candidateSkillClaims)
    .set({
      verificationStatus: input.decision,
      evidenceDocumentId: input.evidenceDocumentId ?? claim.evidenceDocumentId,
      evidenceNotes: input.evidenceNotes ?? claim.evidenceNotes,
      reviewerId: user.id,
      reviewedAt: new Date(),
      expiresAt,
    })
    .where(eq(candidateSkillClaims.id, claim.id))
    .returning();
  await recordAudit(db, { entityType: "skill_claim", entityId: claim.id, action: "verify", actorId: user.id, before: claim as unknown as Record<string, unknown>, after: after as unknown as Record<string, unknown> });
  await logActivity(db, { type: "system", subject: `${skill?.name ?? "Skill"} claim marked ${input.decision.replace("_", " ")}`, body: input.evidenceNotes, candidateId: claim.candidateId, actorId: user.id });
  await emitEvent({
    trigger: "verification_changed",
    entityType: "skill_claim",
    entityId: claim.id,
    eventKey: `${input.decision}:${after!.reviewedAt?.toISOString() ?? ""}`,
    payload: { decision: input.decision, skill: skill?.name },
    actorId: user.id,
    context: { candidateId: claim.candidateId, label: skill?.name },
  });
  return after!;
}

export async function upsertLanguage(user: CurrentUser, input: z.output<typeof languageSchema>) {
  const db = await getDb();
  await ensureEditable(user, input.candidateId);
  if (input.id) {
    const [row] = await db.update(candidateLanguages).set({ proficiency: input.proficiency, language: input.language }).where(eq(candidateLanguages.id, input.id)).returning();
    return row!;
  }
  const existing = await db.query.candidateLanguages.findFirst({ where: and(eq(candidateLanguages.candidateId, input.candidateId), eq(candidateLanguages.language, input.language), eq(candidateLanguages.isDeleted, false)) });
  if (existing) {
    const [row] = await db.update(candidateLanguages).set({ proficiency: input.proficiency }).where(eq(candidateLanguages.id, existing.id)).returning();
    return row!;
  }
  const [row] = await db.insert(candidateLanguages).values({ candidateId: input.candidateId, language: input.language, proficiency: input.proficiency, createdBy: user.id }).returning();
  return row!;
}

export async function removeLanguage(user: CurrentUser, id: string) {
  const db = await getDb();
  const row = await db.query.candidateLanguages.findFirst({ where: eq(candidateLanguages.id, id) });
  if (!row) throw notFound("Language");
  await ensureEditable(user, row.candidateId);
  await db.update(candidateLanguages).set({ isDeleted: true }).where(eq(candidateLanguages.id, id));
}

export async function upsertWorkAuthorization(user: CurrentUser, input: z.output<typeof workAuthorizationSchema>) {
  const db = await getDb();
  await ensureEditable(user, input.candidateId);
  const values = {
    candidateId: input.candidateId,
    country: input.country,
    type: input.type,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    evidenceDocumentId: input.evidenceDocumentId,
    notes: input.notes,
  };
  if (input.id) {
    const [row] = await db.update(candidateWorkAuthorizations).set({ ...values, verificationStatus: input.evidenceDocumentId ? "pending_review" : "unverified", reviewerId: null, reviewedAt: null }).where(eq(candidateWorkAuthorizations.id, input.id)).returning();
    return row!;
  }
  const [row] = await db.insert(candidateWorkAuthorizations).values({ ...values, verificationStatus: input.evidenceDocumentId ? "pending_review" : "unverified", createdBy: user.id }).returning();
  return row!;
}

export async function reviewWorkAuthorization(user: CurrentUser, input: z.output<typeof reviewWorkAuthSchema>) {
  if (!can(user, "verify")) throw forbiddenError();
  const db = await getDb();
  const before = await db.query.candidateWorkAuthorizations.findFirst({ where: eq(candidateWorkAuthorizations.id, input.id) });
  if (!before) throw notFound("Work authorisation");
  await getCandidate(user, before.candidateId);
  if (input.decision === "verified" && !input.evidenceDocumentId && !before.evidenceDocumentId && !input.notes) {
    throw new AppError("validation", "Verification requires evidence: attach a document or describe what was reviewed.");
  }
  const [after] = await db
    .update(candidateWorkAuthorizations)
    .set({ verificationStatus: input.decision, evidenceDocumentId: input.evidenceDocumentId ?? before.evidenceDocumentId, notes: input.notes ?? before.notes, reviewerId: user.id, reviewedAt: new Date() })
    .where(eq(candidateWorkAuthorizations.id, input.id))
    .returning();
  await recordAudit(db, { entityType: "work_authorization", entityId: input.id, action: "verify", actorId: user.id, before: before as unknown as Record<string, unknown>, after: after as unknown as Record<string, unknown> });
  await logActivity(db, { type: "system", subject: `Work authorisation ${before.country} marked ${input.decision.replace("_", " ")}`, candidateId: before.candidateId, actorId: user.id });
  return after!;
}

export async function removeWorkAuthorization(user: CurrentUser, id: string) {
  const db = await getDb();
  const row = await db.query.candidateWorkAuthorizations.findFirst({ where: eq(candidateWorkAuthorizations.id, id) });
  if (!row) throw notFound("Work authorisation");
  await ensureEditable(user, row.candidateId);
  await db.update(candidateWorkAuthorizations).set({ isDeleted: true }).where(eq(candidateWorkAuthorizations.id, id));
}

export async function setAvailability(user: CurrentUser, input: z.output<typeof availabilitySchema>) {
  const db = await getDb();
  await ensureEditable(user, input.candidateId);
  if (input.availableUntil && input.availableUntil < input.availableFrom) throw new AppError("validation", "End of availability must be after its start.", { availableUntil: "Must be after the start date" });
  return db.transaction(async (tx) => {
    await tx.update(candidateAvailability).set({ isCurrent: false }).where(and(eq(candidateAvailability.candidateId, input.candidateId), eq(candidateAvailability.isCurrent, true)));
    const [row] = await tx
      .insert(candidateAvailability)
      .values({
        candidateId: input.candidateId,
        availableFrom: input.availableFrom,
        availableUntil: input.availableUntil,
        minDurationWeeks: input.minDurationWeeks,
        maxDurationWeeks: input.maxDurationWeeks,
        rotationPreference: input.rotationPreference,
        willingToRelocate: input.willingToRelocate,
        relocationConstraints: input.relocationConstraints,
        lastConfirmedAt: input.confirmedNow ? new Date() : null,
        confirmedById: input.confirmedNow ? user.id : null,
        confirmationChannel: input.confirmedNow ? (input.confirmationChannel ?? "recruiter") : null,
        isCurrent: true,
        notes: input.notes,
        createdBy: user.id,
      })
      .returning();
    await tx.update(candidates).set({ willingToRelocate: input.willingToRelocate, relocationConstraints: input.relocationConstraints ?? undefined }).where(eq(candidates.id, input.candidateId));
    await logActivity(tx, { type: "system", subject: `Availability updated: from ${input.availableFrom}${input.availableUntil ? ` to ${input.availableUntil}` : ""}`, candidateId: input.candidateId, actorId: user.id });
    return row!;
  });
}

export async function confirmAvailability(user: CurrentUser, candidateId: string, channel: string) {
  const db = await getDb();
  await ensureEditable(user, candidateId);
  const current = await db.query.candidateAvailability.findFirst({ where: and(eq(candidateAvailability.candidateId, candidateId), eq(candidateAvailability.isCurrent, true), eq(candidateAvailability.isDeleted, false)) });
  if (!current) throw new AppError("validation", "Record an availability period before confirming it.");
  const [row] = await db.update(candidateAvailability).set({ lastConfirmedAt: new Date(), confirmedById: user.id, confirmationChannel: channel }).where(eq(candidateAvailability.id, current.id)).returning();
  await logActivity(db, { type: "system", subject: `Availability reconfirmed via ${channel}`, candidateId, actorId: user.id });
  return row!;
}

export async function upsertCompensation(user: CurrentUser, input: z.output<typeof compensationSchema>) {
  const db = await getDb();
  await ensureEditable(user, input.candidateId);
  const values = { candidateId: input.candidateId, type: input.type, amount: input.amount.toString(), currency: input.currency, period: input.period, grossNet: input.grossNet, effectiveDate: input.effectiveDate, notes: input.notes };
  if (input.id) {
    const [row] = await db.update(candidateCompensation).set(values).where(eq(candidateCompensation.id, input.id)).returning();
    return row!;
  }
  const existing = await db.query.candidateCompensation.findFirst({ where: and(eq(candidateCompensation.candidateId, input.candidateId), eq(candidateCompensation.type, input.type), eq(candidateCompensation.isDeleted, false)) });
  if (existing) {
    const [row] = await db.update(candidateCompensation).set(values).where(eq(candidateCompensation.id, existing.id)).returning();
    return row!;
  }
  const [row] = await db.insert(candidateCompensation).values({ ...values, createdBy: user.id }).returning();
  return row!;
}

export async function removeCompensation(user: CurrentUser, id: string) {
  const db = await getDb();
  const row = await db.query.candidateCompensation.findFirst({ where: eq(candidateCompensation.id, id) });
  if (!row) throw notFound("Compensation");
  await ensureEditable(user, row.candidateId);
  await db.update(candidateCompensation).set({ isDeleted: true }).where(eq(candidateCompensation.id, id));
}

export async function grantConsent(user: CurrentUser, input: z.output<typeof consentSchema>) {
  const db = await getDb();
  await ensureEditable(user, input.candidateId);
  if (input.scope === "share_with_customer" && !input.accountId) throw new AppError("validation", "Choose the customer this sharing permission applies to.", { accountId: "Required for customer sharing" });
  const [row] = await db
    .insert(consents)
    .values({
      candidateId: input.candidateId,
      scope: input.scope,
      accountId: input.scope === "share_with_customer" ? input.accountId : null,
      noticeVersion: input.noticeVersion,
      grantedAt: new Date(),
      channel: input.channel,
      evidence: input.evidence,
      evidenceDocumentId: input.evidenceDocumentId,
      recordedById: user.id,
      createdBy: user.id,
    })
    .returning();
  await recordAudit(db, { entityType: "consent", entityId: row!.id, action: "create", actorId: user.id, after: row as unknown as Record<string, unknown> });
  await logActivity(db, { type: "system", subject: `Permission recorded: ${input.scope.replace(/_/g, " ")}`, candidateId: input.candidateId, actorId: user.id });
  return row!;
}

export async function withdrawConsent(user: CurrentUser, consentId: string, reason: string | null) {
  const db = await getDb();
  const before = await db.query.consents.findFirst({ where: eq(consents.id, consentId) });
  if (!before) throw notFound("Permission record");
  await ensureEditable(user, before.candidateId);
  if (before.withdrawnAt) return before;
  const [after] = await db.update(consents).set({ withdrawnAt: new Date(), withdrawnById: user.id, evidence: reason ? `${before.evidence ?? ""}\nWithdrawn: ${reason}`.trim() : before.evidence }).where(eq(consents.id, consentId)).returning();
  await recordAudit(db, { entityType: "consent", entityId: consentId, action: "update", actorId: user.id, before: before as unknown as Record<string, unknown>, after: after as unknown as Record<string, unknown>, note: "withdrawn" });
  await logActivity(db, { type: "system", subject: `Permission withdrawn: ${before.scope.replace(/_/g, " ")}`, body: reason, candidateId: before.candidateId, actorId: user.id });
  if (before.scope === "process_profile") {
    await db.update(candidates).set({ status: "withdrawn" }).where(eq(candidates.id, before.candidateId));
  }
  return after!;
}

export async function applyExtractionDecision(user: CurrentUser, input: z.output<typeof extractionDecisionSchema>) {
  const db = await getDb();
  const candidate = await ensureEditable(user, input.candidateId);
  const list = [...(candidate.extractionSuggestions ?? [])];
  const suggestion = list[input.index];
  if (!suggestion) throw notFound("Suggestion");
  list[input.index] = { ...suggestion, accepted: input.accept };
  await db.update(candidates).set({ extractionSuggestions: list, extractionReviewedAt: list.every((s) => s.accepted !== null && s.accepted !== undefined) ? new Date() : null }).where(eq(candidates.id, candidate.id));
  if (!input.accept) return { applied: false };

  const v = suggestion.value as Record<string, unknown> | string | number;
  switch (suggestion.field) {
    case "email":
      await db.update(candidates).set({ email: normalizeEmail(String(v)) }).where(eq(candidates.id, candidate.id));
      break;
    case "phone":
      await db.update(candidates).set({ phone: String(v), phoneNormalized: normalizePhone(String(v), candidate.country) }).where(eq(candidates.id, candidate.id));
      break;
    case "firstName":
      await db.update(candidates).set({ firstName: cleanText(String(v)) ?? candidate.firstName }).where(eq(candidates.id, candidate.id));
      break;
    case "lastName":
      await db.update(candidates).set({ lastName: cleanText(String(v)) ?? candidate.lastName }).where(eq(candidates.id, candidate.id));
      break;
    case "yearsExperience":
      await db.update(candidates).set({ yearsExperience: String(Number(v)) }).where(eq(candidates.id, candidate.id));
      break;
    case "militaryRole":
      await db.update(candidates).set({ militaryRole: cleanText(String(v)) }).where(eq(candidates.id, candidate.id));
      break;
    case "citizenship": {
      const set = new Set([...candidate.citizenships, String(v).toUpperCase()]);
      await db.update(candidates).set({ citizenships: Array.from(set) }).where(eq(candidates.id, candidate.id));
      break;
    }
    case "language": {
      const lv = v as { language: string; proficiency: string };
      await upsertLanguage(user, { id: null, candidateId: candidate.id, language: lv.language, proficiency: lv.proficiency as "basic" });
      break;
    }
    case "skill": {
      const sv = v as { skillId: string; originalWording?: string; proficiency?: string };
      const exists = await db.query.candidateSkillClaims.findFirst({ where: and(eq(candidateSkillClaims.candidateId, candidate.id), eq(candidateSkillClaims.skillId, sv.skillId), eq(candidateSkillClaims.isDeleted, false)) });
      if (!exists) {
        await db.insert(candidateSkillClaims).values({
          candidateId: candidate.id,
          skillId: sv.skillId,
          originalWording: sv.originalWording ?? null,
          declaredProficiency: (sv.proficiency as "basic") ?? "intermediate",
          origin: "ai_extracted",
          aiConfidence: suggestion.confidence.toFixed(3),
          createdBy: user.id,
        });
      }
      break;
    }
  }
  await recordAudit(db, { entityType: "candidate", entityId: candidate.id, action: "update", actorId: user.id, after: { acceptedSuggestion: suggestion.field, value: suggestion.value }, note: "extraction suggestion accepted" });
  return { applied: true };
}

/** Merges `mergedId` into `primaryId`, moving child rows and keeping a recoverable snapshot. */
export async function mergeCandidates(user: CurrentUser, primaryId: string, mergedId: string, reason: string | null) {
  if (primaryId === mergedId) throw new AppError("validation", "Choose two different candidates to merge.");
  const db = await getDb();
  const primary = await ensureEditable(user, primaryId);
  const merged = await ensureEditable(user, mergedId);
  if (merged.mergedIntoId) throw conflict("That candidate has already been merged.");
  const { mergeCandidateRecords } = await import("./merge");
  const mergeId = await mergeCandidateRecords(db, { primary, merged, actorId: user.id, reason });
  await emitEvent({ trigger: "candidate_created", entityType: "candidate", entityId: primaryId, eventKey: `merged:${mergedId}`, payload: { merged: true }, actorId: user.id, context: { candidateId: primaryId, ownerId: primary.ownerId } });
  return mergeId;
}

export { isNull, ne };
