"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { optionalUuid, uuid } from "@/lib/schemas/common";
import { softDeleteDocument, uploadDocument } from "@/server/documents/service";
import { MAX_LINK_FILES, MAX_LINK_HOURS, createUploadLink, listUploadLinks, revokeUploadLink } from "@/server/documents/upload-links";
import { validation } from "@/lib/errors";

const documentKind = z.enum(["cv", "passport", "id_document", "certificate", "license", "contract", "photo", "transcript", "other"]);

const uploadSchema = z.object({
  kind: documentKind,
  candidateId: optionalUuid,
  accountId: optionalUuid,
  submissionId: optionalUuid,
  placementId: optionalUuid,
  replacesDocumentId: optionalUuid,
});

/**
 * File uploads arrive as FormData; the wrapped action validates the metadata while the
 * document service validates the binary (type, magic bytes, size, scan).
 */
export async function uploadDocumentAction(formData: FormData) {
  const file = formData.get("file");
  const meta = {
    kind: formData.get("kind"),
    candidateId: formData.get("candidateId"),
    accountId: formData.get("accountId"),
    submissionId: formData.get("submissionId"),
    placementId: formData.get("placementId"),
    replacesDocumentId: formData.get("replacesDocumentId"),
  };
  return uploadWithMeta({ ...Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, typeof v === "string" ? v : undefined])), file } as never);
}

const uploadWithMeta = defineAction({ permission: "write", resource: "document", schema: uploadSchema.extend({ file: z.custom<File>((v) => v instanceof File, "Choose a file") }) }, async (input, user) => {
  if (!input.candidateId && !input.accountId && !input.submissionId && !input.placementId) throw validation("A document must be attached to a record.");
  const doc = await uploadDocument(user, input);
  if (input.candidateId) revalidatePath(`/candidates/${input.candidateId}`);
  if (input.accountId) revalidatePath(`/accounts/${input.accountId}`);
  if (input.placementId) revalidatePath(`/placements/${input.placementId}`);
  return { id: doc.id, filename: doc.filename, extractionQueued: doc.kind === "cv" };
});

export const deleteDocumentAction = defineAction({ permission: "write", resource: "document", schema: z.object({ id: uuid, candidateId: optionalUuid }) }, async ({ id, candidateId }, user) => {
  await softDeleteDocument(user, id);
  if (candidateId) revalidatePath(`/candidates/${candidateId}`);
});

const requestableKind = z.enum(["passport", "id_document", "certificate", "license", "photo", "transcript", "other"]);

export const createUploadLinkAction = defineAction(
  {
    permission: "write",
    resource: "upload_link",
    schema: z.object({
      candidateId: uuid,
      kinds: z.array(requestableKind).min(1, "Choose at least one document type"),
      expiresInHours: z.coerce.number().int().min(1).max(MAX_LINK_HOURS),
      maxFiles: z.coerce.number().int().min(1).max(MAX_LINK_FILES),
      purpose: z.string().trim().max(200).optional().nullable(),
    }),
  },
  async (input, user) => {
    const link = await createUploadLink(user, input);
    revalidatePath(`/candidates/${input.candidateId}`);
    return link;
  },
);

export const revokeUploadLinkAction = defineAction({ permission: "write", resource: "upload_link", schema: z.object({ id: uuid, candidateId: uuid }) }, async ({ id, candidateId }, user) => {
  await revokeUploadLink(user, id);
  revalidatePath(`/candidates/${candidateId}`);
});

export const listUploadLinksAction = defineAction({ permission: "read", resource: "upload_link", schema: z.object({ candidateId: uuid }) }, async ({ candidateId }, user) => listUploadLinks(user, candidateId));
