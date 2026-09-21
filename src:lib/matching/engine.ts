import type { MatchSnapshot } from "@/db/schema";
import type {
  CandidateFacts,
  MatchResult,
  MatchSettings,
  Requirement,
  RequisitionContext,
  RuleOutcome,
  SkillClaimFact,
} from "./types";

type RuleResult = MatchSnapshot["ruleResults"][number];
type Fact = MatchSnapshot["supportingFacts"][number];

const PROFICIENCY_ORDER = { basic: 1, intermediate: 2, advanced: 3, expert: 4 } as const;
const LANGUAGE_ORDER = { basic: 1, conversational: 2, professional: 3, fluent: 4, native: 5 } as const;
const WORK_ELIGIBLE_TYPES = new Set(["citizen", "permanent_resident", "work_permit"]);

export const DEFAULT_SETTINGS: Omit<MatchSettings, "now"> = { availabilityFreshnessDays: 30, verificationStaleDays: 365 };

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value === "object" && "amount" in value) return asNumber((value as { amount: unknown }).amount);
  return null;
}

function result(req: Requirement, outcome: RuleOutcome, reason: string, evidence?: RuleResult["evidence"]): RuleResult {
  return {
    requirementId: req.id,
    kind: req.kind,
    field: req.field,
    operator: req.operator,
    expected: req.value,
    outcome,
    reason,
    evidence: evidence ?? null,
  };
}

function claimIsFreshlyVerified(claim: SkillClaimFact, settings: MatchSettings): { ok: boolean; why: string } {
  if (claim.verificationStatus !== "verified") return { ok: false, why: `evidence ${claim.verificationStatus.replace("_", " ")}` };
  if (claim.expiresAt && new Date(claim.expiresAt) < settings.now) return { ok: false, why: `evidence expired ${claim.expiresAt}` };
  if (claim.reviewedAt && daysBetween(settings.now, new Date(claim.reviewedAt)) > settings.verificationStaleDays) {
    return { ok: false, why: `verification older than ${settings.verificationStaleDays} days` };
  }
  return { ok: true, why: "verified" };
}

function evaluateSkill(req: Requirement, c: CandidateFacts, settings: MatchSettings): RuleResult {
  const label = req.skillName ?? "skill";
  const claim = c.skillClaims.find((k) => k.skillId === req.skillId);
  if (!claim) return result(req, "fail", `No claim for ${label}`);
  if (claim.verificationStatus === "rejected") {
    return result(req, "fail", `${label}: evidence was rejected by reviewer`, {
      fact: `${label} (${claim.declaredProficiency})`,
      status: claim.verificationStatus,
      date: claim.reviewedAt,
    });
  }
  const evidence = { fact: `${label} (${claim.declaredProficiency})`, status: claim.verificationStatus, date: claim.reviewedAt };
  if (req.operator === "gte") {
    const minimum = String(req.value ?? "basic") as keyof typeof PROFICIENCY_ORDER;
    const need = PROFICIENCY_ORDER[minimum] ?? 1;
    if (PROFICIENCY_ORDER[claim.declaredProficiency] < need) {
      return result(req, "fail", `${label}: declared ${claim.declaredProficiency}, requires ${minimum}`, evidence);
    }
  }
  if (req.evidenceRequirement === "verified") {
    const fresh = claimIsFreshlyVerified(claim, settings);
    if (!fresh.ok) return result(req, "unknown", `${label}: ${fresh.why}; needs reviewer acceptance`, evidence);
    return result(req, "pass", `${label} verified${claim.reviewedAt ? ` on ${claim.reviewedAt.slice(0, 10)}` : ""}`, evidence);
  }
  return result(req, "pass", `${label} declared (${claim.declaredProficiency})`, evidence);
}

