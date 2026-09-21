import "server-only";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import {
  candidateAvailability,
  candidateCompensation,
  candidateLanguages,
  candidateSkillClaims,
  candidates,
  consents,
  importBatches,
  skillSynonyms,
  skills,
  sourceEvents,
  sources,
  users,
  type ImportDuplicateProposal,
  type ImportRowError,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { AppError, conflict, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { cleanText, normalizeEmail, normalizePhone } from "@/lib/sanitize";
import { logActivity } from "../activities";
import { enqueueJob } from "../jobs/queue";
import { visibilityScope } from "../scope";
import { createTask } from "../tasks";
import { CANDIDATE_IMPORT_FIELDS, autoMap, parseCsv } from "@/lib/imports/csv";

export { CANDIDATE_IMPORT_FIELDS, autoMap, parseCsv };
export type { ParsedCsv } from "@/lib/imports/csv";

type MappedRow = Record<string, string>;

function applyMapping(row: Record<string, string>, mapping: Record<string, string>): MappedRow {
  const out: MappedRow = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (!field) continue;
    const v = row[header];
    if (v !== undefined && v !== "") out[field] = v;
  }
  return out;
}

function validateRow(row: MappedRow, index: number): ImportRowError[] {
  const errors: ImportRowError[] = [];
  if (!row.firstName) errors.push({ row: index, message: "First name is missing" });
  if (!row.lastName) errors.push({ row: index, message: "Last name is missing" });
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push({ row: index, message: `Invalid email "${row.email}"` });
  if (row.country && row.country.trim().length !== 2) errors.push({ row: index, message: `Country must be a 2-letter code (got "${row.country}")` });
  if (row.availableFrom && !/^\d{4}-\d{2}-\d{2}$/.test(row.availableFrom)) errors.push({ row: index, message: `Available-from must be YYYY-MM-DD (got "${row.availableFrom}")` });
  if (row.yearsExperience && Number.isNaN(Number(row.yearsExperience))) errors.push({ row: index, message: `Years experience is not a number ("${row.yearsExperience}")` });
  if (row.expectedAmount && Number.isNaN(Number(row.expectedAmount.replace(/[,\s]/g, "")))) errors.push({ row: index, message: `Expected pay is not a number ("${row.expectedAmount}")` });
  if (row.expectedPeriod && !["hourly", "daily", "weekly", "monthly", "annual"].includes(row.expectedPeriod.toLowerCase())) errors.push({ row: index, message: `Unknown pay period "${row.expectedPeriod}"` });
  return errors;
}

/**
 * Parses, maps, validates and de-duplicates a CSV, then stores the batch for review.
 * Nothing is written to candidate tables until the batch is committed.
 */
export async function previewImport(user: CurrentUser, input: { filename: string; csvText: string; sourceId: string | null; mapping?: Record<string, string> }) {
  const db = await getDb();
  const parsed = parseCsv(input.csvText);
  if (parsed.rows.length === 0) throw new AppError("validation", "The file has no data rows.");
  const mapping = input.mapping && Object.keys(input.mapping).length ? input.mapping : autoMap(parsed.headers);
  const mappedFields = new Set(Object.values(mapping));
  for (const f of CANDIDATE_IMPORT_FIELDS.filter((x) => x.required)) {
    if (!mappedFields.has(f.key)) throw new AppError("validation", `Map a column to "${f.label}" before previewing.`);
  }
  const errors: ImportRowError[] = [...parsed.parseErrors.map((m, i) => ({ row: -1 - i, message: m }))];
  const mappedRows = parsed.rows.map((r) => applyMapping(r, mapping));
  mappedRows.forEach((r, i) => errors.push(...validateRow(r, i)));

  const emails = mappedRows.map((r) => normalizeEmail(r.email)).filter((x): x is string => Boolean(x));
  const phones = mappedRows.map((r) => normalizePhone(r.phone, r.country)).filter((x): x is string => Boolean(x));
  const existing =
    emails.length || phones.length
      ? await db
          .select({ id: candidates.id, firstName: candidates.firstName, lastName: candidates.lastName, email: candidates.email, phoneNormalized: candidates.phoneNormalized })
          .from(candidates)
          .where(and(eq(candidates.isDeleted, false), or(emails.length ? inArray(candidates.email, emails) : undefined, phones.length ? inArray(candidates.phoneNormalized, phones) : undefined)))
      : [];
  const byEmail = new Map(existing.filter((e) => e.email).map((e) => [e.email!, e]));
  const byPhone = new Map(existing.filter((e) => e.phoneNormalized).map((e) => [e.phoneNormalized!, e]));
  const duplicates: ImportDuplicateProposal[] = [];
  const seenInFile = new Map<string, number>();
  mappedRows.forEach((r, i) => {
    const email = normalizeEmail(r.email);
    const phone = normalizePhone(r.phone, r.country);
    const hit = (email && byEmail.get(email)) || (phone && byPhone.get(phone)) || null;
    if (hit) {
      const matchedOn = [email && hit.email === email ? "email" : null, phone && hit.phoneNormalized === phone ? "phone" : null].filter((x): x is string => Boolean(x));
      duplicates.push({ row: i, existingCandidateId: hit.id, existingLabel: `${hit.firstName} ${hit.lastName}`, matchedOn, decision: "merge" });
    }
    const fileKey = email ?? phone;
    if (fileKey) {
      if (seenInFile.has(fileKey)) errors.push({ row: i, message: `Duplicate of row ${seenInFile.get(fileKey)! + 1} inside the file (same ${email ? "email" : "phone"})` });
      else seenInFile.set(fileKey, i);
    }
  });

  const [batch] = await db
    .insert(importBatches)
    .values({
      entity: "candidates",
      sourceId: input.sourceId,
      filename: cleanText(input.filename) ?? "import.csv",
      status: "previewed",
      mapping,
      rows: parsed.rows,
      totalRows: parsed.rows.length,
      errorRows: new Set(errors.filter((e) => e.row >= 0).map((e) => e.row)).size,
      duplicateRows: duplicates.length,
      errors,
      duplicates,
      createdBy: user.id,
    })
    .returning();
  return batch!;
}

export async function updateDuplicateDecisions(user: CurrentUser, batchId: string, decisions: { row: number; decision: "merge" | "create" | "skip" }[]) {
  const db = await getDb();
  const batch = await getImportBatch(user, batchId);
  if (batch.status !== "previewed") throw conflict("Only previewed batches can be edited.");
  const map = new Map(decisions.map((d) => [d.row, d.decision]));
  const duplicates = batch.duplicates.map((d) => ({ ...d, decision: map.get(d.row) ?? d.decision ?? "merge" }));
  const [row] = await db.update(importBatches).set({ duplicates }).where(eq(importBatches.id, batchId)).returning();
  return row!;
}

export async function startImport(user: CurrentUser, batchId: string) {
  const db = await getDb();
  const batch = await getImportBatch(user, batchId);
  if (batch.status !== "previewed") throw conflict(`This batch is already ${batch.status}.`);
  await db.update(importBatches).set({ status: "importing" }).where(eq(importBatches.id, batchId));
  await enqueueJob(db, { type: "import:commit", payload: { batchId, actorId: user.id }, idempotencyKey: `import:${batchId}`, ownerId: user.id });
}

async function resolveSkill(db: DbOrTx, cache: Map<string, string | null>, raw: string): Promise<string | null> {
  const term = raw.trim().toLowerCase();
  if (!term) return null;
  if (cache.has(term)) return cache.get(term)!;
  // ilike without wildcards is a case-insensitive equality match.
  const [byName] = await db
    .select({ id: skills.id })
    .from(skills)
    .where(and(eq(skills.isDeleted, false), or(eq(skills.code, term), ilike(skills.name, raw.trim()))))
    .limit(1);
  let id = byName?.id ?? null;
  if (!id) {
    const [bySyn] = await db.select({ id: skillSynonyms.skillId }).from(skillSynonyms).where(eq(skillSynonyms.term, term)).limit(1);
    id = bySyn?.id ?? null;
  }
  cache.set(term, id);
  return id;
}

/** Job handler: commits a previewed batch row by row, honouring duplicate decisions. Idempotent per batch. */
export async function commitImportBatch(batchId: string, actorId: string | null): Promise<Record<string, unknown>> {
  const db = await getDb();
  const batch = await db.query.importBatches.findFirst({ where: eq(importBatches.id, batchId) });
  if (!batch) return { skipped: "batch missing" };
  if (batch.status === "completed" || batch.status === "rolled_back") return { skipped: `already ${batch.status}` };
  const errorRows = new Set(batch.errors.filter((e) => e.row >= 0).map((e) => e.row));
  const dupByRow = new Map(batch.duplicates.map((d) => [d.row, d]));
  const skillCache = new Map<string, string | null>();
  const created: string[] = [...batch.createdRecordIds];
  const errors: ImportRowError[] = [...batch.errors];
  let imported = batch.importedRows;
  let merged = 0;
  let skipped = 0;
  const now = new Date();
  const source = batch.sourceId ? await db.query.sources.findFirst({ where: eq(sources.id, batch.sourceId) }) : null;

  for (let i = 0; i < batch.rows.length; i += 1) {
    if (errorRows.has(i)) {
      skipped += 1;
      continue;
    }
    const row = applyMapping(batch.rows[i]!, batch.mapping);
    const dup = dupByRow.get(i);
    try {
      await db.transaction(async (tx) => {
        if (dup && dup.decision === "skip") {
          skipped += 1;
          return;
        }
        if (dup && (dup.decision ?? "merge") === "merge") {
          const existing = await tx.query.candidates.findFirst({ where: eq(candidates.id, dup.existingCandidateId) });
          if (existing) {
            const fill: Partial<typeof candidates.$inferInsert> = {};
            if (!existing.email && row.email) fill.email = normalizeEmail(row.email);
            if (!existing.phone && row.phone) {
              fill.phone = row.phone;
              fill.phoneNormalized = normalizePhone(row.phone, row.country ?? existing.country);
            }
            if (!existing.city && row.city) fill.city = row.city;
            if (!existing.country && row.country) fill.country = row.country.toUpperCase();
            if (!existing.headline && row.headline) fill.headline = row.headline;
            if (!existing.militaryRole && row.militaryRole) fill.militaryRole = row.militaryRole;
            if (Object.keys(fill).length) await tx.update(candidates).set(fill).where(eq(candidates.id, existing.id));
            await tx.insert(sourceEvents).values({ candidateId: existing.id, sourceId: batch.sourceId, eventType: "re_referred", occurredAt: now, importBatchId: batch.id, referrerName: row.referrerName ?? null, details: { row: i, mergedFields: Object.keys(fill) }, createdBy: actorId });
            await addSkillsAndLanguages(tx, existing.id, row, skillCache, actorId, true);
            await logActivity(tx, { type: "system", subject: `Import "${batch.filename}" row ${i + 1} merged into this record (${Object.keys(fill).length} fields filled)`, candidateId: existing.id, actorId });
            merged += 1;
            return;
          }
        }
        const [candidate] = await tx
          .insert(candidates)
          .values({
            firstName: cleanText(row.firstName)!,
            lastName: cleanText(row.lastName)!,
            email: normalizeEmail(row.email),
            phone: row.phone ?? null,
            phoneNormalized: normalizePhone(row.phone, row.country),
            city: cleanText(row.city),
            country: row.country ? row.country.toUpperCase() : null,
            citizenships: row.citizenships ? row.citizenships.split(/[,;]/).map((s) => s.trim().toUpperCase()).filter(Boolean) : [],
            headline: cleanText(row.headline),
            summary: cleanText(row.summary),
            militaryRole: cleanText(row.militaryRole),
            militaryUnit: cleanText(row.militaryUnit),
            yearsExperience: row.yearsExperience ? Number(row.yearsExperience).toFixed(1) : null,
            willingToRelocate: row.willingToRelocate ? /^(y|yes|true|1|כן)$/i.test(row.willingToRelocate) : null,
            externalRef: cleanText(row.externalRef),
            status: "new",
            ownerId: actorId,
            primarySourceId: batch.sourceId,
            createdBy: actorId,
          })
          .returning();
        const id = candidate!.id;
        created.push(id);
        await tx.insert(sourceEvents).values({ candidateId: id, sourceId: batch.sourceId, eventType: "imported", occurredAt: now, importBatchId: batch.id, referrerName: row.referrerName ?? null, details: { row: i, source: source?.name ?? null }, createdBy: actorId });
        // Imported records carry processing permission from the import owner's assessment only; contact permission stays unknown (restricted).
        await tx.insert(consents).values({ candidateId: id, scope: "process_profile", noticeVersion: "import-legacy", grantedAt: now, channel: "import", evidence: `Imported from ${batch.filename} (batch ${batch.id})`, recordedById: actorId, createdBy: actorId });
        if (row.availableFrom) {
          await tx.insert(candidateAvailability).values({ candidateId: id, availableFrom: row.availableFrom, isCurrent: true, willingToRelocate: true, lastConfirmedAt: null, notes: "Imported; not yet confirmed", createdBy: actorId });
        }
        if (row.expectedAmount) {
          await tx.insert(candidateCompensation).values({
            candidateId: id,
            type: "expected",
            amount: Number(row.expectedAmount.replace(/[,\s]/g, "")).toFixed(2),
            currency: (row.expectedCurrency ?? "USD").toUpperCase().slice(0, 3),
            period: ((row.expectedPeriod ?? "monthly").toLowerCase() as typeof candidateCompensation.$inferInsert.period) ?? "monthly",
            grossNet: "gross",
            createdBy: actorId,
          });
        }
        await addSkillsAndLanguages(tx, id, row, skillCache, actorId, false);
        imported += 1;
      });
    } catch (error) {
      errors.push({ row: i, message: error instanceof Error ? error.message.slice(0, 200) : String(error) });
      logger.warn("import.row_failed", { batchId, row: i, error: String(error) });
    }
  }
  await db
    .update(importBatches)
    .set({ status: "completed", importedRows: imported, errorRows: new Set(errors.filter((e) => e.row >= 0).map((e) => e.row)).size, errors, createdRecordIds: created, completedAt: new Date() })
    .where(eq(importBatches.id, batchId));
  await createTask(db, {
    title: `Review import "${batch.filename}": ${imported} created, ${merged} merged, ${errors.length} errors`,
    description: "Check a sample of imported records and every rejected row. Records with unclear permission remain restricted until reviewed.",
    type: "import_review",
    priority: errors.length ? "high" : "medium",
    dueAt: new Date(Date.now() + 48 * 3_600_000),
    ownerId: actorId,
    dedupeKey: `import-review:${batchId}`,
    createdBy: actorId,
  });
  await recordAudit(db, { entityType: "import_batch", entityId: batchId, action: "create", actorId, after: { imported, merged, skipped, errors: errors.length } });
  return { imported, merged, skipped, errors: errors.length };
}

async function addSkillsAndLanguages(tx: DbOrTx, candidateId: string, row: MappedRow, skillCache: Map<string, string | null>, actorId: string | null, onlyNew: boolean) {
  if (row.skills) {
    for (const raw of row.skills.split(/[;|]/).map((s) => s.trim()).filter(Boolean)) {
      const skillId = await resolveSkill(tx, skillCache, raw);
      if (!skillId) continue;
      if (onlyNew) {
        const exists = await tx.query.candidateSkillClaims.findFirst({ where: and(eq(candidateSkillClaims.candidateId, candidateId), eq(candidateSkillClaims.skillId, skillId), eq(candidateSkillClaims.isDeleted, false)) });
        if (exists) continue;
      }
      await tx.insert(candidateSkillClaims).values({ candidateId, skillId, originalWording: raw, declaredProficiency: "intermediate", origin: "imported", verificationStatus: "unverified", createdBy: actorId }).onConflictDoNothing();
    }
  }
  if (row.languages) {
    for (const part of row.languages.split(/[;|,]/).map((s) => s.trim()).filter(Boolean)) {
      const [code, level] = part.split(":").map((s) => s.trim().toLowerCase());
      if (!code || code.length !== 2) continue;
      const proficiency = (["basic", "conversational", "professional", "fluent", "native"].includes(level ?? "") ? level : "professional") as typeof candidateLanguages.$inferInsert.proficiency;
      await tx.insert(candidateLanguages).values({ candidateId, language: code, proficiency, createdBy: actorId }).onConflictDoNothing();
    }
  }
}

/** Rolls back a completed batch by soft-deleting the records it created. Merged records are kept (their source events remain). */
export async function rollbackImport(user: CurrentUser, batchId: string) {
  const db = await getDb();
  const batch = await getImportBatch(user, batchId);
  if (batch.status !== "completed") throw conflict("Only completed batches can be rolled back.");
  if (batch.createdRecordIds.length) {
    await db.update(candidates).set({ isDeleted: true }).where(inArray(candidates.id, batch.createdRecordIds));
  }
  await db.update(importBatches).set({ status: "rolled_back", rolledBackAt: new Date() }).where(eq(importBatches.id, batchId));
  await recordAudit(db, { entityType: "import_batch", entityId: batchId, action: "delete", actorId: user.id, before: { created: batch.createdRecordIds.length }, note: "Import rolled back" });
  return batch.createdRecordIds.length;
}

/** Batches follow the data sharing model like every other record; the importer is the owner. */
export async function listImportBatches(user: CurrentUser) {
  const db = await getDb();
  const scope = await visibilityScope(user, importBatches.createdBy, importBatches.isDeleted);
  return db
    .select({ batch: importBatches, sourceName: sources.name, createdByName: users.name })
    .from(importBatches)
    .leftJoin(sources, eq(sources.id, importBatches.sourceId))
    .leftJoin(users, eq(users.id, importBatches.createdBy))
    .where(scope)
    .orderBy(desc(importBatches.createdAt))
    .limit(50);
}

export async function getImportBatch(user: CurrentUser, id: string) {
  const db = await getDb();
  const scope = await visibilityScope(user, importBatches.createdBy, importBatches.isDeleted);
  const row = await db.query.importBatches.findFirst({ where: and(eq(importBatches.id, id), scope) });
  if (!row) throw notFound("Import batch");
  return row;
}
