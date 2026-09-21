import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@/db/client";
import { candidates, interviews, requisitions, submissions } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { forbiddenError, notFound, validation } from "@/lib/errors";
import { fmtDateTime, parseAppDateTime } from "@/lib/format";
import { cleanText, sanitizeRichText } from "@/lib/sanitize";
import type { interviewOutcomeSchema, interviewSchema } from "@/lib/schemas/pipeline";
import { logActivity } from "../activities";
import { createTask } from "../tasks";
import { canEditRecord, visibilityScope } from "../scope";
import { changeStage, getSubmission } from "./submissions";

export async function scheduleInterview(user: CurrentUser, input: z.output<typeof interviewSchema>) {
  const db = await getDb();
  const sub = await getSubmission(user, input.submissionId);
  if (!(await canEditRecord(user, sub.ownerId))) throw forbiddenError();
  const scheduledAt = parseAppDateTime(input.scheduledAt);
  if (!scheduledAt) throw validation("Choose a valid date and time.");
  const values = {
    submissionId: input.submissionId,
    type: input.type,
    scheduledAt,
    durationMinutes: input.durationMinutes,
    interviewerId: input.interviewerId ?? (input.type === "customer_interview" ? null : user.id),
    customerContactId: input.customerContactId,
    location: cleanText(input.location),
    meetingLink: cleanText(input.meetingLink),
    notes: sanitizeRichText(input.notes),
    // Structured AI screening records disclosure to the candidate; this is shown before the session.
    aiDisclosureShownAt: input.type === "ai_chat_screening" ? new Date() : null,
  };
  const row = await db.transaction(async (tx) => {
    if (input.id) {
      const [updated] = await tx.update(interviews).set(values).where(and(eq(interviews.id, input.id), eq(interviews.submissionId, input.submissionId))).returning();
      if (!updated) throw notFound("Interview");
      return updated;
    }
    const [created] = await tx.insert(interviews).values({ ...values, createdBy: user.id }).returning();
    await logActivity(tx, { type: "meeting", subject: `${input.type.replace(/_/g, " ")} scheduled for ${fmtDateTime(scheduledAt)}`, submissionId: sub.id, candidateId: sub.candidateId, requisitionId: sub.requisitionId, actorId: user.id });
    await createTask(tx, {
      title: `Interview: ${input.type.replace(/_/g, " ")}`,
      description: `Record the outcome after the interview.`,
      type: "follow_up",
      priority: "medium",
      dueAt: new Date(scheduledAt.getTime() + input.durationMinutes * 60_000 + 3_600_000),
      ownerId: values.interviewerId ?? sub.ownerId ?? user.id,
      candidateId: sub.candidateId,
      requisitionId: sub.requisitionId,
      submissionId: sub.id,
      dedupeKey: `interview:${created!.id}`,
      createdBy: user.id,
    });
    return created!;
  });
  if (["interested", "screening"].includes(sub.stage)) {
    await changeStage(user, { submissionId: sub.id, toStage: "interviewing", reason: null, notes: null, plannedStart: null, plannedEnd: null, overrideReview: false });
  }
  return row;
}

export async function recordInterviewOutcome(user: CurrentUser, input: z.output<typeof interviewOutcomeSchema>) {
  const db = await getDb();
  const interview = await db.query.interviews.findFirst({ where: and(eq(interviews.id, input.id), eq(interviews.isDeleted, false)) });
  if (!interview) throw notFound("Interview");
  const sub = await getSubmission(user, interview.submissionId);
  if (!(await canEditRecord(user, sub.ownerId))) throw forbiddenError();
  const [row] = await db
    .update(interviews)
    .set({ status: input.status, outcome: input.status === "completed" ? input.outcome : "pending", summary: sanitizeRichText(input.summary), completedAt: input.status === "completed" ? new Date() : null })
    .where(eq(interviews.id, input.id))
    .returning();
  await logActivity(db, {
    type: "meeting",
    subject: `Interview ${input.status}${input.status === "completed" ? ` — outcome: ${input.outcome}` : ""}`,
    body: input.summary,
    submissionId: sub.id,
    candidateId: sub.candidateId,
    requisitionId: sub.requisitionId,
    actorId: user.id,
  });
  return row!;
}

/** Scheduled interviews the user can see, soonest first. */
export async function upcomingInterviews(user: CurrentUser, limit = 10) {
  const db = await getDb();
  const scope = await visibilityScope(user, submissions.ownerId, submissions.isDeleted);
  return db
    .select({
      interview: interviews,
      candidateId: submissions.candidateId,
      requisitionId: submissions.requisitionId,
      candidateName: sql<string>`${candidates.firstName} || ' ' || ${candidates.lastName}`,
      requisitionTitle: requisitions.title,
    })
    .from(interviews)
    .innerJoin(submissions, eq(submissions.id, interviews.submissionId))
    .innerJoin(candidates, eq(candidates.id, submissions.candidateId))
    .innerJoin(requisitions, eq(requisitions.id, submissions.requisitionId))
    .where(and(scope, eq(interviews.isDeleted, false), eq(interviews.status, "scheduled"), gte(interviews.scheduledAt, new Date(Date.now() - 3_600_000))))
    .orderBy(interviews.scheduledAt)
    .limit(limit);
}
