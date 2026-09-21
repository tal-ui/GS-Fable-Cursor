import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { aiAuditLog, candidates, documents, skillSynonyms, skills, type ExtractionSuggestion } from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { extractDocumentText } from "../documents/service";
import { storage } from "../documents/storage";
import { createTask } from "../tasks";

type Taxonomy = { skillId: string; code: string; name: string; terms: string[] }[];

const LANGUAGE_WORDS: Record<string, string[]> = {
  en: ["english", "אנגלית"],
  he: ["hebrew", "עברית"],
  ar: ["arabic", "ערבית"],
  ru: ["russian", "רוסית"],
  fr: ["french", "צרפתית"],
  de: ["german", "גרמנית"],
  es: ["spanish", "ספרדית"],
  pt: ["portuguese"],
  am: ["amharic", "אמהרית"],
};
const MILITARY_ROLE_WORDS = ["infantry", "paratrooper", "combat medic", "sniper", "squad leader", "platoon commander", "company commander", "intelligence", "navy", "air force", "special forces", "combat engineer", "armored", "artillery", "military police", "logistics officer", "k9 handler", "border police", "close protection", "team leader"];
const CITIZENSHIP_WORDS: Record<string, string[]> = {
  IL: ["israeli citizen", "israeli citizenship", "citizenship: israel", "אזרח ישראלי"],
  US: ["us citizen", "american citizen", "u.s. citizen"],
  DE: ["german citizen", "german citizenship"],
  GB: ["british citizen", "uk citizen"],
  FR: ["french citizen"],
  UA: ["ukrainian citizen"],
  RU: ["russian citizen"],
};

export type ExtractionOutput = { suggestions: ExtractionSuggestion[]; provider: string; model: string | null; confidence: number };

function snippet(text: string, index: number, span = 60): string {
  return text.slice(Math.max(0, index - span), Math.min(text.length, index + span)).replace(/\s+/g, " ").trim();
}

/** Deterministic rule-based extractor. Used when no AI provider is configured or as a fallback. */
export function heuristicExtract(text: string, taxonomy: Taxonomy): ExtractionOutput {
  const suggestions: ExtractionSuggestion[] = [];
  const lower = text.toLowerCase();

  const email = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  if (email) suggestions.push({ field: "email", value: email[0].toLowerCase(), confidence: 0.95, evidence: snippet(text, email.index ?? 0) });
  const phone = text.match(/(\+?\d[\d\s().-]{7,}\d)/);
  if (phone) suggestions.push({ field: "phone", value: phone[0].replace(/[^\d+]/g, ""), confidence: 0.8, evidence: snippet(text, phone.index ?? 0) });

  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 3 && l.length < 60 && !/@|\d/.test(l));
  if (firstLine && /^[A-Za-z\u0590-\u05FF'\- ]+$/.test(firstLine) && firstLine.split(" ").length <= 4) {
    const parts = firstLine.split(" ");
    suggestions.push({ field: "firstName", value: parts[0], confidence: 0.55, evidence: firstLine });
    if (parts.length > 1) suggestions.push({ field: "lastName", value: parts.slice(1).join(" "), confidence: 0.55, evidence: firstLine });
  }

  const years = lower.match(/(\d{1,2})\+?\s*(years|yrs)\s*(of)?\s*(experience|exp)/);
  if (years) suggestions.push({ field: "yearsExperience", value: Number(years[1]), confidence: 0.7, evidence: snippet(text, years.index ?? 0) });

  for (const [code, words] of Object.entries(LANGUAGE_WORDS)) {
    const idx = words.map((w) => lower.indexOf(w)).find((i) => i >= 0);
    if (idx !== undefined && idx >= 0) {
      const ctx = lower.slice(idx, idx + 40);
      const proficiency = /native|mother tongue|שפת אם/.test(ctx) ? "native" : /fluent|שוטף/.test(ctx) ? "fluent" : /professional|working/.test(ctx) ? "professional" : /basic|elementary/.test(ctx) ? "basic" : "conversational";
      suggestions.push({ field: "language", value: { language: code, proficiency }, confidence: 0.7, evidence: snippet(text, idx) });
    }
  }

  for (const role of MILITARY_ROLE_WORDS) {
    const idx = lower.indexOf(role);
    if (idx >= 0) {
      suggestions.push({ field: "militaryRole", value: role.replace(/\b\w/g, (c) => c.toUpperCase()), confidence: 0.6, evidence: snippet(text, idx) });
      break;
    }
  }
  for (const [country, words] of Object.entries(CITIZENSHIP_WORDS)) {
    const idx = words.map((w) => lower.indexOf(w)).find((i) => i >= 0);
    if (idx !== undefined && idx >= 0) suggestions.push({ field: "citizenship", value: country, confidence: 0.75, evidence: snippet(text, idx) });
  }

  const seen = new Set<string>();
  for (const skill of taxonomy) {
    for (const term of [skill.name.toLowerCase(), ...skill.terms]) {
      if (term.length < 3) continue;
      const idx = lower.indexOf(term);
      if (idx >= 0 && !seen.has(skill.skillId)) {
        seen.add(skill.skillId);
        const ctx = lower.slice(Math.max(0, idx - 40), idx + term.length + 40);
        const proficiency = /expert|senior|lead|instructor/.test(ctx) ? "expert" : /advanced|extensive/.test(ctx) ? "advanced" : /basic|familiar/.test(ctx) ? "basic" : "intermediate";
        suggestions.push({
          field: "skill",
          value: { skillId: skill.skillId, skillName: skill.name, originalWording: text.substr(idx, term.length), proficiency },
          confidence: term === skill.name.toLowerCase() ? 0.8 : 0.65,
          evidence: snippet(text, idx),
        });
        break;
      }
    }
  }
  const confidence = suggestions.length ? suggestions.reduce((s, x) => s + x.confidence, 0) / suggestions.length : 0;
  return { suggestions, provider: "heuristic", model: null, confidence };
}

