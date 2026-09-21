/**
 * Generates docs/data-model.md (Mermaid ERD + data dictionary) from the Drizzle schema,
 * so the documentation can never drift from the DDL in drizzle/*.sql.
 *
 * Run: pnpm docs:schema
 */
import fs from "node:fs";
import path from "node:path";
import { getTableConfig, PgTable, PgEnumColumn, isPgEnum } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import * as schema from "../src/db/schema";

type ColumnDoc = {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string;
  fk?: { table: string; column: string; onDelete: string };
  unique: boolean;
};

const TABLE_PURPOSE: Record<string, string> = {
  users: "Staff accounts. Google-authenticated; pending until a Super Admin activates and assigns a role.",
  sessions: "Server-side sessions referenced by an HTTP-only cookie (hashed token, 8h idle timeout).",
  security_audit_log: "Every 401/403 and privileged action with user, path, IP and outcome.",
  audit_log: "Before/after history for sensitive changes (verification, disclosure, merges, role changes, exports).",
  notifications: "In-app notification bell items per user.",
  saved_filters: "Per-user saved list filter presets.",
  app_settings: "Admin-editable key/value configuration (freshness thresholds, stall days, defaults).",
  skill_categories: "Taxonomy groupings (e.g. Security operations, Medical, Languages).",
  skills: "Taxonomy entries with a stable code, owner and optional validity period.",
  skill_synonyms: "Alternative wordings mapped to a skill for extraction and import normalisation.",
  role_families: "Groups of roles sharing agreed ranking weights and a ranking version.",
  sources: "Where candidates come from: agencies, referrals, job boards, imports.",
  candidates: "One reusable person record. Citizenship, passport and work authorisation are stored separately.",
  candidate_skill_claims: "A candidate's claim to a skill: declared proficiency vs verified status, evidence, reviewer, expiry, AI confidence.",
  candidate_languages: "Language proficiency claims with verification.",
  candidate_work_authorizations: "Permission to work per destination country — distinct from passport/citizenship.",
  candidate_availability: "Dated availability periods with rotation preference and last confirmation.",
  candidate_compensation: "Expected/minimum/current compensation with amount, currency, period and gross/net.",
  consents: "Permission records per scope (process, communicate, share with a named customer) with notice version and withdrawal.",
  documents: "Private files (CV, passport, certificates, contracts) with versioning, hash and scan status.",
  document_access_log: "Every view/download/share of a document.",
  source_events: "Attribution events (applied, imported, referred) preserved through merges.",
  candidate_merges: "Merge audit trail with a full pre-merge snapshot for recovery.",
  accounts: "Employer or partner organisations with type, owner, status and commercial terms.",
  contacts: "People at an account; flags for primary and shortlist recipients.",
  requisitions: "A customer request: role, location, dates, headcount, owner, status and rates.",
  requisition_versions: "Immutable snapshot of the requirement set each time it changes.",
  requisition_requirements: "Mandatory vs preferred rules (field, operator, value, evidence requirement, justification, weight) per version.",
  submissions: "One candidate considered for one requisition: stage, eligibility, match snapshot, permissions, decisions.",
  submission_stage_history: "Structured stage transitions with reason codes.",
  interviews: "Screening and customer interviews with schedule, interviewer and outcome.",
  disclosures: "Log of candidate summaries shared with a customer, tied to the authorising consent.",
  placements: "Accepted assignment: reserved seat, planned/actual dates, terms, extension/replacement links.",
  match_feedback: "Recruiter decisions on suggestions (accept/override/reject) for matching quality analysis.",
  activities: "Notes, calls, emails, meetings and system events linked to any core record.",
  tasks: "Owned work items with due dates; automations use dedupe keys as loop guards.",
  message_templates: "Approved outreach templates per channel (WhatsApp templates carry provider IDs).",
  messages: "Outbound/inbound messages with idempotent send key, provider id, delivery status and fallback task.",
  jobs: "Persistent background job queue with attempts, locking, results and idempotency.",
  import_batches: "CSV import batches: mapping, parsed rows, preview errors, duplicate proposals, created records.",
  automation_rules: "Event-driven rules: trigger → conditions → action.",
  automation_runs: "One row per (rule, event, entity); unique dedupe key prevents re-firing.",
  ai_audit_log: "Every AI call with purpose, input/output, confidence, latency and status.",
  integration_error_log: "Provider failures (WhatsApp, email, AI, storage) with retry counts.",
  webhook_events: "Inbound webhook receipts keyed by provider event id to prevent duplicate processing.",
};

function columnType(col: { getSQLType: () => string; dataType?: string }): string {
  if (is(col, PgEnumColumn)) return `enum ${(col as unknown as { enum: { enumName: string } }).enum.enumName}`;
  return col.getSQLType();
}

