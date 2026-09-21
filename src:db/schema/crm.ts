import { boolean, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { systemColumns } from "./_system";
import { users } from "./auth";
import { accountStatusEnum, accountTypeEnum } from "./enums";

export const accounts = pgTable(
  "accounts",
  {
    ...systemColumns,
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull().default("employer"),
    status: accountStatusEnum("status").notNull().default("prospect"),
    industry: text("industry"),
    website: text("website"),
    country: text("country"),
    city: text("city"),
    addressLine: text("address_line"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    currency: text("currency").notNull().default("USD"),
    paymentTermsDays: integer("payment_terms_days"),
    /** Sanitized rich text describing agreed commercial terms (rates, exclusivity, notice). */
    commercialTerms: text("commercial_terms"),
    notes: text("notes"),
    externalRef: text("external_ref"),
  },
  (t) => [
    index("accounts_name_idx").on(t.name),
    index("accounts_type_idx").on(t.type),
    index("accounts_status_idx").on(t.status),
    index("accounts_owner_idx").on(t.ownerId),
    index("accounts_country_idx").on(t.country),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    ...systemColumns,
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
    isPrimary: boolean("is_primary").notNull().default(false),
    receivesShortlists: boolean("receives_shortlists").notNull().default(false),
    notes: text("notes"),
  },
  (t) => [index("contacts_account_idx").on(t.accountId), index("contacts_email_idx").on(t.email), index("contacts_last_name_idx").on(t.lastName)],
);
