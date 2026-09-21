import "server-only";
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accounts, candidates, contacts, placements, requisitions, submissions } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { visibilityScope } from "./scope";

export type SearchHit = { type: "candidate" | "account" | "requisition" | "contact" | "submission" | "placement"; id: string; title: string; subtitle: string | null; href: string };

/** Global search across the major objects. Each branch carries the caller's row-visibility scope. */
export async function globalSearch(user: CurrentUser, q: string, limitPerType = 5): Promise<SearchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const db = await getDb();
  const like = `%${term}%`;
  const [candScope, accScope, reqScope, subScope, plScope] = await Promise.all([
    visibilityScope(user, candidates.ownerId, candidates.isDeleted),
    visibilityScope(user, accounts.ownerId, accounts.isDeleted),
    visibilityScope(user, requisitions.ownerId, requisitions.isDeleted),
    visibilityScope(user, submissions.ownerId, submissions.isDeleted),
    visibilityScope(user, placements.ownerId, placements.isDeleted),
  ]);
  const [cands, accs, reqs, conts, subs, pls] = await Promise.all([
    db
      .select({ id: candidates.id, title: sql<string>`${candidates.firstName} || ' ' || ${candidates.lastName}`, subtitle: candidates.headline })
      .from(candidates)
      .where(and(candScope, isNull(candidates.mergedIntoId), or(ilike(candidates.firstName, like), ilike(candidates.lastName, like), sql`(${candidates.firstName} || ' ' || ${candidates.lastName}) ilike ${like}`, ilike(candidates.email, like), ilike(candidates.phone, like), ilike(candidates.headline, like), ilike(candidates.militaryRole, like))))
      .limit(limitPerType),
    db
      .select({ id: accounts.id, title: accounts.name, subtitle: accounts.industry })
      .from(accounts)
      .where(and(accScope, or(ilike(accounts.name, like), ilike(accounts.industry, like), ilike(accounts.city, like))))
      .limit(limitPerType),
    db
      .select({ id: requisitions.id, title: requisitions.title, subtitle: accounts.name })
      .from(requisitions)
      .innerJoin(accounts, eq(accounts.id, requisitions.accountId))
      .where(and(reqScope, or(ilike(requisitions.title, like), ilike(requisitions.locationCity, like), ilike(requisitions.siteName, like), ilike(accounts.name, like))))
      .limit(limitPerType),
    db
      .select({ id: contacts.id, accountId: contacts.accountId, title: sql<string>`${contacts.firstName} || ' ' || ${contacts.lastName}`, subtitle: accounts.name })
      .from(contacts)
      .innerJoin(accounts, eq(accounts.id, contacts.accountId))
      .where(and(accScope, eq(contacts.isDeleted, false), or(ilike(contacts.firstName, like), ilike(contacts.lastName, like), ilike(contacts.email, like))))
      .limit(limitPerType),
    db
      .select({ id: submissions.id, title: sql<string>`${candidates.firstName} || ' ' || ${candidates.lastName} || ' → ' || ${requisitions.title}`, subtitle: submissions.stage })
      .from(submissions)
      .innerJoin(candidates, eq(candidates.id, submissions.candidateId))
      .innerJoin(requisitions, eq(requisitions.id, submissions.requisitionId))
      .where(and(subScope, or(ilike(candidates.lastName, like), ilike(requisitions.title, like))))
      .limit(limitPerType),
    db
      .select({ id: placements.id, title: sql<string>`${candidates.firstName} || ' ' || ${candidates.lastName} || ' @ ' || ${accounts.name}`, subtitle: placements.status })
      .from(placements)
      .innerJoin(candidates, eq(candidates.id, placements.candidateId))
      .innerJoin(accounts, eq(accounts.id, placements.accountId))
      .where(and(plScope, or(ilike(candidates.lastName, like), ilike(accounts.name, like))))
      .limit(limitPerType),
  ]);
  return [
    ...cands.map((r) => ({ type: "candidate" as const, id: r.id, title: r.title, subtitle: r.subtitle, href: `/candidates/${r.id}` })),
    ...accs.map((r) => ({ type: "account" as const, id: r.id, title: r.title, subtitle: r.subtitle, href: `/accounts/${r.id}` })),
    ...reqs.map((r) => ({ type: "requisition" as const, id: r.id, title: r.title, subtitle: r.subtitle, href: `/requisitions/${r.id}` })),
    ...conts.map((r) => ({ type: "contact" as const, id: r.id, title: r.title, subtitle: r.subtitle, href: `/accounts/${r.accountId}` })),
    ...subs.map((r) => ({ type: "submission" as const, id: r.id, title: r.title, subtitle: r.subtitle.replace(/_/g, " "), href: `/submissions/${r.id}` })),
    ...pls.map((r) => ({ type: "placement" as const, id: r.id, title: r.title, subtitle: r.subtitle, href: `/placements/${r.id}` })),
  ];
}
