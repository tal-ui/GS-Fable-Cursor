import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { systemColumns } from "./_system";
import { users } from "./auth";

export const skillCategories = pgTable(
  "skill_categories",
  {
    ...systemColumns,
    name: text("name").notNull().unique(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("skill_categories_sort_idx").on(t.sortOrder)],
);

export const skills = pgTable(
  "skills",
  {
    ...systemColumns,
    /** Stable identifier used by imports, rules and integrations. Never changes once published. */
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => skillCategories.id, { onDelete: "restrict" }),
    description: text("description"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    /** Whether verification evidence expires (e.g. licences); null = never. */
    defaultValidityMonths: integer("default_validity_months"),
  },
  (t) => [
    index("skills_name_idx").on(t.name),
    index("skills_category_idx").on(t.categoryId),
    index("skills_owner_idx").on(t.ownerId),
    index("skills_active_idx").on(t.isActive),
  ],
);

export const skillSynonyms = pgTable(
  "skill_synonyms",
  {
    ...systemColumns,
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    /** Lower-cased matching term. */
    term: text("term").notNull(),
  },
  (t) => [uniqueIndex("skill_synonyms_skill_term_uq").on(t.skillId, t.term), index("skill_synonyms_term_idx").on(t.term)],
);

export type RankingWeights = {
  skills: number;
  proficiency: number;
  experience: number;
  preferences: number;
  freshness: number;
};

export const roleFamilies = pgTable(
  "role_families",
  {
    ...systemColumns,
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    rankingWeights: jsonb("ranking_weights")
      .$type<RankingWeights>()
      .notNull()
      .default({ skills: 0.4, proficiency: 0.15, experience: 0.15, preferences: 0.2, freshness: 0.1 }),
    rankingVersion: text("ranking_version").notNull().default("baseline-v1"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("role_families_active_idx").on(t.isActive)],
);
