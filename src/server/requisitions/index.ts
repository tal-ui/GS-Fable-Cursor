import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { getDb, type DbOrTx } from "@/db/client";
import {
  accounts,
  candidates,
  contacts,
  placements,
  requisitionRequirements,
  requisitionVersions,
  requisitions,
  roleFamilies,
  skills,
  submissions,
  users,
  type RequirementSnapshot,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { AppError, forbiddenError, notFound, validation } from "@/lib/errors";
import { validateRequirements } from "@/lib/matching/engine";
import type { Requirement } from "@/lib/matching/types";
import { cleanText, sanitizeRichText } from "@/lib/sanitize";
import type { requirementsVersionSchema, requisitionPatchSchema, requisitionSchema, requisitionStatusSchema } from "@/lib/schemas/requisitions";
import { listActivitiesFor, logActivity } from "../activities";
import { emitEvent } from "../automations";
import { enqueueJob } from "../jobs/queue";
import { paginate, type ListParams } from "../list";
import { canEditRecord, visibilityScope } from "../scope";
import { getSettings } from "../settings";

/** Seats taken = every placement that currently holds a seat (reserved or working). Each placement is one seat. */
export const SEAT_HOLDING_STATUSES = ["reserved", "started", "active", "extended"] as const;

const seatsTakenSql = sql<number>`(select count(*)::int from ${placements} p where p.requisition_id = ${requisitions.id} and p.is_deleted = false and p.status in ('reserved','started','active','extended'))`;

const SORTABLE = {
  title: requisitions.title,
  status: requisitions.status,
  priority: requisitions.priority,
  startDate: requisitions.startDate,
  createdAt: requisitions.createdAt,
  updatedAt: requisitions.updatedAt,
  account: accounts.name,
} as const;

export async function listRequisitions(user: CurrentUser, params: ListParams) {
  const db = await getDb();
  const scope = await visibilityScope(user, requisitions.ownerId, requisitions.isDeleted);
  const where: SQL[] = [scope];
  const f = params.filters;
  if (f.status) where.push(inArray(requisitions.status, f.status.split(",") as (typeof requisitions.$inferSelect.status)[]));
  if (f.priority) where.push(inArray(requisitions.priority, f.priority.split(",") as (typeof requisitions.$inferSelect.priority)[]));
  if (f.account) where.push(eq(requisitions.accountId, f.account));
  if (f.owner) where.push(eq(requisitions.ownerId, f.owner));
  if (f.country) where.push(eq(requisitions.locationCountry, f.country.toUpperCase()));
  if (f.roleFamily) where.push(eq(requisitions.roleFamilyId, f.roleFamily));
  if (f.stalled === "true") {
    const s = await getSettings();
    const cutoff = new Date(Date.now() - s.requisition_stall_days * 86_400_000);
    where.push(eq(requisitions.status, "open"), sql`${requisitions.updatedAt} < ${cutoff}`, sql`not exists (select 1 from ${submissions} s where s.requisition_id = ${requisitions.id} and s.is_deleted = false and s.stage_changed_at > ${cutoff})`);
  }
  if (params.q) {
    const q = `%${params.q}%`;
    where.push(or(ilike(requisitions.title, q), ilike(accounts.name, q), ilike(requisitions.locationCity, q), ilike(requisitions.siteName, q))!);
  }
  const sortCol = SORTABLE[(params.sort as keyof typeof SORTABLE) ?? "updatedAt"] ?? requisitions.updatedAt;
  const order = params.dir === "asc" ? asc(sortCol) : desc(sortCol);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: requisitions.id,
        title: requisitions.title,
        status: requisitions.status,
        priority: requisitions.priority,
        accountId: requisitions.accountId,
        accountName: accounts.name,
        locationCountry: requisitions.locationCountry,
        locationCity: requisitions.locationCity,
        startDate: requisitions.startDate,
        headcountApproved: requisitions.headcountApproved,
        seatsTaken: seatsTakenSql,
        ownerId: requisitions.ownerId,
        ownerName: users.name,
        roleFamilyName: roleFamilies.name,
        currentVersion: requisitions.currentVersion,
        createdAt: requisitions.createdAt,
        updatedAt: requisitions.updatedAt,
        submissionCount: sql<number>`(select count(*)::int from ${submissions} s where s.requisition_id = ${requisitions.id} and s.is_deleted = false)`,
        activeSubmissions: sql<number>`(select count(*)::int from ${submissions} s where s.requisition_id = ${requisitions.id} and s.is_deleted = false and s.stage not in ('placed','declined_by_candidate','rejected_by_customer','withdrawn','not_eligible'))`,
        lastActivityAt: sql<Date | null>`(select max(s.stage_changed_at) from ${submissions} s where s.requisition_id = ${requisitions.id} and s.is_deleted = false)`,
      })
      .from(requisitions)
      .innerJoin(accounts, eq(accounts.id, requisitions.accountId))
      .leftJoin(users, eq(users.id, requisitions.ownerId))
      .leftJoin(roleFamilies, eq(roleFamilies.id, requisitions.roleFamilyId))
      .where(and(...where))
      .orderBy(order, asc(requisitions.title))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db
      .select({ total: count() })
      .from(requisitions)
      .innerJoin(accounts, eq(accounts.id, requisitions.accountId))
      .where(and(...where)),
  ]);
  return paginate(
    rows.map((r) => ({ ...r, openSeats: Math.max(0, r.headcountApproved - r.seatsTaken) })),
    total,
    params,
  );
}