function evaluateLanguage(req: Requirement, c: CandidateFacts): RuleResult {
  const v = (req.value ?? {}) as { language?: string; minProficiency?: keyof typeof LANGUAGE_ORDER };
  const code = (v.language ?? String(req.value ?? "")).toLowerCase();
  const lang = c.languages.find((l) => l.language.toLowerCase() === code);
  if (!lang) return result(req, "fail", `No ${code.toUpperCase()} language claim`);
  const need = LANGUAGE_ORDER[v.minProficiency ?? "conversational"] ?? 2;
  const evidence = { fact: `${code.toUpperCase()} ${lang.proficiency}`, status: lang.verificationStatus, date: null };
  if (LANGUAGE_ORDER[lang.proficiency] < need) {
    return result(req, "fail", `${code.toUpperCase()}: ${lang.proficiency} below ${v.minProficiency ?? "conversational"}`, evidence);
  }
  if (req.evidenceRequirement === "verified" && lang.verificationStatus !== "verified") {
    return result(req, "unknown", `${code.toUpperCase()} proficiency not yet verified`, evidence);
  }
  return result(req, "pass", `${code.toUpperCase()} ${lang.proficiency}`, evidence);
}

function evaluateWorkAuthorization(req: Requirement, c: CandidateFacts, ctx: RequisitionContext): RuleResult {
  const v = req.value as { country?: string } | string | null;
  const country = (typeof v === "string" ? v : v?.country ?? ctx.locationCountry).toUpperCase();
  const auth = c.workAuthorizations.find((w) => w.country.toUpperCase() === country);
  const isCitizen = c.citizenships.map((x) => x.toUpperCase()).includes(country);
  if (!auth) {
    if (isCitizen) {
      return req.evidenceRequirement === "verified"
        ? result(req, "unknown", `Citizenship of ${country} declared; needs verified evidence of work authorisation`, {
            fact: `Citizenship ${country}`,
            status: "declared",
            date: null,
          })
        : result(req, "pass", `Citizen of ${country}`, { fact: `Citizenship ${country}`, status: "declared", date: null });
    }
    return result(req, "unknown", `No work authorisation record for ${country} (passport alone does not establish permission)`);
  }
  const evidence = { fact: `${auth.type.replace(/_/g, " ")} for ${country}`, status: auth.verificationStatus, date: auth.validUntil };
  if (!WORK_ELIGIBLE_TYPES.has(auth.type)) return result(req, "fail", `Not authorised to work in ${country} (${auth.type.replace(/_/g, " ")})`, evidence);
  if (auth.verificationStatus === "rejected") return result(req, "fail", `Work authorisation for ${country} rejected by reviewer`, evidence);
  const start = ctx.startDate ? new Date(ctx.startDate) : new Date();
  if (auth.validUntil && new Date(auth.validUntil) < start) {
    return result(req, "unknown", `Work authorisation for ${country} expires ${auth.validUntil} before start`, evidence);
  }
  if (req.evidenceRequirement === "verified" && auth.verificationStatus !== "verified") {
    return result(req, "unknown", `Work authorisation for ${country} awaiting verification`, evidence);
  }
  return result(req, "pass", `Authorised to work in ${country} (${auth.type.replace(/_/g, " ")})`, evidence);
}

function evaluateCitizenship(req: Requirement, c: CandidateFacts): RuleResult {
  const wanted = asStringArray(req.value).map((s) => s.toUpperCase());
  if (c.citizenships.length === 0) return result(req, "unknown", "Citizenship not recorded");
  const have = c.citizenships.map((s) => s.toUpperCase());
  const overlap = have.filter((x) => wanted.includes(x));
  const evidence = { fact: `Citizenship ${have.join(", ")}`, status: "declared", date: null };
  if (req.operator === "not_in") {
    return overlap.length === 0
      ? result(req, "pass", `Citizenship not in excluded list`, evidence)
      : result(req, "fail", `Citizenship ${overlap.join(", ")} is excluded`, evidence);
  }
  return overlap.length > 0
    ? result(req, "pass", `Citizenship ${overlap.join(", ")}`, evidence)
    : result(req, "fail", `Citizenship ${have.join(", ")} not in ${wanted.join(", ")}`, evidence);
}

