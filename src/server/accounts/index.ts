import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@/db/client";
import { accounts, contacts, consents, disclosures, placements, requisitions, submissions, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { forbiddenError, notFound } from "@/lib/errors";
import { cleanText, normalizeEmail, sanitizeRichText } from "@/lib/sanitize";
import type { accountPatchSchema, accountSchema, contactSchema } from "@/lib/schemas/crm";
import { listActivitiesFor, logActivity } from "../activities";
import { assertAccountArchivable } from "../archive";
import { paginate, type ListParams } from "../list";
import { canEditRecord, visibilityScope } from "../scope";

const SORTABLE = {
  name: accounts.name,
  type: accounts.type,
  status: accounts.status,
  country: accounts.country,
  createdAt: accounts.createdAt,
  updatedAt: accounts.updatedAt,
} as const;

export async function listAccounts(user: CurrentUser, params: ListParams) {
  const db = await getDb();
  const scope = await visibilityScope(user, accounts.ownerId, accounts.isDeleted);
  const where: SQL[] = [scope];
  const f = params.filters;
  if (f.type) where.push(inArray(accounts.type, f.type.split(",") as (typeof accounts.$inferSelect.type)[]));
  if (f.status) where.push(inArray(accounts.status, f.status.split(",") as (typeof accounts.$inferSelect.status)[]));
  if (f.owner) where.push(eq(accounts.ownerId, f.owner));
  if (f.country) where.push(eq(accounts.country, f.country.toUpperCase()));
  if (params.q) {
    const q = `%${params.q}%`;
    where.push(or(ilike(accounts.name, q), ilike(accounts.industry, q), ilike(accounts.city, q))!);
  }
  const sortCol = SORTABLE[(params.sort as keyof typeof SORTABLE) ?? "updatedAt"] ?? accounts.updatedAt;
  const order = params.dir === "asc" ? asc(sortCol) : desc(sortCol);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        type: accounts.type,
        status: accounts.status,
        industry: accounts.industry,
        country: accounts.country,
        city: accounts.city,
        ownerId: accounts.ownerId,
        ownerName: users.name,
        createdAt: accounts.createdAt,
        updatedAt: accounts.updatedAt,
        openRequisitions: sql<number>`(select count(*)::int from ${requisitions} r where r.account_id = ${accounts.id} and r.is_deleted = false and r.status = 'open')`,
        contactCount: sql<number>`(select count(*)::int from ${contacts} c where c.account_id = ${accounts.id} and c.is_deleted = false)`,
        activePlacements: sql<number>`(select count(*)::int from ${placements} p where p.account_id = ${accounts.id} and p.is_deleted = false and p.status in ('reserved','started','active','extended'))`,
      })
      .from(accounts)
      .leftJoin(users, eq(users.id, accounts.ownerId))
      .where(and(...where))
      .orderBy(order, asc(accounts.name))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ total: count() }).from(accounts).where(and(...where)),
  ]);
  return paginate(rows, total, params);
}

export type AccountListRow = Awaited<ReturnType<typeof listAccounts>>["rows"][number];

export async function getAccount(user: CurrentUser, id: string) {
  const db = await getDb();
  const scope = await visibilityScope(user, accounts.ownerId, accounts.isDeleted);
  const row = await db.query.accounts.findFirst({ where: and(eq(accounts.id, id), scope) });
  if (!row) throw notFound("Account");
  return row;
}

export async function getAccountDetail(user: CurrentUser, id: string) {
  const db = await getDb();
  const account = await getAccount(user, id);
  const [owner, contactRows, reqRows, placementRows, disclosureRows, sharingConsents, activities] = await Promise.all([
    account.ownerId ? db.query.users.findFirst({ where: eq(users.id, account.ownerId), columns: { id: true, name: true, email: true, avatarUrl: true } }) : null,
    db.select().from(contacts).where(and(eq(contacts.accountId, id), eq(contacts.isDeleted, false))).orderBy(desc(contacts.isPrimary), asc(contacts.lastName)),
    db
      .select({
        requisition: requisitions,
        ownerName: users.name,
        submissionCount: sql<number>`(select count(*)::int from ${submissions} s where s.requisition_id = ${requisitions.id} and s.is_deleted = false)`,
        filledSeats: sql<number>`(select count(*)::int from ${placements} p where p.requisition_id = ${requisitions.id} and p.is_deleted = false and p.status in ('reserved','started','active','extended'))`,
      })
      .from(requisitions)
      .leftJoin(users, eq(users.id, requisitions.ownerId))
      .where(and(eq(requisitions.accountId, id), eq(requisitions.isDeleted, false)))
      .orderBy(desc(requisitions.updatedAt)),
    db
      .select({ placement: placements, requisitionTitle: requisitions.title, candidateName: sql<string>`(select c.first_name || ' ' || c.last_name from candidates c where c.id = ${placements.candidateId})` })
      .from(placements)
      .innerJoin(requisitions, eq(requisitions.id, placements.requisitionId))
      .where(and(eq(placements.accountId, id), eq(placements.isDeleted, false)))
      .orderBy(desc(placements.plannedStart)),
    db
      .select({ disclosure: disclosures, candidateName: sql<string>`(select c.first_name || ' ' || c.last_name from candidates c where c.id = ${disclosures.candidateId})`, sharedByName: users.name })
      .from(disclosures)
      .leftJoin(users, eq(users.id, disclosures.sharedById))
      .where(and(eq(disclosures.accountId, id), eq(disclosures.isDeleted, false)))
      .orderBy(desc(disclosures.sharedAt))
      .limit(50),
    db.select({ n: count() }).from(consents).where(and(eq(consents.accountId, id), eq(consents.scope, "share_with_customer"), eq(consents.isDeleted, false), sql`${consents.withdrawnAt} is null`)),
    listActivitiesFor({ accountId: id }),
  ]);
  return {
    account,
    owner: owner ?? null,
    contacts: contactRows,
    requisitions: reqRows,
    placements: placementRows,
    disclosures: disclosureRows,
    sharingConsentCount: sharingConsents[0]?.n ?? 0,
    activities,
  };
}

