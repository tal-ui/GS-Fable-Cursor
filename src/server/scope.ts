import "server-only";
import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { CurrentUser } from "@/lib/auth/session";
import { getSettings } from "./settings";

export type Scoped = Pick<CurrentUser, "id" | "role">;

/**
 * Builds the row-visibility predicate that every list/detail query must include.
 * Super Admins see all non-deleted rows. Standard/Read Only users see rows according to the
 * data sharing model: the whole team's records (one staffing company) or only the records they
 * own / that are unassigned. The predicate is part of the SQL, never applied in the UI.
 */
export async function visibilityScope(
  user: Scoped,
  ownerColumn: PgColumn | null,
  isDeletedColumn: PgColumn,
  /** `alsoWhen` lets a soft-deleted row through when the predicate holds (erased profiles on their own detail page); the ownership rule still applies. */
  options?: { alsoWhen?: SQL },
): Promise<SQL> {
  const notDeleted = options?.alsoWhen ? or(eq(isDeletedColumn, false), options.alsoWhen)! : eq(isDeletedColumn, false);
  if (user.role === "super_admin" || !ownerColumn) return notDeleted;
  const settings = await getSettings();
  if (settings.sharing_model === "team") return notDeleted;
  return and(notDeleted, or(eq(ownerColumn, user.id), isNull(ownerColumn)))!;
}

/** Whether the user may edit a specific record they can see (ownership rule for the owner model). */
export async function canEditRecord(user: Scoped, ownerId: string | null): Promise<boolean> {
  if (user.role === "super_admin") return true;
  if (user.role === "read_only") return false;
  const settings = await getSettings();
  if (settings.sharing_model === "team") return true;
  return ownerId === null || ownerId === user.id;
}
