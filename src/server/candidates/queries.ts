import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  accounts,
  candidateAvailability,
  candidateCompensation,
  candidateLanguages,
  candidateMerges,
  candidateSkillClaims,
  candidateWorkAuthorizations,
  candidates,
  consents,
  documents,
  placements,
  requisitions,
  skills,
  sourceEvents,
  sources,
  submissions,
  tasks,
  uploadLinks,
  users,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { notFound } from "@/lib/errors";
import { normalizeEmail, normalizePhone } from "@/lib/sanitize";
import { paginate, type ListParams } from "../list";
import { visibilityScope } from "../scope";
import { listActivitiesFor } from "../activities";
import { recentMessagesFor } from "../messaging/outreach";
import { getSettings } from "../settings";

const SORTABLE = {
  name: candidates.lastName,
  status: candidates.status,
  createdAt: candidates.createdAt,
  updatedAt: candidates.updatedAt,
  country: candidates.country,
  yearsExperience: candidates.yearsExperience,
} as const;

export async function listCandidates(user: CurrentUser, params: ListParams) {
  const db = await getDb();
  const scope = await visibilityScope(user, candidates.ownerId, candidates.isDeleted);
  const where: SQL[] = [scope, isNull(candidates.mergedIntoId)];
  const f = params.filters;
  if (f.status) where.push(inArray(candidates.status, f.status.split(",") as (typeof candidates.$inferSelect.status)[]));
  if (f.owner) where.push(f.owner === "unassigned" ? isNull(candidates.ownerId) : eq(candidates.ownerId, f.owner));
  if (f.source) where.push(eq(candidates.primarySourceId, f.source));
  if (f.country) where.push(eq(candidates.country, f.country.toUpperCase()));
  if (f.citizenship) where.push(sql`${f.citizenship.toUpperCase()} = any(${candidates.citizenships})`);
  if (f.skill) {
    where.push(sql`exists (select 1 from ${candidateSkillClaims} k where k.candidate_id = ${candidates.id} and k.skill_id = ${f.skill} and k.is_deleted = false)`);
  }
  if (f.verified === "true") {
    where.push(sql`exists (select 1 from ${candidateSkillClaims} k where k.candidate_id = ${candidates.id} and k.verification_status = 'verified' and k.is_deleted = false)`);
  }
  if (f.availableBy) {
    where.push(sql`exists (select 1 from ${candidateAvailability} a where a.candidate_id = ${candidates.id} and a.is_current = true and a.is_deleted = false and a.available_from <= ${f.availableBy})`);
  }
  if (f.relocate === "true") where.push(eq(candidates.willingToRelocate, true));
  if (f.importBatch) {
    where.push(sql`exists (select 1 from ${sourceEvents} e where e.candidate_id = ${candidates.id} and e.import_batch_id = ${f.importBatch} and e.is_deleted = false)`);
  }
  if (params.q) {
    const q = `%${params.q}%`;
    where.push(
      or(
        ilike(candidates.firstName, q),
        ilike(candidates.lastName, q),
        sql`(${candidates.firstName} || ' ' || ${candidates.lastName}) ilike ${q}`,
        ilike(candidates.email, q),
        ilike(candidates.phone, q),
        ilike(candidates.headline, q),
        ilike(candidates.militaryRole, q),
        ilike(candidates.city, q),
        sql`exists (select 1 from ${candidateSkillClaims} k join ${skills} s on s.id = k.skill_id where k.candidate_id = ${candidates.id} and k.is_deleted = false and s.name ilike ${q})`,
      )!,
    );
  }
  const sortCol = SORTABLE[(params.sort as keyof typeof SORTABLE) ?? "updatedAt"] ?? candidates.updatedAt;
  const order = params.dir === "asc" ? asc(sortCol) : desc(sortCol);
  const settings = await getSettings();
  const staleCutoff = new Date(Date.now() - settings.availability_freshness_days * 86_400_000);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        phone: candidates.phone,
        headline: candidates.headline,
        status: candidates.status,
        country: candidates.country,
        city: candidates.city,
        citizenships: candidates.citizenships,
        yearsExperience: candidates.yearsExperience,
        militaryRole: candidates.militaryRole,
        ownerId: candidates.ownerId,
        ownerName: users.name,
        sourceName: sources.name,
        createdAt: candidates.createdAt,
        updatedAt: candidates.updatedAt,
        skillCount: sql<number>`(select count(*)::int from ${candidateSkillClaims} k where k.candidate_id = ${candidates.id} and k.is_deleted = false)`,
        verifiedCount: sql<number>`(select count(*)::int from ${candidateSkillClaims} k where k.candidate_id = ${candidates.id} and k.is_deleted = false and k.verification_status = 'verified')`,
        availableFrom: sql<string | null>`(select a.available_from from ${candidateAvailability} a where a.candidate_id = ${candidates.id} and a.is_current = true and a.is_deleted = false order by a.created_at desc limit 1)`,
        availabilityStale: sql<boolean>`coalesce((select a.last_confirmed_at is null or a.last_confirmed_at < ${staleCutoff} from ${candidateAvailability} a where a.candidate_id = ${candidates.id} and a.is_current = true and a.is_deleted = false order by a.created_at desc limit 1), true)`,
        openSubmissions: sql<number>`(select count(*)::int from ${submissions} s where s.candidate_id = ${candidates.id} and s.is_deleted = false and s.stage not in ('placed','declined_by_candidate','rejected_by_customer','withdrawn','not_eligible'))`,
        pendingSuggestions: sql<number>`coalesce((select count(*)::int from jsonb_array_elements(coalesce(${candidates.extractionSuggestions}, '[]'::jsonb)) e where e->>'accepted' is null), 0)`,
      })
      .from(candidates)
      .leftJoin(users, eq(users.id, candidates.ownerId))
      .leftJoin(sources, eq(sources.id, candidates.primarySourceId))
      .where(and(...where))
      .orderBy(order, asc(candidates.firstName))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ total: count() }).from(candidates).where(and(...where)),
  ]);
  return paginate(rows, total, params);
}

