"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { optionalUuid, uuid } from "@/lib/schemas/common";
import {
  bulkCreateSubmissionsSchema,
  confirmInterestSchema,
  createSubmissionSchema,
  disclosureSchema,
  interviewOutcomeSchema,
  interviewSchema,
  matchFeedbackSchema,
  placementCancelSchema,
  placementChecklistSchema,
  placementCompleteSchema,
  placementExtendSchema,
  placementReplaceSchema,
  placementStartSchema,
  placementUpdateSchema,
  stageChangeSchema,
} from "@/lib/schemas/pipeline";
import { recordMatchFeedback } from "@/server/matching";
import { queueTemplateMessage } from "@/server/messaging/outreach";
import { discloseCandidate, revokeDisclosure } from "@/server/pipeline/disclosures";
import { recordInterviewOutcome, scheduleInterview } from "@/server/pipeline/interviews";
import * as placements from "@/server/pipeline/placements";
import * as submissions from "@/server/pipeline/submissions";
import { getSubmission } from "@/server/pipeline/submissions";

function touchSubmission(id: string, requisitionId?: string | null, candidateId?: string | null) {
  revalidatePath("/submissions");
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/work-queue");
  if (requisitionId) {
    revalidatePath(`/requisitions/${requisitionId}`);
    revalidatePath(`/requisitions/${requisitionId}/match`);
  }
  if (candidateId) revalidatePath(`/candidates/${candidateId}`);
}

function touchPlacement(id: string, requisitionId?: string | null, candidateId?: string | null, submissionId?: string | null) {
  revalidatePath("/placements");
  revalidatePath(`/placements/${id}`);
  revalidatePath("/requisitions");
  revalidatePath("/dashboard");
  if (requisitionId) revalidatePath(`/requisitions/${requisitionId}`);
  if (candidateId) revalidatePath(`/candidates/${candidateId}`);
  if (submissionId) revalidatePath(`/submissions/${submissionId}`);
}

export const createSubmissionAction = defineAction({ permission: "write", resource: "submission", schema: createSubmissionSchema }, async (input, user) => {
  const id = await submissions.createSubmission(user, input);
  touchSubmission(id, input.requisitionId, input.candidateId);
  return { id };
});

export const bulkCreateSubmissionsAction = defineAction({ permission: "bulk", resource: "submission", schema: bulkCreateSubmissionsSchema }, async (input, user) => {
  const result = await submissions.bulkCreateSubmissions(user, input.requisitionId, input.candidateIds);
  revalidatePath("/submissions");
  revalidatePath(`/requisitions/${input.requisitionId}`);
  revalidatePath(`/requisitions/${input.requisitionId}/match`);
  return result;
});

export const changeStageAction = defineAction({ permission: "write", resource: "submission", schema: stageChangeSchema }, async (input, user) => {
  const result = await submissions.changeStage(user, input);
  touchSubmission(input.submissionId, result.requisitionId, result.candidateId);
  if (result.placementId) revalidatePath("/placements");
  return { stage: result.stage, placementId: result.placementId };
});

export const confirmInterestAction = defineAction({ permission: "write", resource: "submission", schema: confirmInterestSchema }, async (input, user) => {
  await submissions.confirmInterest(user, input);
  const sub = await getSubmission(user, input.submissionId);
  touchSubmission(input.submissionId, sub.requisitionId, sub.candidateId);
});

export const reassignSubmissionAction = defineAction({ permission: "write", resource: "submission", schema: z.object({ id: uuid, ownerId: optionalUuid }) }, async ({ id, ownerId }, user) => {
  const row = await submissions.reassignSubmission(user, id, ownerId);
  touchSubmission(id, row.requisitionId, row.candidateId);
});

export const deleteSubmissionAction = defineAction({ permission: "write", resource: "submission", schema: z.object({ id: uuid }) }, async ({ id }, user) => {
  await submissions.softDeleteSubmission(user, id);
  revalidatePath("/submissions");
});

export const scheduleInterviewAction = defineAction({ permission: "write", resource: "interview", schema: interviewSchema }, async (input, user) => {
  const row = await scheduleInterview(user, input);
  const sub = await getSubmission(user, input.submissionId);
  touchSubmission(input.submissionId, sub.requisitionId, sub.candidateId);
  return { id: row.id };
});

export const interviewOutcomeAction = defineAction({ permission: "write", resource: "interview", schema: interviewOutcomeSchema }, async (input, user) => {
  const row = await recordInterviewOutcome(user, input);
  touchSubmission(row.submissionId);
  return { id: row.id };
});

