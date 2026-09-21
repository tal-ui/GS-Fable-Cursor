"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { optionalUuid, uuid } from "@/lib/schemas/common";
import * as imports from "@/server/imports";

const previewSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  csvText: z.string().min(1, "Choose a CSV file").max(5_000_000, "The file is too large (5 MB max)"),
  sourceId: optionalUuid,
  mapping: z.record(z.string(), z.string()).optional(),
});

export const previewImportAction = defineAction({ permission: "bulk", resource: "import", schema: previewSchema }, async (input, user) => {
  const batch = await imports.previewImport(user, input);
  revalidatePath("/imports");
  return { id: batch.id };
});

export const updateDuplicateDecisionsAction = defineAction(
  { permission: "bulk", resource: "import", schema: z.object({ batchId: uuid, decisions: z.array(z.object({ row: z.number().int().nonnegative(), decision: z.enum(["merge", "create", "skip"]) })) }) },
  async ({ batchId, decisions }, user) => {
    await imports.updateDuplicateDecisions(user, batchId, decisions);
    revalidatePath(`/imports/${batchId}`);
  },
);

export const startImportAction = defineAction({ permission: "bulk", resource: "import", schema: z.object({ batchId: uuid }) }, async ({ batchId }, user) => {
  await imports.startImport(user, batchId);
  revalidatePath("/imports");
  revalidatePath(`/imports/${batchId}`);
});

export const rollbackImportAction = defineAction({ permission: "bulk", resource: "import", schema: z.object({ batchId: uuid }) }, async ({ batchId }, user) => {
  await imports.rollbackImport(user, batchId);
  revalidatePath("/imports");
  revalidatePath(`/imports/${batchId}`);
  revalidatePath("/candidates");
});