export type RequisitionListRow = Awaited<ReturnType<typeof listRequisitions>>["rows"][number];

export async function getRequisition(user: CurrentUser, id: string) {
  const db = await getDb();
  const scope = await visibilityScope(user, requisitions.ownerId, requisitions.isDeleted);
  const row = await db.query.requisitions.findFirst({ where: and(eq(requisitions.id, id), scope) });
  if (!row) throw notFound("Requisition");
  return row;
}

/** Current-version requirements with resolved skill names, shaped for the matching engine. */
export async function loadRequirements(db: DbOrTx, requisitionId: string, version: number): Promise<Requirement[]> {
  const rows = await db
    .select({ req: requisitionRequirements, skillName: skills.name })
    .from(requisitionRequirements)
    .leftJoin(skills, eq(skills.id, requisitionRequirements.skillId))
    .where(and(eq(requisitionRequirements.requisitionId, requisitionId), eq(requisitionRequirements.version, version), eq(requisitionRequirements.isDeleted, false)))
    .orderBy(asc(requisitionRequirements.sortOrder), asc(requisitionRequirements.createdAt));
  return rows.map(({ req, skillName }) => ({
    id: req.id,
    kind: req.kind,
    field: req.field,
    operator: req.operator,
    value: req.value,
    skillId: req.skillId,
    skillName,
    evidenceRequirement: req.evidenceRequirement,
    justification: req.justification,
    weight: Number(req.weight),
  }));
}

export async function seatSummary(db: DbOrTx, requisitionId: string) {
  const [req] = await db.select({ headcount: requisitions.headcountApproved }).from(requisitions).where(eq(requisitions.id, requisitionId));
  const [taken] = await db
    .select({ n: count() })
    .from(placements)
    .where(and(eq(placements.requisitionId, requisitionId), eq(placements.isDeleted, false), inArray(placements.status, [...SEAT_HOLDING_STATUSES])));
  const [reserved] = await db.select({ n: count() }).from(placements).where(and(eq(placements.requisitionId, requisitionId), eq(placements.isDeleted, false), eq(placements.status, "reserved")));
  const [completed] = await db.select({ n: count() }).from(placements).where(and(eq(placements.requisitionId, requisitionId), eq(placements.isDeleted, false), eq(placements.status, "completed")));
  const headcount = req?.headcount ?? 0;
  const seatsTaken = taken?.n ?? 0;
  return { headcount, seatsTaken, reserved: reserved?.n ?? 0, filled: seatsTaken - (reserved?.n ?? 0), completed: completed?.n ?? 0, open: Math.max(0, headcount - seatsTaken) };
}