function evaluateAvailabilityFrom(req: Requirement, c: CandidateFacts, ctx: RequisitionContext, settings: MatchSettings): RuleResult {
  const target = String(req.value ?? ctx.startDate ?? "");
  if (!target) return result(req, "unknown", "Requisition start date not set");
  if (!c.availability) return result(req, "unknown", "Availability not recorded");
  const a = c.availability;
  const evidence = { fact: `Available from ${a.availableFrom}${a.availableUntil ? ` to ${a.availableUntil}` : ""}`, status: "declared", date: a.lastConfirmedAt };
  const targetDate = new Date(target);
  const overlapping = c.activePlacements.find((p) => new Date(p.start) <= targetDate && (!p.end || new Date(p.end) >= targetDate));
  if (overlapping) {
    return result(req, "unknown", `Active placement ${overlapping.start} – ${overlapping.end ?? "open"} overlaps start date`, evidence);
  }
  if (new Date(a.availableFrom) > targetDate) return result(req, "fail", `Available from ${a.availableFrom}, after ${target}`, evidence);
  if (a.availableUntil && new Date(a.availableUntil) < targetDate) return result(req, "fail", `Availability ends ${a.availableUntil}`, evidence);
  if (!a.lastConfirmedAt || daysBetween(settings.now, new Date(a.lastConfirmedAt)) > settings.availabilityFreshnessDays) {
    return result(req, "unknown", `Availability not confirmed in the last ${settings.availabilityFreshnessDays} days`, evidence);
  }
  return result(req, "pass", `Available from ${a.availableFrom}, confirmed ${a.lastConfirmedAt.slice(0, 10)}`, evidence);
}

function evaluateDuration(req: Requirement, c: CandidateFacts): RuleResult {
  const weeks = asNumber(req.value);
  if (weeks === null) return result(req, "unknown", "Duration requirement not numeric");
  if (!c.availability) return result(req, "unknown", "Availability not recorded");
  const { minDurationWeeks, maxDurationWeeks } = c.availability;
  const evidence = { fact: `Accepts ${minDurationWeeks ?? "any"}–${maxDurationWeeks ?? "any"} weeks`, status: "declared", date: c.availability.lastConfirmedAt };
  if (maxDurationWeeks !== null && maxDurationWeeks < weeks) return result(req, "fail", `Maximum ${maxDurationWeeks} weeks, requires ${weeks}`, evidence);
  if (minDurationWeeks !== null && minDurationWeeks > weeks) return result(req, "fail", `Minimum ${minDurationWeeks} weeks, assignment is ${weeks}`, evidence);
  return result(req, "pass", `Accepts ${weeks}-week assignment`, evidence);
}

function evaluateRelocation(req: Requirement, c: CandidateFacts): RuleResult {
  const willing = c.availability?.willingToRelocate ?? c.willingToRelocate;
  if (willing === null || willing === undefined) return result(req, "unknown", "Relocation preference not recorded");
  const wanted = req.value === undefined || req.value === null ? true : Boolean(req.value);
  const evidence = { fact: willing ? "Willing to relocate" : "Not willing to relocate", status: "declared", date: null };
  return willing === wanted ? result(req, "pass", evidence.fact, evidence) : result(req, "fail", evidence.fact, evidence);
}

function evaluateCompensation(req: Requirement, c: CandidateFacts): RuleResult {
  const v = req.value as { amount?: unknown; currency?: string; period?: string; grossNet?: string } | null;
  const maxAmount = asNumber(v);
  if (maxAmount === null || !v?.currency || !v?.period) return result(req, "unknown", "Compensation ceiling incomplete (amount, currency, period)");
  const ask = c.compensation.find((x) => x.type === "expected") ?? c.compensation.find((x) => x.type === "minimum");
  if (!ask) return result(req, "unknown", "Candidate compensation expectation not recorded");
  const evidence = { fact: `Expects ${ask.amount} ${ask.currency}/${ask.period} ${ask.grossNet}`, status: "declared", date: null };
  const unitsMatch = ask.currency === v.currency && ask.period === v.period && (!v.grossNet || ask.grossNet === v.grossNet);
  if (!unitsMatch) {
    return result(req, "unknown", `Units differ: ${ask.currency}/${ask.period} ${ask.grossNet} vs ${v.currency}/${v.period} ${v.grossNet ?? ""}`.trim(), evidence);
  }
  return ask.amount <= maxAmount
    ? result(req, "pass", `Expectation ${ask.amount} within ceiling ${maxAmount} ${v.currency}/${v.period}`, evidence)
    : result(req, "fail", `Expectation ${ask.amount} exceeds ceiling ${maxAmount} ${v.currency}/${v.period}`, evidence);
}