export type CandidateListRow = Awaited<ReturnType<typeof listCandidates>>["rows"][number];

/**
 * Erased profiles are soft-deleted so they leave lists, search and matching, but their submissions,
 * placements and the erasure register still link here. Only the read path asks for them; every
 * mutation goes through the default and gets "not found".
 */
export async function getCandidate(user: CurrentUser, id: string, options: { includeErased?: boolean } = {}) {
  const db = await getDb();
  const scope = await visibilityScope(user, candidates.ownerId, candidates.isDeleted, options.includeErased ? { alsoWhen: isNotNull(candidates.anonymizedAt) } : undefined);
  const row = await db.query.candidates.findFirst({ where: and(eq(candidates.id, id), scope) });
  if (!row) throw notFound("Candidate");
  return row;
}

export async function getCandidateDetail(user: CurrentUser, id: string) {
  const db = await getDb();
  const candidate = await getCandidate(user, id, { includeErased: true });
  const [
    owner,
    source,
    skillClaims,
    languages,
    workAuths,
    availability,
    compensation,
    consentRows,
    docs,
    subs,
    placementRows,
    sourceEventRows,
    openTasks,
    merges,
    activities,
    messages,
    uploadLinkRows,
  ] = await Promise.all([
    candidate.ownerId ? db.query.users.findFirst({ where: eq(users.id, candidate.ownerId), columns: { id: true, name: true, email: true, avatarUrl: true } }) : null,
    candidate.primarySourceId ? db.query.sources.findFirst({ where: eq(sources.id, candidate.primarySourceId) }) : null,
    db
      .select({ claim: candidateSkillClaims, skillName: skills.name, skillCode: skills.code, reviewerName: users.name, evidenceFilename: documents.filename })
      .from(candidateSkillClaims)
      .innerJoin(skills, eq(skills.id, candidateSkillClaims.skillId))
      .leftJoin(users, eq(users.id, candidateSkillClaims.reviewerId))
      .leftJoin(documents, eq(documents.id, candidateSkillClaims.evidenceDocumentId))
      .where(and(eq(candidateSkillClaims.candidateId, id), eq(candidateSkillClaims.isDeleted, false)))
      .orderBy(asc(skills.name)),
    db.select().from(candidateLanguages).where(and(eq(candidateLanguages.candidateId, id), eq(candidateLanguages.isDeleted, false))).orderBy(asc(candidateLanguages.language)),
    db
      .select({ auth: candidateWorkAuthorizations, reviewerName: users.name })
      .from(candidateWorkAuthorizations)
      .leftJoin(users, eq(users.id, candidateWorkAuthorizations.reviewerId))
      .where(and(eq(candidateWorkAuthorizations.candidateId, id), eq(candidateWorkAuthorizations.isDeleted, false)))
      .orderBy(asc(candidateWorkAuthorizations.country)),
    db.select().from(candidateAvailability).where(and(eq(candidateAvailability.candidateId, id), eq(candidateAvailability.isDeleted, false))).orderBy(desc(candidateAvailability.isCurrent), desc(candidateAvailability.createdAt)),
    db.select().from(candidateCompensation).where(and(eq(candidateCompensation.candidateId, id), eq(candidateCompensation.isDeleted, false))).orderBy(asc(candidateCompensation.type)),
    db
      .select({ consent: consents, accountName: accounts.name, recordedByName: users.name })
      .from(consents)
      .leftJoin(accounts, eq(accounts.id, consents.accountId))
      .leftJoin(users, eq(users.id, consents.recordedById))
      .where(and(eq(consents.candidateId, id), eq(consents.isDeleted, false)))
      .orderBy(desc(consents.grantedAt)),
    db.select().from(documents).where(and(eq(documents.candidateId, id), eq(documents.isDeleted, false))).orderBy(desc(documents.createdAt)),
    db
      .select({ submission: submissions, requisitionTitle: requisitions.title, accountName: accounts.name, accountId: accounts.id, ownerName: users.name })
      .from(submissions)
      .innerJoin(requisitions, eq(requisitions.id, submissions.requisitionId))
      .innerJoin(accounts, eq(accounts.id, requisitions.accountId))
      .leftJoin(users, eq(users.id, submissions.ownerId))
      .where(and(eq(submissions.candidateId, id), eq(submissions.isDeleted, false)))
      .orderBy(desc(submissions.updatedAt)),
    db
      .select({ placement: placements, requisitionTitle: requisitions.title, accountName: accounts.name })
      .from(placements)
      .innerJoin(requisitions, eq(requisitions.id, placements.requisitionId))
      .innerJoin(accounts, eq(accounts.id, placements.accountId))
      .where(and(eq(placements.candidateId, id), eq(placements.isDeleted, false)))
      .orderBy(desc(placements.plannedStart)),
    db
      .select({ event: sourceEvents, sourceName: sources.name })
      .from(sourceEvents)
      .leftJoin(sources, eq(sources.id, sourceEvents.sourceId))
      .where(and(eq(sourceEvents.candidateId, id), eq(sourceEvents.isDeleted, false)))
      .orderBy(desc(sourceEvents.occurredAt)),
    db.select().from(tasks).where(and(eq(tasks.candidateId, id), eq(tasks.isDeleted, false), inArray(tasks.status, ["open", "in_progress"]))).orderBy(asc(tasks.dueAt)),
    db.select().from(candidateMerges).where(or(eq(candidateMerges.primaryCandidateId, id), eq(candidateMerges.mergedCandidateId, id))).orderBy(desc(candidateMerges.createdAt)),
    listActivitiesFor({ candidateId: id }),
    recentMessagesFor(id),
    db
      .select({ link: uploadLinks, createdByName: users.name })
      .from(uploadLinks)
      .leftJoin(users, eq(users.id, uploadLinks.createdBy))
      .where(and(eq(uploadLinks.candidateId, id), eq(uploadLinks.isDeleted, false)))
      .orderBy(desc(uploadLinks.createdAt))
      .limit(10),
  ]);
  const now = Date.now();
  const uploadLinkSummaries = uploadLinkRows.map(({ link, createdByName }) => ({
    id: link.id,
    kinds: link.kinds,
    purpose: link.purpose,
    maxFiles: link.maxFiles,
    usedCount: link.usedCount,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    lastUsedAt: link.lastUsedAt,
    createdAt: link.createdAt,
    createdByName,
    state: (link.revokedAt ? "revoked" : link.expiresAt.getTime() <= now ? "expired" : link.usedCount >= link.maxFiles ? "used_up" : "active") as "active" | "expired" | "revoked" | "used_up",
  }));
  return {
    candidate,
    owner: owner ?? null,
    source: source ?? null,
    skillClaims,
    languages,
    workAuths,
    availability,
    compensation,
    consents: consentRows,
    documents: docs,
    submissions: subs,
    placements: placementRows,
    sourceEvents: sourceEventRows,
    openTasks,
    merges,
    activities,
    messages,
    uploadLinks: uploadLinkSummaries,
  };
}