export async function getRequisitionDetail(user: CurrentUser, id: string) {
  const db = await getDb();
  const requisition = await getRequisition(user, id);
  const [account, contact, owner, roleFamily, requirements, versions, subs, placementRows, activities, seats] = await Promise.all([
    db.query.accounts.findFirst({ where: eq(accounts.id, requisition.accountId) }),
    requisition.contactId ? db.query.contacts.findFirst({ where: eq(contacts.id, requisition.contactId) }) : null,
    requisition.ownerId ? db.query.users.findFirst({ where: eq(users.id, requisition.ownerId), columns: { id: true, name: true, email: true, avatarUrl: true } }) : null,
    requisition.roleFamilyId ? db.query.roleFamilies.findFirst({ where: eq(roleFamilies.id, requisition.roleFamilyId) }) : null,
    loadRequirements(db, id, requisition.currentVersion),
    db
      .select({ version: requisitionVersions, createdByName: users.name })
      .from(requisitionVersions)
      .leftJoin(users, eq(users.id, requisitionVersions.createdById))
      .where(eq(requisitionVersions.requisitionId, id))
      .orderBy(desc(requisitionVersions.version)),
    db
      .select({
        submission: submissions,
        candidateName: sql<string>`${candidates.firstName} || ' ' || ${candidates.lastName}`,
        candidateHeadline: candidates.headline,
        candidateStatus: candidates.status,
        ownerName: users.name,
      })
      .from(submissions)
      .innerJoin(candidates, eq(candidates.id, submissions.candidateId))
      .leftJoin(users, eq(users.id, submissions.ownerId))
      .where(and(eq(submissions.requisitionId, id), eq(submissions.isDeleted, false)))
      .orderBy(desc(submissions.matchScore), desc(submissions.updatedAt)),
    db
      .select({ placement: placements, candidateName: sql<string>`${candidates.firstName} || ' ' || ${candidates.lastName}` })
      .from(placements)
      .innerJoin(candidates, eq(candidates.id, placements.candidateId))
      .where(and(eq(placements.requisitionId, id), eq(placements.isDeleted, false)))
      .orderBy(desc(placements.plannedStart)),
    listActivitiesFor({ requisitionId: id }),
    seatSummary(db, id),
  ]);
  if (!account) throw notFound("Account");
  return {
    requisition,
    account,
    contact: contact ?? null,
    owner: owner ?? null,
    roleFamily: roleFamily ?? null,
    requirements,
    requirementIssues: validateRequirements(requirements),
    versions,
    submissions: subs,
    placements: placementRows,
    activities,
    seats,
  };
}

export type RequisitionDetail = Awaited<ReturnType<typeof getRequisitionDetail>>;

async function ensureEditable(user: CurrentUser, id: string) {
  const req = await getRequisition(user, id);
  if (!(await canEditRecord(user, req.ownerId))) throw forbiddenError();
  return req;
}

function toValues(input: Partial<z.output<typeof requisitionSchema>>) {
  const v: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(input)) if (val !== undefined) v[k] = val;
  if ("title" in v) v.title = cleanText(v.title as string);
  if ("description" in v) v.description = sanitizeRichText(v.description as string | null);
  for (const key of ["billRateAmount", "payRateAmount"]) if (key in v && v[key] !== null) v[key] = String(v[key]);
  if ("durationWeeks" in v && v.durationWeeks !== null) v.durationWeeks = Math.round(v.durationWeeks as number);
  return v as Partial<typeof requisitions.$inferInsert>;
}