export type AccountDetail = Awaited<ReturnType<typeof getAccountDetail>>;

export async function createAccount(user: CurrentUser, input: z.output<typeof accountSchema>) {
  const db = await getDb();
  const [row] = await db
    .insert(accounts)
    .values({
      ...input,
      name: cleanText(input.name)!,
      commercialTerms: sanitizeRichText(input.commercialTerms),
      notes: sanitizeRichText(input.notes),
      paymentTermsDays: input.paymentTermsDays === null ? null : Math.round(input.paymentTermsDays),
      ownerId: input.ownerId ?? user.id,
      createdBy: user.id,
    })
    .returning();
  await logActivity(db, { type: "system", subject: "Account created", accountId: row!.id, actorId: user.id });
  await recordAudit(db, { entityType: "account", entityId: row!.id, action: "create", actorId: user.id, after: row as unknown as Record<string, unknown> });
  return row!;
}

export async function updateAccount(user: CurrentUser, input: z.output<typeof accountPatchSchema>) {
  const db = await getDb();
  const before = await getAccount(user, input.id);
  if (!(await canEditRecord(user, before.ownerId))) throw forbiddenError();
  const { id, ...patch } = input;
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) values[k] = v;
  if ("name" in values) values.name = cleanText(values.name as string) ?? before.name;
  if ("commercialTerms" in values) values.commercialTerms = sanitizeRichText(values.commercialTerms as string | null);
  if ("notes" in values) values.notes = sanitizeRichText(values.notes as string | null);
  if ("paymentTermsDays" in values && values.paymentTermsDays !== null) values.paymentTermsDays = Math.round(values.paymentTermsDays as number);
  if (Object.keys(values).length === 0) return before;
  const [after] = await db.update(accounts).set(values).where(eq(accounts.id, id)).returning();
  await recordAudit(db, { entityType: "account", entityId: id, action: "update", actorId: user.id, before: before as unknown as Record<string, unknown>, after: values });
  if (values.status && values.status !== before.status) {
    await logActivity(db, { type: "status_change", subject: `Account status ${before.status} → ${values.status}`, accountId: id, actorId: user.id });
  }
  return after!;
}

export async function softDeleteAccount(user: CurrentUser, id: string) {
  const db = await getDb();
  const before = await getAccount(user, id);
  if (!(await canEditRecord(user, before.ownerId))) throw forbiddenError();
  await assertAccountArchivable(id);
  await db.update(accounts).set({ isDeleted: true }).where(eq(accounts.id, id));
  await recordAudit(db, { entityType: "account", entityId: id, action: "delete", actorId: user.id, before: before as unknown as Record<string, unknown> });
}

export async function upsertContact(user: CurrentUser, input: z.output<typeof contactSchema>) {
  const db = await getDb();
  const account = await getAccount(user, input.accountId);
  if (!(await canEditRecord(user, account.ownerId))) throw forbiddenError();
  const values = {
    accountId: input.accountId,
    firstName: cleanText(input.firstName)!,
    lastName: cleanText(input.lastName)!,
    email: normalizeEmail(input.email),
    phone: input.phone,
    title: input.title,
    isPrimary: input.isPrimary,
    receivesShortlists: input.receivesShortlists,
    notes: sanitizeRichText(input.notes),
  };
  return db.transaction(async (tx) => {
    if (values.isPrimary) {
      await tx.update(contacts).set({ isPrimary: false }).where(and(eq(contacts.accountId, input.accountId), eq(contacts.isPrimary, true)));
    }
    if (input.id) {
      const [row] = await tx.update(contacts).set(values).where(and(eq(contacts.id, input.id), eq(contacts.accountId, input.accountId))).returning();
      if (!row) throw notFound("Contact");
      return row;
    }
    const [row] = await tx.insert(contacts).values({ ...values, createdBy: user.id }).returning();
    await logActivity(tx, { type: "system", subject: `Contact added: ${values.firstName} ${values.lastName}`, accountId: input.accountId, contactId: row!.id, actorId: user.id });
    return row!;
  });
}

export async function removeContact(user: CurrentUser, id: string) {
  const db = await getDb();
  const row = await db.query.contacts.findFirst({ where: and(eq(contacts.id, id), eq(contacts.isDeleted, false)) });
  if (!row) throw notFound("Contact");
  const account = await getAccount(user, row.accountId);
  if (!(await canEditRecord(user, account.ownerId))) throw forbiddenError();
  await db.update(contacts).set({ isDeleted: true }).where(eq(contacts.id, id));
}

export async function accountOptions(user: CurrentUser, q: string, limit = 10) {
  const db = await getDb();
  const scope = await visibilityScope(user, accounts.ownerId, accounts.isDeleted);
  return db
    .select({ id: accounts.id, label: accounts.name, sub: accounts.type })
    .from(accounts)
    .where(and(scope, q ? ilike(accounts.name, `%${q}%`) : undefined))
    .orderBy(asc(accounts.name))
    .limit(limit);
}

export async function contactsForAccount(accountId: string) {
  const db = await getDb();
  return db.select().from(contacts).where(and(eq(contacts.accountId, accountId), eq(contacts.isDeleted, false))).orderBy(desc(contacts.isPrimary), asc(contacts.lastName));
}
