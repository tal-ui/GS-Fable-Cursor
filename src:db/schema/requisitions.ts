import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { systemColumns } from "./_system";
import { users } from "./auth";
import { accounts, contacts } from "./crm";
import {
  evidenceRequirementEnum,
  payPeriodEnum,
  priorityEnum,
  requirementFieldEnum,
  requirementKindEnum,
  requirementOperatorEnum,
  requisitionStatusEnum,
} from "./enums";
import { roleFamilies, skills } from "./taxonomy";

export const requisitions = pgTable(
  "requisitions",
  {
    ...systemColumns,
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    roleFamilyId: uuid("role_family_id").references(() => roleFamilies.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    locationCountry: text("location_country").notNull(),
    locationCity: text("location_city"),
    siteName: text("site_name"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    durationWeeks: integer("duration_weeks"),
    headcountApproved: integer("headcount_approved").notNull().default(1),
    status: requisitionStatusEnum("status").notNull().default("draft"),
    priority: priorityEnum("priority").notNull().default("medium"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    billRateAmount: numeric("bill_rate_amount", { precision: 12, scale: 2 }),
    billRateCurrency: text("bill_rate_currency"),
    billRatePeriod: payPeriodEnum("bill_rate_period"),
    payRateAmount: numeric("pay_rate_amount", { precision: 12, scale: 2 }),
    payRateCurrency: text("pay_rate_currency"),
    payRatePeriod: payPeriodEnum("pay_rate_period"),
    currentVersion: integer("current_version").notNull().default(1),
    externalRef: text("external_ref"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closeReason: text("close_reason"),
  },
  (t) => [
    index("requisitions_account_idx").on(t.accountId),
    index("requisitions_status_idx").on(t.status),
    index("requisitions_owner_idx").on(t.ownerId),
    index("requisitions_start_idx").on(t.startDate),
    index("requisitions_role_family_idx").on(t.roleFamilyId),
    index("requisitions_priority_idx").on(t.priority),
    index("requisitions_title_idx").on(t.title),
  ],
);

export type RequirementSnapshot = {
  kind: "mandatory" | "preferred";
  field: string;
  operator: string;
  value: unknown;
  skillId?: string | null;
  evidenceRequirement: string;
  justification?: string | null;
  weight: number;
};

export const requisitionVersions = pgTable(
  "requisition_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requisitionId: uuid("requisition_id")
      .notNull()
      .references(() => requisitions.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    changeSummary: text("change_summary"),
    requirementsSnapshot: jsonb("requirements_snapshot").$type<RequirementSnapshot[]>().notNull(),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("requisition_versions_uq").on(t.requisitionId, t.version)],
);

export const requisitionRequirements = pgTable(
  "requisition_requirements",
  {
    ...systemColumns,
    requisitionId: uuid("requisition_id")
      .notNull()
      .references(() => requisitions.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    kind: requirementKindEnum("kind").notNull(),
    field: requirementFieldEnum("field").notNull(),
    operator: requirementOperatorEnum("operator").notNull(),
    /** Null for rules whose target comes from the requisition itself (work_authorization, availability_from, relocation) or `exists`. */
    value: jsonb("value").$type<unknown>(),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    evidenceRequirement: evidenceRequirementEnum("evidence_requirement").notNull().default("declared"),
    /** Mandatory rules require a business justification (lawful eligibility vs preference). */
    justification: text("justification"),
    weight: numeric("weight", { precision: 4, scale: 2 }).notNull().default("1.00"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("requisition_requirements_req_version_idx").on(t.requisitionId, t.version),
    index("requisition_requirements_skill_idx").on(t.skillId),
    index("requisition_requirements_kind_idx").on(t.kind),
  ],
);