function evaluateExperience(req: Requirement, c: CandidateFacts): RuleResult {
  const years = asNumber(req.value);
  if (years === null) return result(req, "unknown", "Experience requirement not numeric");
  if (c.yearsExperience === null) return result(req, "unknown", "Years of experience not recorded");
  const evidence = { fact: `${c.yearsExperience} years experience`, status: "declared", date: null };
  return c.yearsExperience >= years
    ? result(req, "pass", `${c.yearsExperience} years (requires ${years})`, evidence)
    : result(req, "fail", `${c.yearsExperience} years, requires ${years}`, evidence);
}

function evaluateMilitaryRole(req: Requirement, c: CandidateFacts): RuleResult {
  if (!c.militaryRole) return result(req, "unknown", "Military role not recorded");
  const wanted = asStringArray(req.value).map((s) => s.toLowerCase());
  const have = c.militaryRole.toLowerCase();
  const evidence = { fact: `Military role: ${c.militaryRole}`, status: "declared", date: null };
  const hit = wanted.some((w) => have.includes(w));
  return hit ? result(req, "pass", `Declared role matches ${wanted.join("/")}`, evidence) : result(req, "fail", `Role "${c.militaryRole}" not in ${wanted.join(", ")}`, evidence);
}

function evaluateLocation(req: Requirement, c: CandidateFacts): RuleResult {
  const wanted = asStringArray(req.value).map((s) => s.toUpperCase());
  const here = c.country?.toUpperCase() ?? null;
  const prefs = c.preferredCountries.map((s) => s.toUpperCase());
  if (!here && prefs.length === 0) return result(req, "unknown", "Location not recorded");
  const evidence = { fact: `Based in ${here ?? "unknown"}${prefs.length ? `, prefers ${prefs.join(", ")}` : ""}`, status: "declared", date: null };
  if ((here && wanted.includes(here)) || prefs.some((p) => wanted.includes(p))) return result(req, "pass", `Location compatible with ${wanted.join(", ")}`, evidence);
  return result(req, "fail", `Located in ${here ?? "unknown"}, not ${wanted.join(", ")}`, evidence);
}

export function evaluateRequirement(req: Requirement, c: CandidateFacts, ctx: RequisitionContext, settings: MatchSettings): RuleResult {
  switch (req.field) {
    case "skill":
    case "certification":
      return evaluateSkill(req, c, settings);
    case "language":
      return evaluateLanguage(req, c);
    case "work_authorization":
      return evaluateWorkAuthorization(req, c, ctx);
    case "citizenship":
      return evaluateCitizenship(req, c);
    case "availability_from":
      return evaluateAvailabilityFrom(req, c, ctx, settings);
    case "availability_duration_weeks":
      return evaluateDuration(req, c);
    case "relocation":
      return evaluateRelocation(req, c);
    case "compensation_max":
      return evaluateCompensation(req, c);
    case "experience_years":
      return evaluateExperience(req, c);
    case "military_role":
      return evaluateMilitaryRole(req, c);
    case "location_country":
      return evaluateLocation(req, c);
    default:
      return result(req, "unknown", `Unsupported requirement field ${String(req.field)}`);
  }
}