async function aiExtract(text: string, taxonomy: Taxonomy): Promise<ExtractionOutput | null> {
  if (!env.aiEnabled) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.INTEGRATION_TIMEOUT_MS * 3);
  try {
    const skillList = taxonomy.map((s) => `${s.skillId}|${s.name}`).join("\n");
    const res = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.AI_API_KEY}`, "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.AI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You extract structured facts from a CV for a staffing database. Return JSON {\"suggestions\":[{field,value,confidence,evidence}]}. Allowed fields: firstName, lastName, email, phone, yearsExperience, militaryRole, citizenship (ISO2), language ({language ISO639-1, proficiency in basic|conversational|professional|fluent|native}), skill ({skillId, skillName, originalWording, proficiency in basic|intermediate|advanced|expert}) using ONLY skill ids from the provided taxonomy. Confidence is 0-1. Evidence is the quoted source snippet. Never infer personality, health, religion, ethnicity or trustworthiness. Collect only placement-relevant facts.",
          },
          { role: "user", content: `TAXONOMY (id|name):\n${skillList}\n\nCV TEXT:\n${text.slice(0, 20_000)}` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI provider ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; model?: string };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { suggestions?: ExtractionSuggestion[] };
    const valid = (parsed.suggestions ?? []).filter((s) => s && typeof s.field === "string" && typeof s.confidence === "number");
    const ids = new Set(taxonomy.map((t) => t.skillId));
    const filtered = valid.filter((s) => s.field !== "skill" || ids.has((s.value as { skillId?: string })?.skillId ?? ""));
    const confidence = filtered.length ? filtered.reduce((s, x) => s + x.confidence, 0) / filtered.length : 0;
    return { suggestions: filtered, provider: "openai-compatible", model: data.model ?? env.AI_MODEL, confidence };
  } catch (error) {
    logger.warn("ai.extraction_failed_falling_back", { error: String(error) });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadTaxonomy(): Promise<Taxonomy> {
  const db = await getDb();
  const rows = await db
    .select({ skillId: skills.id, code: skills.code, name: skills.name, term: skillSynonyms.term })
    .from(skills)
    .leftJoin(skillSynonyms, and(eq(skillSynonyms.skillId, skills.id), eq(skillSynonyms.isDeleted, false)))
    .where(and(eq(skills.isActive, true), eq(skills.isDeleted, false)));
  const map = new Map<string, Taxonomy[number]>();
  for (const r of rows) {
    const entry = map.get(r.skillId) ?? { skillId: r.skillId, code: r.code, name: r.name, terms: [] };
    if (r.term) entry.terms.push(r.term.toLowerCase());
    map.set(r.skillId, entry);
  }
  return Array.from(map.values());
}

/** Job handler: extracts suggestions from a CV document and stores them for human review. */
export async function runCvExtractionJob(documentId: string, candidateId: string, actorId: string | null): Promise<Record<string, unknown>> {
  const db = await getDb();
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return { skipped: "document missing" };
  let text = doc.extractedText;
  if (!text) {
    const buffer = await storage.get(doc.storageKey);
    text = await extractDocumentText(buffer, doc.mimeType);
    if (text) await db.update(documents).set({ extractedText: text.slice(0, 200_000) }).where(eq(documents.id, doc.id));
  }
  if (!text) return { skipped: "no text" };

  const taxonomy = await loadTaxonomy();
  const started = Date.now();
  const output = (await aiExtract(text, taxonomy)) ?? heuristicExtract(text, taxonomy);
  await db.insert(aiAuditLog).values({
    purpose: "cv_extraction",
    provider: output.provider,
    model: output.model,
    entityType: "candidate",
    entityId: candidateId,
    input: { documentId, characters: text.length },
    output: { suggestions: output.suggestions.length, fields: output.suggestions.map((s) => s.field) },
    confidence: output.confidence.toFixed(3),
    latencyMs: Date.now() - started,
    status: "suggested",
    userId: actorId,
  });

  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!candidate) return { skipped: "candidate missing" };
  const pending = (candidate.extractionSuggestions ?? []).filter((s) => s.accepted !== null && s.accepted !== undefined);
  const merged = [...pending, ...output.suggestions.map((s) => ({ ...s, accepted: null }))];
  await db.update(candidates).set({ extractionSuggestions: merged, extractionReviewedAt: null }).where(eq(candidates.id, candidateId));

  const belowThreshold = output.suggestions.filter((s) => s.confidence < env.AI_CONFIDENCE_THRESHOLD).length;
  await createTask(db, {
    title: `Review ${output.suggestions.length} extracted facts for ${candidate.firstName} ${candidate.lastName}`,
    description: `${belowThreshold} suggestion(s) are below the ${Math.round(env.AI_CONFIDENCE_THRESHOLD * 100)}% confidence threshold and need human confirmation.`,
    type: "import_review",
    priority: "medium",
    dueAt: new Date(Date.now() + 48 * 3_600_000),
    ownerId: candidate.ownerId ?? actorId,
    candidateId,
    dedupeKey: `extract-review:${documentId}`,
    createdBy: actorId,
  });
  return { suggestions: output.suggestions.length, provider: output.provider };
}
