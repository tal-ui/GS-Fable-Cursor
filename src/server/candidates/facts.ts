import "server-only";
import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  candidateAvailability,
  candidateCompensation,
  candidateLanguages,
  candidateSkillClaims,
  candidateWorkAuthorizations,
  candidates,
  placements,
  skills,
} from "@/db/schema";
import type { CandidateFacts } from "@/lib/matching/types";

const toIso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * Loads matching facts for a set of candidates (or the whole active pool) in a handful of
 * batched queries. Merged and archived records are excluded so the pool stays clean.
 */
export async function loadCandidateFacts(candidateIds?: string[]): Promise<CandidateFacts[]> {
  const db = await getDb();
  const base: SQL[] = [eq(candidates.isDeleted, false), isNull(candidates.mergedIntoId)];
  if (candidateIds) {
    if (candidateIds.length === 0) return [];
    base.push(inArray(candidates.id, candidateIds));
  } else {
    base.push(inArray(candidates.status, ["new", "screening", "active", "placed"]));
  }
  const rows = await db.select().from(candidates).where(and(...base));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [claims, langs, auths, avail, comp, active] = await Promise.all([
    db
      .select({ claim: candidateSkillClaims, code: skills.code, name: skills.name })
      .from(candidateSkillClaims)
      .innerJoin(skills, eq(skills.id, candidateSkillClaims.skillId))
      .where(and(inArray(candidateSkillClaims.candidateId, ids), eq(candidateSkillClaims.isDeleted, false))),
    db.select().from(candidateLanguages).where(and(inArray(candidateLanguages.candidateId, ids), eq(candidateLanguages.isDeleted, false))),
    db.select().from(candidateWorkAuthorizations).where(and(inArray(candidateWorkAuthorizations.candidateId, ids), eq(candidateWorkAuthorizations.isDeleted, false))),
    db.select().from(candidateAvailability).where(and(inArray(candidateAvailability.candidateId, ids), eq(candidateAvailability.isCurrent, true), eq(candidateAvailability.isDeleted, false))),
    db.select().from(candidateCompensation).where(and(inArray(candidateCompensation.candidateId, ids), eq(candidateCompensation.isDeleted, false))),
    db
      .select({ candidateId: placements.candidateId, plannedStart: placements.plannedStart, plannedEnd: placements.plannedEnd, actualStart: placements.actualStart, actualEnd: placements.actualEnd })
      .from(placements)
      .where(and(inArray(placements.candidateId, ids), eq(placements.isDeleted, false), inArray(placements.status, ["reserved", "started", "active"]))),
  ]);

  const group = <T extends { candidateId: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const item of list) m.set(item.candidateId, [...(m.get(item.candidateId) ?? []), item]);
    return m;
  };
  const claimsBy = new Map<string, typeof claims>();
  for (const c of claims) claimsBy.set(c.claim.candidateId, [...(claimsBy.get(c.claim.candidateId) ?? []), c]);
  const langsBy = group(langs);
  const authsBy = group(auths);
  const availBy = group(avail);
  const compBy = group(comp);
  const activeBy = group(active);

  return rows.map((r) => {
    const a = availBy.get(r.id)?.[0] ?? null;
    return {
      id: r.id,
      name: `${r.firstName} ${r.lastName}`,
      status: r.status,
      country: r.country,
      citizenships: r.citizenships,
      preferredCountries: r.preferredCountries,
      willingToRelocate: r.willingToRelocate,
      yearsExperience: r.yearsExperience === null ? null : Number(r.yearsExperience),
      militaryRole: r.militaryRole,
      workAuthorizations: (authsBy.get(r.id) ?? []).map((w) => ({ country: w.country, type: w.type, verificationStatus: w.verificationStatus, validUntil: w.validUntil })),
      skillClaims: (claimsBy.get(r.id) ?? []).map(({ claim, code, name }) => ({
        skillId: claim.skillId,
        skillCode: code,
        skillName: name,
        declaredProficiency: claim.declaredProficiency,
        yearsExperience: claim.yearsExperience === null ? null : Number(claim.yearsExperience),
        verificationStatus: claim.verificationStatus,
        reviewedAt: toIso(claim.reviewedAt),
        expiresAt: claim.expiresAt,
      })),
      languages: (langsBy.get(r.id) ?? []).map((l) => ({ language: l.language, proficiency: l.proficiency, verificationStatus: l.verificationStatus })),
      availability: a
        ? {
            availableFrom: a.availableFrom,
            availableUntil: a.availableUntil,
            minDurationWeeks: a.minDurationWeeks,
            maxDurationWeeks: a.maxDurationWeeks,
            willingToRelocate: a.willingToRelocate,
            lastConfirmedAt: toIso(a.lastConfirmedAt),
          }
        : null,
      compensation: (compBy.get(r.id) ?? []).map((c) => ({ type: c.type, amount: Number(c.amount), currency: c.currency, period: c.period, grossNet: c.grossNet })),
      activePlacements: (activeBy.get(r.id) ?? []).map((p) => ({ start: p.actualStart ?? p.plannedStart, end: p.actualEnd ?? p.plannedEnd })),
    };
  });
}
