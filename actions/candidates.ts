"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { uuid } from "@/lib/schemas/common";
import {
  availabilitySchema,
  candidatePatchSchema,
  compensationSchema,
  confirmAvailabilitySchema,
  consentSchema,
  extractionDecisionSchema,
  intakeSchema,
  languageSchema,
  mergeSchema,
  reviewClaimSchema,
  reviewWorkAuthSchema,
  skillClaimSchema,
  withdrawConsentSchema,
  workAuthorizationSchema,
} from "@/lib/schemas/candidates";
import * as m from "@/server/candidates/mutations";
import { undoMerge } from "@/server/candidates/merge";
import { getDb } from "@/db/client";
import { recomputeForCandidate } from "@/server/matching";

function touched(candidateId?: string) {
  revalidatePath("/candidates");
  revalidatePath("/dashboard");
  if (candidateId) revalidatePath(`/candidates/${candidateId}`);
}

export const createCandidateAction = defineAction({ permission: "write", resource: "candidate", schema: intakeSchema }, async (input, user) => {
  const result = await m.createCandidate(user, input);
  touched();
  return result;
});

export const updateCandidateAction = defineAction({ permission: "write", resource: "candidate", schema: candidatePatchSchema }, async (input, user) => {
  const row = await m.updateCandidate(user, input);
  touched(input.id);
  await recomputeForCandidate(await getDb(), input.id);
  return { id: row.id };
});

export const deleteCandidateAction = defineAction({ permission: "write", resource: "candidate", schema: z.object({ id: uuid }) }, async ({ id }, user) => {
  await m.softDeleteCandidate(user, id);
  touched();
});

export const upsertSkillClaimAction = defineAction({ permission: "write", resource: "skill_claim", schema: skillClaimSchema }, async (input, user) => {
  const row = await m.upsertSkillClaim(user, input);
  touched(input.candidateId);
  await recomputeForCandidate(await getDb(), input.candidateId);
  return { id: row.id };
});

export const removeSkillClaimAction = defineAction({ permission: "write", resource: "skill_claim", schema: z.object({ id: uuid, candidateId: uuid }) }, async ({ id, candidateId }, user) => {
  await m.removeSkillClaim(user, id);
  touched(candidateId);
  await recomputeForCandidate(await getDb(), candidateId);
});

export const reviewSkillClaimAction = defineAction({ permission: "verify", resource: "skill_claim", schema: reviewClaimSchema }, async (input, user) => {
  const row = await m.reviewSkillClaim(user, input);
  touched(row.candidateId);
  await recomputeForCandidate(await getDb(), row.candidateId);
  return { id: row.id, status: row.verificationStatus };
});

export const upsertLanguageAction = defineAction({ permission: "write", resource: "candidate", schema: languageSchema }, async (input, user) => {
  const row = await m.upsertLanguage(user, input);
  touched(input.candidateId);
  return { id: row.id };
});

export const removeLanguageAction = defineAction({ permission: "write", resource: "candidate", schema: z.object({ id: uuid, candidateId: uuid }) }, async ({ id, candidateId }, user) => {
  await m.removeLanguage(user, id);
  touched(candidateId);
});

export const upsertWorkAuthorizationAction = defineAction({ permission: "write", resource: "work_authorization", schema: workAuthorizationSchema }, async (input, user) => {
  const row = await m.upsertWorkAuthorization(user, input);
  touched(input.candidateId);
  await recomputeForCandidate(await getDb(), input.candidateId);
  return { id: row.id };
});

export const reviewWorkAuthorizationAction = defineAction({ permission: "verify", resource: "work_authorization", schema: reviewWorkAuthSchema }, async (input, user) => {
  const row = await m.reviewWorkAuthorization(user, input);
  touched(row.candidateId);
  await recomputeForCandidate(await getDb(), row.candidateId);
  return { id: row.id };
});

export const removeWorkAuthorizationAction = defineAction({ permission: "write", resource: "work_authorization", schema: z.object({ id: uuid, candidateId: uuid }) }, async ({ id, candidateId }, user) => {
  await m.removeWorkAuthorization(user, id);
  touched(candidateId);
});

export const setAvailabilityAction = defineAction({ permission: "write", resource: "availability", schema: availabilitySchema }, async (input, user) => {
  const row = await m.setAvailability(user, input);
  touched(input.candidateId);
  await recomputeForCandidate(await getDb(), input.candidateId);
  return { id: row.id };
});

export const confirmAvailabilityAction = defineAction({ permission: "write", resource: "availability", schema: confirmAvailabilitySchema }, async (input, user) => {
  await m.confirmAvailability(user, input.candidateId, input.channel);
  touched(input.candidateId);
  await recomputeForCandidate(await getDb(), input.candidateId);
});

export const upsertCompensationAction = defineAction({ permission: "write", resource: "compensation", schema: compensationSchema }, async (input, user) => {
  const row = await m.upsertCompensation(user, input);
  touched(input.candidateId);
  return { id: row.id };
});

export const removeCompensationAction = defineAction({ permission: "write", resource: "compensation", schema: z.object({ id: uuid, candidateId: uuid }) }, async ({ id, candidateId }, user) => {
  await m.removeCompensation(user, id);
  touched(candidateId);
});

export const grantConsentAction = defineAction({ permission: "write", resource: "consent", schema: consentSchema }, async (input, user) => {
  const row = await m.grantConsent(user, input);
  touched(input.candidateId);
  revalidatePath("/submissions");
  return { id: row.id };
});

export const withdrawConsentAction = defineAction({ permission: "write", resource: "consent", schema: withdrawConsentSchema }, async (input, user) => {
  const row = await m.withdrawConsent(user, input.consentId, input.reason);
  touched(row.candidateId);
  revalidatePath("/submissions");
});

export const extractionDecisionAction = defineAction({ permission: "write", resource: "candidate", schema: extractionDecisionSchema }, async (input, user) => {
  await m.applyExtractionDecision(user, input);
  touched(input.candidateId);
});

export const mergeCandidatesAction = defineAction({ permission: "write", resource: "candidate_merge", schema: mergeSchema }, async (input, user) => {
  const id = await m.mergeCandidates(user, input.primaryId, input.mergedId, input.reason);
  touched(input.primaryId);
  return { mergeId: id };
});

export const undoMergeAction = defineAction({ permission: "write", resource: "candidate_merge", schema: z.object({ mergeId: uuid, candidateId: uuid }) }, async ({ mergeId, candidateId }, user) => {
  await undoMerge(await getDb(), mergeId, user.id);
  touched(candidateId);
});