export async function createRequisition(user: CurrentUser, input: z.output<typeof requisitionSchema>) {
  const db = await getDb();
  const account = await db.query.accounts.findFirst({ where: and(eq(accounts.id, input.accountId), eq(accounts.isDeleted, false)) });
  if (!account) throw notFound("Account");
  const values = toValues(input) as typeof requisitions.$inferInsert;
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(requisitions)
      .values({ ...values, ownerId: input.ownerId ?? user.id, createdBy: user.id, openedAt: input.status === "open" ? new Date() : null, currentVersion: 1 })
      .returning();
    await tx.insert(requisitionVersions).values({ requisitionId: row!.id, version: 1, changeSummary: "Initial version", requirementsSnapshot: [], createdById: user.id });
    await logActivity(tx, { type: "system", subject: `Requisition created: ${row!.title}`, requisitionId: row!.id, accountId: row!.accountId, actorId: user.id });
    await recordAudit(tx, { entityType: "requisition", entityId: row!.id, action: "create", actorId: user.id, after: row as unknown as Record<string, unknown> });
    return row!.id;
  });
  await emitEvent({
    trigger: "requisition_created",
    entityType: "requisition",
    entityId: id,
    eventKey: "created",
    payload: { status: input.status, priority: input.priority, headcount: input.headcountApproved },
    actorId: user.id,
    context: { ownerId: input.ownerId ?? user.id, requisitionId: id, accountId: input.accountId, label: input.title },
  });
  return id;
}

export async function updateRequisition(user: CurrentUser, input: z.output<typeof requisitionPatchSchema>) {
  const db = await getDb();
  const before = await ensureEditable(user, input.id);
  const { id, ...patch } = input;
  const values = toValues(patch);
  if (Object.keys(values).length === 0) return before;
  const [after] = await db.update(requisitions).set(values).where(eq(requisitions.id, id)).returning();
  await recordAudit(db, { entityType: "requisition", entityId: id, action: "update", actorId: user.id, before: before as unknown as Record<string, unknown>, after: values as Record<string, unknown> });
  if (values.headcountApproved !== undefined && values.headcountApproved !== before.headcountApproved) {
    await logActivity(db, { type: "system", subject: `Headcount changed ${before.headcountApproved} → ${values.headcountApproved}`, requisitionId: id, actorId: user.id });
  }
  const affectsMatching = ["startDate", "durationWeeks", "locationCountry", "roleFamilyId"].some((k) => k in values);
  if (affectsMatching) await enqueueJob(db, { type: "matching:recompute", payload: { requisitionId: id }, idempotencyKey: `recompute:${id}:${Date.now()}`, ownerId: user.id });
  return after!;
}

export async function changeRequisitionStatus(user: CurrentUser, input: z.output<typeof requisitionStatusSchema>) {
  const db = await getDb();
  const before = await ensureEditable(user, input.id);
  if (before.status === input.status) return before;
  if (input.status === "open") {
    const reqs = await loadRequirements(db, input.id, before.currentVersion);
    const issues = validateRequirements(reqs);
    if (issues.length) throw validation(`Fix the requirement problems before opening: ${issues[0]}`);
    if (!reqs.some((r) => r.kind === "mandatory")) throw validation("Add at least one mandatory eligibility rule before opening the requisition.");
  }
  const closing = ["closed", "cancelled", "filled"].includes(input.status);
  const [after] = await db
    .update(requisitions)
    .set({
      status: input.status,
      openedAt: input.status === "open" && !before.openedAt ? new Date() : before.openedAt,
      closedAt: closing ? new Date() : null,
      closeReason: closing ? input.closeReason : null,
    })
    .where(eq(requisitions.id, input.id))
    .returning();
  await logActivity(db, { type: "status_change", subject: `Requisition ${before.status} → ${input.status}${input.closeReason ? ` (${input.closeReason})` : ""}`, requisitionId: input.id, accountId: before.accountId, actorId: user.id });
  await recordAudit(db, { entityType: "requisition", entityId: input.id, action: "update", actorId: user.id, before: { status: before.status }, after: { status: input.status, closeReason: input.closeReason } });
  return after!;
}

/**
 * Saves a new requirements version. Old versions are preserved (existing submissions keep the
 * version they were matched against) and a recompute job is queued so results stay current.
 */
