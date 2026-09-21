import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  activities,
  candidateAvailability,
  candidateCompensation,
  candidateLanguages,
  candidateMerges,
  candidateSkillClaims,
  candidateWorkAuthorizations,
  candidates,
  consents,
  documents,
  messages,
  placements,
  sourceEvents,
  submissions,
  tasks,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { logActivity } from "../activities";

type Candidate = typeof candidates.$inferSelect;

/**
 * Moves every child row from the merged record to the primary, fills empty primary fields,
 * preserves source attribution (original_candidate_id) and stores a full snapshot for undo.
 */
export async function mergeCandidateRecords(db: Database, input: { primary: Candidate; merged: Candidate; actorId: string; reason: string | null }): Promise<string> {
  const { primary, merged, actorId, reason } = input;
  return db.transaction(async (tx) => {
    const [claims, langs, auths, avail, comp, cons, docs, events, subs, msgs, taskRows, acts, plac] = await Promise.all([
      tx.select().from(candidateSkillClaims).where(eq(candidateSkillClaims.candidateId, merged.id)),
      tx.select().from(candidateLanguages).where(eq(candidateLanguages.candidateId, merged.id)),
      tx.select().from(candidateWorkAuthorizations).where(eq(candidateWorkAuthorizations.candidateId, merged.id)),
      tx.select().from(candidateAvailability).where(eq(candidateAvailability.candidateId, merged.id)),
      tx.select().from(candidateCompensation).where(eq(candidateCompensation.candidateId, merged.id)),
      tx.select().from(consents).where(eq(consents.candidateId, merged.id)),
      tx.select({ id: documents.id }).from(documents).where(eq(documents.candidateId, merged.id)),
      tx.select({ id: sourceEvents.id }).from(sourceEvents).where(eq(sourceEvents.candidateId, merged.id)),
      tx.select().from(submissions).where(eq(submissions.candidateId, merged.id)),
      tx.select({ id: messages.id }).from(messages).where(eq(messages.candidateId, merged.id)),
      tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.candidateId, merged.id)),
      tx.select({ id: activities.id }).from(activities).where(eq(activities.candidateId, merged.id)),
      tx.select({ id: placements.id }).from(placements).where(eq(placements.candidateId, merged.id)),
    ]);

    const snapshot = {
      merged,
      primaryBefore: primary,
      children: {
        skillClaims: claims.map((r) => r.id),
        languages: langs.map((r) => r.id),
        workAuthorizations: auths.map((r) => r.id),
        availability: avail.map((r) => r.id),
        compensation: comp.map((r) => r.id),
        consents: cons.map((r) => r.id),
        documents: docs.map((r) => r.id),
        sourceEvents: events.map((r) => r.id),
        submissions: subs.map((r) => r.id),
        messages: msgs.map((r) => r.id),
        tasks: taskRows.map((r) => r.id),
        activities: acts.map((r) => r.id),
        placements: plac.map((r) => r.id),
        deactivatedSkillClaims: [] as string[],
        deactivatedLanguages: [] as string[],
        deactivatedSubmissions: [] as string[],
        deactivatedAvailability: [] as string[],
      },
    };

    const primaryClaims = await tx.select().from(candidateSkillClaims).where(and(eq(candidateSkillClaims.candidateId, primary.id), eq(candidateSkillClaims.isDeleted, false)));
    const primarySkillIds = new Set(primaryClaims.map((c) => c.skillId));
    for (const claim of claims) {
      if (primarySkillIds.has(claim.skillId) && !claim.isDeleted) {
        await tx.update(candidateSkillClaims).set({ isDeleted: true }).where(eq(candidateSkillClaims.id, claim.id));
        snapshot.children.deactivatedSkillClaims.push(claim.id);
      }
    }
    await tx.update(candidateSkillClaims).set({ candidateId: primary.id }).where(eq(candidateSkillClaims.candidateId, merged.id));

    const primaryLangs = await tx.select().from(candidateLanguages).where(and(eq(candidateLanguages.candidateId, primary.id), eq(candidateLanguages.isDeleted, false)));
    const primaryLangCodes = new Set(primaryLangs.map((l) => l.language));
    for (const lang of langs) {
      if (primaryLangCodes.has(lang.language) && !lang.isDeleted) {
        await tx.update(candidateLanguages).set({ isDeleted: true }).where(eq(candidateLanguages.id, lang.id));
        snapshot.children.deactivatedLanguages.push(lang.id);
      }
    }
    await tx.update(candidateLanguages).set({ candidateId: primary.id }).where(eq(candidateLanguages.candidateId, merged.id));
    await tx.update(candidateWorkAuthorizations).set({ candidateId: primary.id }).where(eq(candidateWorkAuthorizations.candidateId, merged.id));

    const primaryHasCurrent = (await tx.select({ id: candidateAvailability.id }).from(candidateAvailability).where(and(eq(candidateAvailability.candidateId, primary.id), eq(candidateAvailability.isCurrent, true)))).length > 0;
    for (const a of avail) {
      if (a.isCurrent && primaryHasCurrent) {
        await tx.update(candidateAvailability).set({ isCurrent: false }).where(eq(candidateAvailability.id, a.id));
        snapshot.children.deactivatedAvailability.push(a.id);
      }
    }
    await tx.update(candidateAvailability).set({ candidateId: primary.id }).where(eq(candidateAvailability.candidateId, merged.id));
    await tx.update(candidateCompensation).set({ candidateId: primary.id }).where(eq(candidateCompensation.candidateId, merged.id));
    await tx.update(consents).set({ candidateId: primary.id }).where(eq(consents.candidateId, merged.id));
    await tx.update(documents).set({ candidateId: primary.id }).where(eq(documents.candidateId, merged.id));
    await tx.update(sourceEvents).set({ candidateId: primary.id, originalCandidateId: merged.id }).where(eq(sourceEvents.candidateId, merged.id));
    await tx.insert(sourceEvents).values({ candidateId: primary.id, sourceId: merged.primarySourceId, eventType: "merged", originalCandidateId: merged.id, details: { reason }, createdBy: actorId });

    const primarySubs = await tx.select().from(submissions).where(and(eq(submissions.candidateId, primary.id), eq(submissions.isDeleted, false)));
    const primaryReqIds = new Set(primarySubs.map((s) => s.requisitionId));
    for (const s of subs) {
      if (primaryReqIds.has(s.requisitionId) && !s.isDeleted) {
        await tx.update(submissions).set({ isDeleted: true }).where(eq(submissions.id, s.id));
        snapshot.children.deactivatedSubmissions.push(s.id);
      }
    }
    await tx.update(submissions).set({ candidateId: primary.id }).where(eq(submissions.candidateId, merged.id));
    await tx.update(placements).set({ candidateId: primary.id }).where(eq(placements.candidateId, merged.id));
    await tx.update(messages).set({ candidateId: primary.id }).where(eq(messages.candidateId, merged.id));
    await tx.update(tasks).set({ candidateId: primary.id }).where(eq(tasks.candidateId, merged.id));
    await tx.update(activities).set({ candidateId: primary.id }).where(eq(activities.candidateId, merged.id));

    const fill: Partial<typeof candidates.$inferInsert> = {};
    for (const key of ["email", "phone", "phoneNormalized", "city", "country", "dateOfBirth", "headline", "summary", "passportCountry", "passportExpiry", "militaryRole", "militaryUnit", "militaryRank", "yearsExperience", "relocationConstraints", "externalRef"] as const) {
      if ((primary[key] === null || primary[key] === undefined) && merged[key] !== null && merged[key] !== undefined) (fill as Record<string, unknown>)[key] = merged[key];
    }
    if (primary.willingToRelocate === null && merged.willingToRelocate !== null) fill.willingToRelocate = merged.willingToRelocate;
    fill.citizenships = Array.from(new Set([...primary.citizenships, ...merged.citizenships]));
    fill.preferredCountries = Array.from(new Set([...primary.preferredCountries, ...merged.preferredCountries]));
    await tx.update(candidates).set(fill).where(eq(candidates.id, primary.id));
    await tx.update(candidates).set({ mergedIntoId: primary.id, mergedAt: new Date(), status: "archived" }).where(eq(candidates.id, merged.id));

    const [mergeRow] = await tx
      .insert(candidateMerges)
      .values({ primaryCandidateId: primary.id, mergedCandidateId: merged.id, mergedById: actorId, reason, snapshot: snapshot as unknown as Record<string, unknown> })
      .returning();
    await recordAudit(tx, { entityType: "candidate", entityId: primary.id, action: "merge", actorId, before: { mergedCandidateId: merged.id }, after: fill as Record<string, unknown>, note: reason ?? undefined });
    await logActivity(tx, { type: "system", subject: `Merged duplicate ${merged.firstName} ${merged.lastName} into this record`, body: reason, candidateId: primary.id, actorId });
    return mergeRow!.id;
  });
}

