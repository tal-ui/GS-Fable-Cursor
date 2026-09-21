"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { uuid } from "@/lib/schemas/common";
import { accountPatchSchema, accountSchema, activityNoteSchema, contactSchema, sourceSchema } from "@/lib/schemas/crm";
import { requirementsVersionSchema, requisitionPatchSchema, requisitionSchema, requisitionStatusSchema } from "@/lib/schemas/requisitions";
import * as accounts from "@/server/accounts";
import * as requisitions from "@/server/requisitions";
import { archiveSource, upsertSource } from "@/server/sources";
import { logActivity } from "@/server/activities";
import { getDb } from "@/db/client";

export const createAccountAction = defineAction({ permission: "write", resource: "account", schema: accountSchema }, async (input, user) => {
  const row = await accounts.createAccount(user, input);
  revalidatePath("/accounts");
  return { id: row.id };
});

export const updateAccountAction = defineAction({ permission: "write", resource: "account", schema: accountPatchSchema }, async (input, user) => {
  const row = await accounts.updateAccount(user, input);
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${input.id}`);
  return { id: row.id };
});

export const deleteAccountAction = defineAction({ permission: "write", resource: "account", schema: z.object({ id: uuid }) }, async ({ id }, user) => {
  await accounts.softDeleteAccount(user, id);
  revalidatePath("/accounts");
});

export const upsertContactAction = defineAction({ permission: "write", resource: "contact", schema: contactSchema }, async (input, user) => {
  const row = await accounts.upsertContact(user, input);
  revalidatePath(`/accounts/${input.accountId}`);
  return { id: row.id };
});

export const removeContactAction = defineAction({ permission: "write", resource: "contact", schema: z.object({ id: uuid, accountId: uuid }) }, async ({ id, accountId }, user) => {
  await accounts.removeContact(user, id);
  revalidatePath(`/accounts/${accountId}`);
});

export const createRequisitionAction = defineAction({ permission: "write", resource: "requisition", schema: requisitionSchema }, async (input, user) => {
  const id = await requisitions.createRequisition(user, input);
  revalidatePath("/requisitions");
  revalidatePath(`/accounts/${input.accountId}`);
  return { id };
});

export const updateRequisitionAction = defineAction({ permission: "write", resource: "requisition", schema: requisitionPatchSchema }, async (input, user) => {
  const row = await requisitions.updateRequisition(user, input);
  revalidatePath("/requisitions");
  revalidatePath(`/requisitions/${input.id}`);
  return { id: row.id };
});

export const changeRequisitionStatusAction = defineAction({ permission: "write", resource: "requisition", schema: requisitionStatusSchema }, async (input, user) => {
  const row = await requisitions.changeRequisitionStatus(user, input);
  revalidatePath("/requisitions");
  revalidatePath(`/requisitions/${input.id}`);
  revalidatePath("/dashboard");
  return { status: row.status };
});

export const saveRequirementsAction = defineAction({ permission: "write", resource: "requisition_requirements", schema: requirementsVersionSchema }, async (input, user) => {
  const version = await requisitions.saveRequirementsVersion(user, input);
  revalidatePath(`/requisitions/${input.requisitionId}`);
  revalidatePath(`/requisitions/${input.requisitionId}/match`);
  return { version };
});

export const upsertSourceAction = defineAction({ permission: "write", resource: "source", schema: sourceSchema }, async (input, user) => {
  const row = await upsertSource(user, input);
  revalidatePath("/sources");
  return { id: row.id };
});

export const archiveSourceAction = defineAction({ permission: "admin", resource: "source", schema: z.object({ id: uuid }) }, async ({ id }, user) => {
  await archiveSource(user, id);
  revalidatePath("/sources");
});

export const addActivityAction = defineAction({ permission: "write", resource: "activity", schema: activityNoteSchema }, async (input, user) => {
  const db = await getDb();
  const row = await logActivity(db, { ...input, actorId: user.id });
  if (input.candidateId) revalidatePath(`/candidates/${input.candidateId}`);
  if (input.accountId) revalidatePath(`/accounts/${input.accountId}`);
  if (input.requisitionId) revalidatePath(`/requisitions/${input.requisitionId}`);
  if (input.submissionId) revalidatePath(`/submissions/${input.submissionId}`);
  if (input.placementId) revalidatePath(`/placements/${input.placementId}`);
  return { id: row.id };
});