function formatDefault(def: unknown): string {
  if (def === undefined) return "";
  if (typeof def === "object" && def !== null && "queryChunks" in (def as object)) {
    const chunks = (def as { queryChunks: unknown[] }).queryChunks;
    return chunks
      .map((c) => (typeof c === "object" && c !== null && "value" in c ? String((c as { value: unknown[] }).value.join("")) : ""))
      .join("")
      .trim();
  }
  if (typeof def === "function") return "(computed)";
  return JSON.stringify(def);
}

function main() {
  const values: unknown[] = Object.values(schema);
  const tables = values.filter((v): v is PgTable => is(v, PgTable));
  const docs: { name: string; columns: ColumnDoc[] }[] = [];
  const relationships: string[] = [];

  for (const table of tables) {
    const cfg = getTableConfig(table);
    const fkByColumn = new Map<string, { table: string; column: string; onDelete: string }>();
    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference();
      const from = ref.columns[0]?.name;
      const toTable = getTableConfig(ref.foreignTable).name;
      const toCol = ref.foreignColumns[0]?.name;
      if (from && toCol) {
        fkByColumn.set(from, { table: toTable, column: toCol, onDelete: (fk.onDelete ?? "no action").toUpperCase() });
        relationships.push(`  ${toTable} ||--o{ ${cfg.name} : "${from}"`);
      }
    }
    const uniqueCols = new Set<string>();
    for (const idx of cfg.indexes) {
      const c = idx.config;
      if (c.unique && c.columns.length === 1 && "name" in c.columns[0]) uniqueCols.add((c.columns[0] as { name: string }).name);
    }
    const columns: ColumnDoc[] = cfg.columns.map((col) => ({
      name: col.name,
      type: columnType(col),
      nullable: !col.notNull,
      defaultValue: col.hasDefault ? formatDefault(col.default) || (col.defaultFn ? "(generated)" : "") : "",
      fk: fkByColumn.get(col.name),
      unique: col.isUnique || uniqueCols.has(col.name),
    }));
    docs.push({ name: cfg.name, columns });
  }

  const enums = values.filter((v) => isPgEnum(v));

  const lines: string[] = [];
  lines.push("# Data model");
  lines.push("");
  lines.push("Generated from `src/db/schema` by `pnpm docs:schema`. The executable DDL lives in `drizzle/0000_init.sql`.");
  lines.push("");
  lines.push("Every business object carries the system columns `id` (uuid), `created_at`, `updated_at`, `created_by` and `is_deleted` (soft delete). Append-only logs carry `id` and `created_at` only.");
  lines.push("");
  lines.push("## Entity relationship diagram");
  lines.push("");
  lines.push("```mermaid");
  lines.push("erDiagram");
  for (const t of docs) {
    lines.push(`  ${t.name} {`);
    for (const c of t.columns) {
      if (["created_at", "updated_at", "created_by", "is_deleted"].includes(c.name)) continue;
      const flags = [c.name === "id" ? "PK" : "", c.fk ? "FK" : "", c.unique && c.name !== "id" ? "UK" : ""].filter(Boolean).join(",");
      lines.push(`    ${c.type.replace(/\s.*$/, "").replace(/[^a-zA-Z0-9_]/g, "_")} ${c.name}${flags ? ` ${flags}` : ""}`);
    }
    lines.push("  }");
  }
  for (const r of Array.from(new Set(relationships))) lines.push(r);
  lines.push("```");
  lines.push("");
  lines.push("## Enumerations");
  lines.push("");
  for (const e of enums) lines.push(`- \`${e.enumName}\`: ${e.enumValues.map((v) => `\`${v}\``).join(", ")}`);
  lines.push("");
  lines.push("## Data dictionary");
  lines.push("");
  for (const t of docs) {
    lines.push(`### ${t.name}`);
    lines.push("");
    lines.push(TABLE_PURPOSE[t.name] ?? "");
    lines.push("");
    lines.push("| Column | Type | Null | Default | References |");
    lines.push("|---|---|---|---|---|");
    for (const c of t.columns) {
      const ref = c.fk ? `${c.fk.table}.${c.fk.column} (${c.fk.onDelete})` : "";
      lines.push(`| \`${c.name}\`${c.unique ? " (unique)" : ""} | ${c.type} | ${c.nullable ? "yes" : "no"} | ${c.defaultValue.replace(/\|/g, "\\|")} | ${ref} |`);
    }
    lines.push("");
  }

  const outPath = path.join(process.cwd(), "docs", "data-model.md");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"));
  console.log(`Wrote ${outPath} (${docs.length} tables, ${enums.length} enums)`);
}

main();