/** Restores a merged record: child rows return to the merged candidate; primary keeps any filled fields. */
export async function undoMerge(db: Database, mergeId: string, actorId: string): Promise<void> {
  const row = await db.query.candidateMerges.findFirst({ where: and(eq(candidateMerges.id, mergeId), isNull(candidateMerges.undoneAt)) });
  if (!row) throw new AppError("not_found", "Merge record not found or already undone.");
  const snap = row.snapshot as { children: Record<string, string[]> };
  const c = snap.children;
  await db.transaction(async (tx) => {
    const move = async <T extends { id: unknown; candidateId: unknown }>(table: T & Parameters<typeof tx.update>[0], ids: string[]) => {
      for (const id of ids) await tx.update(table).set({ candidateId: row.mergedCandidateId } as Record<string, unknown>).where(eq(table.id as never, id));
    };
    await move(candidateSkillClaims, c.skillClaims ?? []);
    await move(candidateLanguages, c.languages ?? []);
    await move(candidateWorkAuthorizations, c.workAuthorizations ?? []);
    await move(candidateAvailability, c.availability ?? []);
    await move(candidateCompensation, c.compensation ?? []);
    await move(consents, c.consents ?? []);
    await move(documents, c.documents ?? []);
    await move(sourceEvents, c.sourceEvents ?? []);
    await move(submissions, c.submissions ?? []);
    await move(placements, c.placements ?? []);
    await move(messages, c.messages ?? []);
    await move(tasks, c.tasks ?? []);
    await move(activities, c.activities ?? []);
    for (const id of c.deactivatedSkillClaims ?? []) await tx.update(candidateSkillClaims).set({ isDeleted: false }).where(eq(candidateSkillClaims.id, id));
    for (const id of c.deactivatedLanguages ?? []) await tx.update(candidateLanguages).set({ isDeleted: false }).where(eq(candidateLanguages.id, id));
    for (const id of c.deactivatedSubmissions ?? []) await tx.update(submissions).set({ isDeleted: false }).where(eq(submissions.id, id));
    for (const id of c.deactivatedAvailability ?? []) await tx.update(candidateAvailability).set({ isCurrent: true }).where(eq(candidateAvailability.id, id));
    const mergedBefore = (row.snapshot as { merged: Candidate }).merged;
    await tx.update(candidates).set({ mergedIntoId: null, mergedAt: null, status: mergedBefore.status }).where(eq(candidates.id, row.mergedCandidateId));
    await tx.update(candidateMerges).set({ undoneAt: new Date(), undoneById: actorId }).where(eq(candidateMerges.id, mergeId));
    await recordAudit(tx, { entityType: "candidate", entityId: row.primaryCandidateId, action: "restore", actorId, note: `merge ${mergeId} undone` });
    await logActivity(tx, { type: "system", subject: "Merge undone; duplicate record restored", candidateId: row.primaryCandidateId, actorId });
  });
}