export async function saveRequirementsVersion(user: CurrentUser, input: z.output<typeof requirementsVersionSchema>) {
  const db = await getDb();
  const req = await ensureEditable(user, input.requisitionId);
  const skillIds = input.requirements.map((r) => r.skillId).filter((x): x is string => Boolean(x));
  const skillRows = skillIds.length ? await db.select({ id: skills.id, name: skills.name }).from(skills).where(inArray(skills.id, skillIds)) : [];
  const skillName = new Map(skillRows.map((s) => [s.id, s.name]));
  for (const id of skillIds) if (!skillName.has(id)) throw validation("One of the selected skills no longer exists.");

  const draft: Requirement[] = input.requirements.map((r, i) => ({
    id: r.id ?? `new-${i}`,
    kind: r.kind,
    field: r.field,
    operator: r.operator,
    value: r.value ?? null,
    skillId: r.skillId,
    skillName: r.skillId ? skillName.get(r.skillId) : null,
    evidenceRequirement: r.evidenceRequirement,
    justification: r.justification,
    weight: r.weight,
  }));
  const issues = validateRequirements(draft);
  if (issues.length) throw new AppError("validation", issues.join(" "), { requirements: issues[0]! });

  const nextVersion = req.currentVersion + 1;
  await db.transaction(async (tx) => {
    const snapshot: RequirementSnapshot[] = draft.map((r) => ({
      kind: r.kind,
      field: r.field,
      operator: r.operator,
      value: r.value,
      skillId: r.skillId ?? null,
      evidenceRequirement: r.evidenceRequirement,
      justification: r.justification ?? null,
      weight: r.weight,
    }));
    if (draft.length) {
      await tx.insert(requisitionRequirements).values(
        draft.map((r, i) => ({
          requisitionId: input.requisitionId,
          version: nextVersion,
          kind: r.kind,
          field: r.field,
          operator: r.operator,
          value: r.value ?? null,
          skillId: r.skillId ?? null,
          evidenceRequirement: r.evidenceRequirement,
          justification: r.justification ?? null,
          weight: r.weight.toFixed(2),
          sortOrder: i,
          createdBy: user.id,
        })),
      );
    }
    await tx.insert(requisitionVersions).values({
      requisitionId: input.requisitionId,
      version: nextVersion,
      changeSummary: input.changeSummary ?? `Requirements updated (${draft.length} rules)`,
      requirementsSnapshot: snapshot,
      createdById: user.id,
    });
    await tx.update(requisitions).set({ currentVersion: nextVersion }).where(eq(requisitions.id, input.requisitionId));
    await logActivity(tx, { type: "system", subject: `Requirements version ${nextVersion} saved (${draft.filter((r) => r.kind === "mandatory").length} mandatory, ${draft.filter((r) => r.kind === "preferred").length} preferred)`, requisitionId: input.requisitionId, actorId: user.id });
    await recordAudit(tx, { entityType: "requisition", entityId: input.requisitionId, action: "update", actorId: user.id, before: { version: req.currentVersion }, after: { version: nextVersion, rules: draft.length } });
    await enqueueJob(tx, { type: "matching:recompute", payload: { requisitionId: input.requisitionId }, idempotencyKey: `recompute:${input.requisitionId}:v${nextVersion}`, ownerId: user.id });
  });
  return nextVersion;
}

export async function requisitionOptions(user: CurrentUser, q: string, limit = 10) {
  const db = await getDb();
  const scope = await visibilityScope(user, requisitions.ownerId, requisitions.isDeleted);
  return db
    .select({ id: requisitions.id, label: requisitions.title, sub: accounts.name })
    .from(requisitions)
    .innerJoin(accounts, eq(accounts.id, requisitions.accountId))
    .where(and(scope, inArray(requisitions.status, ["draft", "open", "on_hold"]), q ? or(ilike(requisitions.title, `%${q}%`), ilike(accounts.name, `%${q}%`)) : undefined))
    .orderBy(asc(requisitions.title))
    .limit(limit);
}