/** Validates a requisition's rules before matching runs; returns human-readable problems. */
export function validateRequirements(requirements: Requirement[]): string[] {
  const problems: string[] = [];
  for (const r of requirements) {
    if (r.kind === "mandatory" && !r.justification?.trim()) problems.push(`Mandatory rule on ${r.field} needs a business justification.`);
    if ((r.field === "skill" || r.field === "certification") && !r.skillId) problems.push(`Rule on ${r.field} must reference a taxonomy skill.`);
    const valueOptional =
      ["work_authorization", "availability_from", "relocation"].includes(r.field) ||
      ((r.field === "skill" || r.field === "certification") && r.operator === "exists");
    if ((r.value === undefined || r.value === null || r.value === "") && !valueOptional) {
      problems.push(`Rule on ${r.field} is missing a value.`);
    }
  }
  return problems;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function scoreComponents(ctx: RequisitionContext, c: CandidateFacts, rules: RuleResult[], settings: MatchSettings): MatchSnapshot["components"] {
  const skillReqs = ctx.requirements.filter((r) => r.field === "skill" || r.field === "certification");
  const skillResults = rules.filter((r) => r.field === "skill" || r.field === "certification");
  const totalSkillWeight = skillReqs.reduce((s, r) => s + r.weight, 0) || 1;
  const skillWeightPassed = skillResults.reduce((s, r) => {
    const req = skillReqs.find((q) => q.id === r.requirementId);
    const w = req?.weight ?? 1;
    return s + (r.outcome === "pass" ? w : r.outcome === "unknown" ? w * 0.5 : 0);
  }, 0);
  const skillCoverage = skillReqs.length ? clamp01(skillWeightPassed / totalSkillWeight) : 0.5;

  const matchedClaims = skillReqs
    .map((r) => c.skillClaims.find((k) => k.skillId === r.skillId))
    .filter((k): k is SkillClaimFact => Boolean(k));
  const proficiency = matchedClaims.length
    ? matchedClaims.reduce((s, k) => s + PROFICIENCY_ORDER[k.declaredProficiency] / 4 + (k.verificationStatus === "verified" ? 0.1 : 0), 0) / matchedClaims.length
    : 0;

  const expReq = ctx.requirements.find((r) => r.field === "experience_years");
  const expTarget = Math.max(asNumber(expReq?.value) ?? 5, 1);
  const experience = c.yearsExperience === null ? 0.3 : clamp01(c.yearsExperience / expTarget);

  const prefResults = rules.filter((r) => r.kind === "preferred" && r.field !== "skill" && r.field !== "certification");
  const prefReqs = ctx.requirements.filter((r) => r.kind === "preferred" && r.field !== "skill" && r.field !== "certification");
  const totalPrefWeight = prefReqs.reduce((s, r) => s + r.weight, 0) || 1;
  const prefPassed = prefResults.reduce((s, r) => {
    const w = prefReqs.find((q) => q.id === r.requirementId)?.weight ?? 1;
    return s + (r.outcome === "pass" ? w : r.outcome === "unknown" ? w * 0.4 : 0);
  }, 0);
  const preferences = prefReqs.length ? clamp01(prefPassed / totalPrefWeight) : 0.6;

  let freshness = 0;
  if (c.availability?.lastConfirmedAt) {
    const age = daysBetween(settings.now, new Date(c.availability.lastConfirmedAt));
    freshness = age <= settings.availabilityFreshnessDays ? 1 : clamp01(1 - (age - settings.availabilityFreshnessDays) / 150);
  }

  return [
    { name: "skills", weight: ctx.weights.skills, score: clamp01(skillCoverage), detail: `${skillResults.filter((r) => r.outcome === "pass").length}/${skillReqs.length} skill requirements met` },
    { name: "proficiency", weight: ctx.weights.proficiency, score: clamp01(proficiency), detail: matchedClaims.length ? `Average declared proficiency across ${matchedClaims.length} matched skills` : "No matched skills" },
    { name: "experience", weight: ctx.weights.experience, score: experience, detail: c.yearsExperience === null ? "Experience not recorded" : `${c.yearsExperience} years vs target ${expTarget}` },
    { name: "preferences", weight: ctx.weights.preferences, score: preferences, detail: `${prefResults.filter((r) => r.outcome === "pass").length}/${prefReqs.length} preferences met` },
    { name: "freshness", weight: ctx.weights.freshness, score: freshness, detail: c.availability?.lastConfirmedAt ? `Availability confirmed ${c.availability.lastConfirmedAt.slice(0, 10)}` : "Availability never confirmed" },
  ];
}

function supportingFacts(c: CandidateFacts, ctx: RequisitionContext): Fact[] {
  const facts: Fact[] = [];
  const wantedSkillIds = new Set(ctx.requirements.map((r) => r.skillId).filter(Boolean));
  for (const k of c.skillClaims) {
    if (wantedSkillIds.size && !wantedSkillIds.has(k.skillId)) continue;
    facts.push({ label: k.skillName, value: `${k.declaredProficiency}${k.yearsExperience ? `, ${k.yearsExperience}y` : ""}`, verification: k.verificationStatus, date: k.reviewedAt });
  }
  for (const w of c.workAuthorizations) {
    facts.push({ label: `Work authorisation ${w.country}`, value: w.type.replace(/_/g, " "), verification: w.verificationStatus, date: w.validUntil });
  }
  if (c.citizenships.length) facts.push({ label: "Citizenship", value: c.citizenships.join(", "), verification: "declared", date: null });
  if (c.availability) {
    facts.push({ label: "Availability", value: `from ${c.availability.availableFrom}${c.availability.availableUntil ? ` to ${c.availability.availableUntil}` : ""}`, verification: c.availability.lastConfirmedAt ? "confirmed" : "unconfirmed", date: c.availability.lastConfirmedAt });
  }
  const comp = c.compensation.find((x) => x.type === "expected");
  if (comp) facts.push({ label: "Expected compensation", value: `${comp.amount} ${comp.currency}/${comp.period} ${comp.grossNet}`, verification: "declared", date: null });
  for (const l of c.languages) facts.push({ label: `Language ${l.language.toUpperCase()}`, value: l.proficiency, verification: l.verificationStatus, date: null });
  if (c.militaryRole) facts.push({ label: "Military role", value: c.militaryRole, verification: "declared", date: null });
  return facts;
}

/** Evaluates one candidate against one requisition. Pure and deterministic. */
export function matchCandidate(ctx: RequisitionContext, c: CandidateFacts, settingsIn?: Partial<MatchSettings>): MatchResult {
  const settings: MatchSettings = { ...DEFAULT_SETTINGS, now: new Date(), ...settingsIn };
  const rules = ctx.requirements.map((r) => evaluateRequirement(r, c, ctx, settings));
  const mandatory = rules.filter((r) => r.kind === "mandatory");
  const eligibility: MatchSnapshot["eligibility"] = mandatory.some((r) => r.outcome === "fail")
    ? "ineligible"
    : mandatory.some((r) => r.outcome === "unknown")
      ? "review"
      : "eligible";
  const components = scoreComponents(ctx, c, rules, settings);
  const totalWeight = components.reduce((s, x) => s + x.weight, 0) || 1;
  const score = Math.round((components.reduce((s, x) => s + x.weight * x.score, 0) / totalWeight) * 1000) / 10;
  return {
    candidateId: c.id,
    candidateName: c.name,
    requirementVersion: ctx.requirementVersion,
    rankingVersion: ctx.rankingVersion,
    eligibility,
    score,
    components,
    ruleResults: rules,
    unmetPreferences: rules.filter((r) => r.kind === "preferred" && r.outcome !== "pass").map((r) => r.reason),
    supportingFacts: supportingFacts(c, ctx),
    computedAt: settings.now.toISOString(),
  };
}

export type RankedMatches = { eligible: MatchResult[]; review: MatchResult[]; ineligible: MatchResult[] };

/**
 * Optional re-ranker hook (e.g. semantic similarity). It may only reorder the eligible list;
 * it can never change eligibility or create facts.
 */
export type Reranker = (eligible: MatchResult[]) => MatchResult[];

export function rankCandidates(ctx: RequisitionContext, candidates: CandidateFacts[], settings?: Partial<MatchSettings>, rerank?: Reranker): RankedMatches {
  const results = candidates.map((c) => matchCandidate(ctx, c, settings));
  const byScore = (a: MatchResult, b: MatchResult) => b.score - a.score || a.candidateName.localeCompare(b.candidateName);
  let eligible = results.filter((r) => r.eligibility === "eligible").sort(byScore);
  if (rerank) {
    const reordered = rerank(eligible);
    const ids = new Set(eligible.map((e) => e.candidateId));
    if (reordered.length === eligible.length && reordered.every((r) => ids.has(r.candidateId))) eligible = reordered;
  }
  return {
    eligible,
    review: results.filter((r) => r.eligibility === "review").sort(byScore),
    ineligible: results.filter((r) => r.eligibility === "ineligible").sort(byScore),
  };
}
