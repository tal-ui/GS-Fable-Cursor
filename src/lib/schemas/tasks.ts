import { z } from "zod";
import { optionalText, optionalUuid, priority, requiredText } from "./common";

export const taskStatus = z.enum(["open", "in_progress", "done", "cancelled"]);

export const manualTaskSchema = z.object({
  title: requiredText("Title", 200),
  description: optionalText(2000),
  priority: priority.default("medium"),
  dueAt: z
    .union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v ? new Date(v) : null)),
  ownerId: optionalUuid,
  candidateId: optionalUuid,
  accountId: optionalUuid,
  requisitionId: optionalUuid,
  submissionId: optionalUuid,
  placementId: optionalUuid,
});