export const discloseCandidateAction = defineAction({ permission: "write", resource: "disclosure", schema: disclosureSchema }, async (input, user) => {
  const result = await discloseCandidate(user, input);
  const sub = await getSubmission(user, input.submissionId);
  touchSubmission(input.submissionId, sub.requisitionId, sub.candidateId);
  revalidatePath("/accounts");
  return result;
});

export const revokeDisclosureAction = defineAction({ permission: "write", resource: "disclosure", schema: z.object({ id: uuid, submissionId: uuid }) }, async ({ id, submissionId }, user) => {
  await revokeDisclosure(user, id);
  touchSubmission(submissionId);
});

export const matchFeedbackAction = defineAction({ permission: "write", resource: "match_feedback", schema: matchFeedbackSchema }, async (input, user) => {
  const row = await recordMatchFeedback(user, input);
  revalidatePath(`/requisitions/${input.requisitionId}/match`);
  return { id: row.id };
});

export const sendOutreachAction = defineAction(
  { permission: "write", resource: "message", schema: z.object({ candidateId: uuid, submissionId: optionalUuid, templateId: uuid, preferredChannel: z.enum(["whatsapp", "email"]).default("whatsapp"), variables: z.record(z.string(), z.string()).default({}) }) },
  async (input, user) => {
    const result = await queueTemplateMessage({
      candidateId: input.candidateId,
      submissionId: input.submissionId,
      templateId: input.templateId,
      variables: input.variables,
      actorId: user.id,
      preferredChannel: input.preferredChannel,
      sendKey: `manual:${input.templateId}:${input.candidateId}:${input.submissionId ?? "none"}:${Date.now()}`,
    });
    revalidatePath(`/candidates/${input.candidateId}`);
    if (input.submissionId) revalidatePath(`/submissions/${input.submissionId}`);
    return result;
  },
);

export const updatePlacementAction = defineAction({ permission: "write", resource: "placement", schema: placementUpdateSchema }, async (input, user) => {
  const row = await placements.updatePlacement(user, input);
  touchPlacement(row.id, row.requisitionId, row.candidateId, row.submissionId);
  return { id: row.id };
});

export const startPlacementAction = defineAction({ permission: "write", resource: "placement", schema: placementStartSchema }, async (input, user) => {
  const row = await placements.startPlacement(user, input);
  touchPlacement(row.id, row.requisitionId, row.candidateId, row.submissionId);
  return { status: row.status };
});

export const activatePlacementAction = defineAction({ permission: "write", resource: "placement", schema: z.object({ id: uuid }) }, async ({ id }, user) => {
  const row = await placements.activatePlacement(user, id);
  touchPlacement(row.id, row.requisitionId, row.candidateId, row.submissionId);
  return { status: row.status };
});

export const completePlacementAction = defineAction({ permission: "write", resource: "placement", schema: placementCompleteSchema }, async (input, user) => {
  const row = await placements.completePlacement(user, input);
  touchPlacement(row.id, row.requisitionId, row.candidateId, row.submissionId);
  revalidatePath("/work-queue");
  return { status: row.status };
});

export const extendPlacementAction = defineAction({ permission: "write", resource: "placement", schema: placementExtendSchema }, async (input, user) => {
  const row = await placements.extendPlacement(user, input);
  touchPlacement(row.id, row.requisitionId, row.candidateId, row.submissionId);
  return { status: row.status };
});

export const cancelPlacementAction = defineAction({ permission: "write", resource: "placement", schema: placementCancelSchema }, async (input, user) => {
  const row = await placements.cancelPlacement(user, input);
  touchPlacement(row.id, row.requisitionId, row.candidateId, row.submissionId);
  revalidatePath("/work-queue");
  return { status: row.status };
});

export const replacePlacementAction = defineAction({ permission: "write", resource: "placement", schema: placementReplaceSchema }, async (input, user) => {
  const newId = await placements.replacePlacement(user, input);
  const row = await placements.getPlacement(user, newId);
  touchPlacement(input.id, row.requisitionId, row.candidateId, row.submissionId);
  touchPlacement(newId);
  return { id: newId };
});

export const placementChecklistAction = defineAction({ permission: "write", resource: "placement", schema: placementChecklistSchema }, async (input, user) => {
  const row = await placements.togglePlacementChecklist(user, input);
  revalidatePath(`/placements/${row.id}`);
  return { checklist: row.checklist };
});
