"use server";

import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { uuid } from "@/lib/schemas/common";
import { accountOptions, contactsForAccount } from "@/server/accounts";
import { activeUsers, skillOptions } from "@/server/admin";
import { candidateOptions, findDuplicateCandidates } from "@/server/candidates/queries";
import { requisitionOptions } from "@/server/requisitions";
import { replacementCandidateOptions } from "@/server/pipeline/submissions";
import { globalSearch } from "@/server/search";
import { listTemplates } from "@/server/admin";

const q = z.object({ q: z.string().trim().max(120).default("") });

export const searchCandidatesAction = defineAction({ permission: "read", resource: "candidate", schema: q }, async ({ q }, user) => candidateOptions(user, q));
export const searchAccountsAction = defineAction({ permission: "read", resource: "account", schema: q }, async ({ q }, user) => accountOptions(user, q));
export const searchRequisitionsAction = defineAction({ permission: "read", resource: "requisition", schema: q }, async ({ q }, user) => requisitionOptions(user, q));
export const searchSkillsAction = defineAction({ permission: "read", resource: "skill", schema: q }, async ({ q }) => skillOptions(q));
export const listUsersOptionsAction = defineAction({ permission: "read", resource: "user", schema: z.object({}) }, async () => activeUsers());
export const contactsForAccountAction = defineAction({ permission: "read", resource: "contact", schema: z.object({ accountId: uuid }) }, async ({ accountId }) => contactsForAccount(accountId));
export const globalSearchAction = defineAction({ permission: "read", resource: "search", schema: q }, async ({ q }, user) => (q.length < 2 ? [] : globalSearch(user, q)));
export const approvedTemplatesAction = defineAction({ permission: "read", resource: "message_template", schema: z.object({}) }, async () => (await listTemplates()).filter((t) => t.status === "approved"));

export const replacementCandidatesAction = defineAction(
  { permission: "read", resource: "submission", schema: z.object({ requisitionId: uuid, excludeCandidateId: uuid.optional(), q: z.string().trim().max(120).default("") }) },
  async ({ requisitionId, excludeCandidateId, q }, user) => replacementCandidateOptions(user, requisitionId, excludeCandidateId ?? null, q),
);

export const checkDuplicatesAction = defineAction(
  { permission: "read", resource: "candidate", schema: z.object({ email: z.string().optional(), phone: z.string().optional(), country: z.string().optional(), firstName: z.string().optional(), lastName: z.string().optional(), excludeId: uuid.optional() }) },
  async (input, user) => findDuplicateCandidates(user, input),
);