export type CandidateDetail = Awaited<ReturnType<typeof getCandidateDetail>>;

/** Duplicate detection: exact email, normalised phone, or same surname + first initial (never name alone as a merge). */
export async function findDuplicateCandidates(
  user: CurrentUser,
  input: { email?: string | null; phone?: string | null; country?: string | null; firstName?: string | null; lastName?: string | null; excludeId?: string | null },
) {
  const db = await getDb();
  const scope = await visibilityScope(user, candidates.ownerId, candidates.isDeleted);
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone, input.country);
  const conditions: SQL[] = [];
  if (email) conditions.push(eq(candidates.email, email));
  if (phone) conditions.push(eq(candidates.phoneNormalized, phone));
  if (input.lastName && input.firstName) {
    conditions.push(and(ilike(candidates.lastName, input.lastName.trim()), ilike(candidates.firstName, `${input.firstName.trim().charAt(0)}%`))!);
  }
  if (conditions.length === 0) return [];
  const rows = await db
    .select({ id: candidates.id, firstName: candidates.firstName, lastName: candidates.lastName, email: candidates.email, phone: candidates.phone, phoneNormalized: candidates.phoneNormalized, status: candidates.status, createdAt: candidates.createdAt, headline: candidates.headline })
    .from(candidates)
    .where(and(scope, isNull(candidates.mergedIntoId), or(...conditions), input.excludeId ? sql`${candidates.id} <> ${input.excludeId}` : undefined))
    .limit(10);
  return rows.map((r) => ({
    ...r,
    matchedOn: [
      email && r.email === email ? "email" : null,
      phone && r.phoneNormalized === phone ? "phone" : null,
      input.lastName && r.lastName.toLowerCase() === input.lastName.trim().toLowerCase() ? "name" : null,
    ].filter((x): x is string => Boolean(x)),
  }));
}

export async function candidateOptions(user: CurrentUser, q: string, limit = 10) {
  const db = await getDb();
  const scope = await visibilityScope(user, candidates.ownerId, candidates.isDeleted);
  const like = `%${q}%`;
  return db
    .select({ id: candidates.id, label: sql<string>`${candidates.firstName} || ' ' || ${candidates.lastName}`, sub: candidates.headline })
    .from(candidates)
    .where(and(scope, isNull(candidates.mergedIntoId), or(ilike(candidates.firstName, like), ilike(candidates.lastName, like), sql`(${candidates.firstName} || ' ' || ${candidates.lastName}) ilike ${like}`)))
    .orderBy(asc(candidates.lastName))
    .limit(limit);
}

export { lte };
