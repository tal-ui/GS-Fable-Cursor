import { boolean, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * Standard system columns present on every business object.
 * Records are never hard-deleted; `is_deleted` implements soft delete.
 */
export const systemColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  isDeleted: boolean("is_deleted").notNull().default(false),
};

/** Append-only log tables only need an id and creation timestamp. */
export const logColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};
