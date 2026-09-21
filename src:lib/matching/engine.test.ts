import { describe, expect, it } from "vitest";
import { matchCandidate, rankCandidates, validateRequirements } from "./engine";
import type { CandidateFacts, Requirement, RequisitionContext } from "./types";

const NOW = new Date("2026-09-20T12:00:00Z");

function req(partial: Partial<Requirement> & Pick<Requirement, "field" | "kind">): Requirement {
  return {
    id: partial.id ?? `${partial.field}-${partial.kind}`,
    operator: partial.operator ?? "exists",
    value: partial.value,
    skillId: partial.skillId ?? null,
    skillName: partial.skillName ?? null,
    evidenceRequirement: partial.evidenceRequirement ?? "declared",
    justification: partial.justification ?? "test",
    weight: partial.weight ?? 1,
    ...partial,
  };
}

function ctx(requirements: Requirement[], overrides: Partial<RequisitionContext> = {}): RequisitionContext {
  return {
    id: "req-1",
    title: "Close protection officer",
    locationCountry: "DE",
    startDate: "2026-11-01",
    durationWeeks: 12,
    requirementVersion: 1,
    rankingVersion: "baseline-v1",
    weights: { skills: 0.4, proficiency: 0.15, experience: 0.15, preferences: 0.2, freshness: 0.1 },
    requirements,
    ...overrides,
  };
}

function candidate(overrides: Partial<CandidateFacts> = {}): CandidateFacts {
  return {
    id: "cand-1",
    name: "Dana Levi",
    status: "active",
    country: "IL",
    citizenships: ["IL"],
    preferredCountries: ["DE"],
    willingToRelocate: true,
    yearsExperience: 6,
    militaryRole: "Infantry squad leader",
    workAuthorizations: [{ country: "DE", type: "work_permit", verificationStatus: "verified", validUntil: "2027-12-31" }],
    skillClaims: [
      {
        skillId: "skill-cp",
        skillCode: "close_protection",
        skillName: "Close protection",
        declaredProficiency: "advanced",
        yearsExperience: 4,
        verificationStatus: "verified",
        reviewedAt: "2026-08-01T00:00:00Z",
        expiresAt: null,
      },
    ],
    languages: [{ language: "en", proficiency: "professional", verificationStatus: "unverified" }],
    availability: {
      availableFrom: "2026-10-01",
      availableUntil: null,
      minDurationWeeks: 4,
      maxDurationWeeks: 26,
      willingToRelocate: true,
      lastConfirmedAt: "2026-09-10T00:00:00Z",
    },
    compensation: [{ type: "expected", amount: 4500, currency: "EUR", period: "monthly", grossNet: "gross" }],
    activePlacements: [],
    ...overrides,
  };
}

describe("matchCandidate eligibility", () => {
  it("is eligible when every mandatory rule passes", () => {
    const r = matchCandidate(
      ctx([
        req({ field: "skill", kind: "mandatory", skillId: "skill-cp", skillName: "Close protection", evidenceRequirement: "verified" }),
        req({ field: "work_authorization", kind: "mandatory", value: { country: "DE" }, evidenceRequirement: "verified" }),
        req({ field: "availability_from", kind: "mandatory", value: "2026-11-01" }),
      ]),
      candidate(),
      { now: NOW },
    );
    expect(r.eligibility).toBe("eligible");
    expect(r.ruleResults.every((x) => x.outcome === "pass")).toBe(true);
    expect(r.score).toBeGreaterThan(50);
  });

  it("fails when a mandatory skill is missing and never silently passes", () => {
    const r = matchCandidate(ctx([req({ field: "skill", kind: "mandatory", skillId: "skill-medic", skillName: "Combat medic" })]), candidate(), { now: NOW });
    expect(r.eligibility).toBe("ineligible");
    expect(r.ruleResults[0]!.reason).toContain("No claim for Combat medic");
  });

  it("routes unverified evidence to review instead of passing", () => {
    const c = candidate();
    c.skillClaims[0]!.verificationStatus = "pending_review";
    const r = matchCandidate(ctx([req({ field: "skill", kind: "mandatory", skillId: "skill-cp", skillName: "Close protection", evidenceRequirement: "verified" })]), c, { now: NOW });
    expect(r.eligibility).toBe("review");
    expect(r.ruleResults[0]!.outcome).toBe("unknown");
  });

  it("treats expired evidence as unknown", () => {
    const c = candidate();
    c.skillClaims[0]!.expiresAt = "2026-01-01";
    const r = matchCandidate(ctx([req({ field: "certification", kind: "mandatory", skillId: "skill-cp", skillName: "Close protection", evidenceRequirement: "verified" })]), c, { now: NOW });
    expect(r.eligibility).toBe("review");
    expect(r.ruleResults[0]!.reason).toContain("expired");
  });

  it("does not treat a passport or citizenship as work authorisation when verified evidence is required", () => {
    const c = candidate({ workAuthorizations: [], citizenships: ["DE"] });
    const r = matchCandidate(ctx([req({ field: "work_authorization", kind: "mandatory", value: { country: "DE" }, evidenceRequirement: "verified" })]), c, { now: NOW });
    expect(r.eligibility).toBe("review");
  });

  it("fails candidates who need sponsorship for the destination", () => {
    const c = candidate({ workAuthorizations: [{ country: "DE", type: "visa_sponsorship_required", verificationStatus: "verified", validUntil: null }] });
    const r = matchCandidate(ctx([req({ field: "work_authorization", kind: "mandatory", value: { country: "DE" } })]), c, { now: NOW });
    expect(r.eligibility).toBe("ineligible");
  });

  it("marks stale availability as unknown", () => {
    const c = candidate();
    c.availability!.lastConfirmedAt = "2026-05-01T00:00:00Z";
    const r = matchCandidate(ctx([req({ field: "availability_from", kind: "mandatory", value: "2026-11-01" })]), c, { now: NOW });
    expect(r.eligibility).toBe("review");
    expect(r.ruleResults[0]!.reason).toContain("not confirmed");
  });

  it("flags overlapping active placements for review", () => {
    const c = candidate({ activePlacements: [{ start: "2026-10-15", end: "2026-12-15" }] });
    const r = matchCandidate(ctx([req({ field: "availability_from", kind: "mandatory", value: "2026-11-01" })]), c, { now: NOW });
    expect(r.eligibility).toBe("review");
    expect(r.ruleResults[0]!.reason).toContain("overlaps");
  });

  it("never compares compensation in different units", () => {
    const r = matchCandidate(
      ctx([req({ field: "compensation_max", kind: "mandatory", operator: "lte", value: { amount: 200, currency: "USD", period: "daily", grossNet: "gross" } })]),
      candidate(),
      { now: NOW },
    );
    expect(r.ruleResults[0]!.outcome).toBe("unknown");
    expect(r.ruleResults[0]!.reason).toContain("Units differ");
  });

  it("compares compensation when units match", () => {
    const over = matchCandidate(
      ctx([req({ field: "compensation_max", kind: "mandatory", operator: "lte", value: { amount: 4000, currency: "EUR", period: "monthly", grossNet: "gross" } })]),
      candidate(),
      { now: NOW },
    );
    expect(over.eligibility).toBe("ineligible");
    const within = matchCandidate(
      ctx([req({ field: "compensation_max", kind: "mandatory", operator: "lte", value: { amount: 5000, currency: "EUR", period: "monthly", grossNet: "gross" } })]),
      candidate(),
      { now: NOW },
    );
    expect(within.eligibility).toBe("eligible");
  });

  it("preferred rules never affect eligibility but appear as unmet preferences", () => {
    const r = matchCandidate(
      ctx([
        req({ field: "skill", kind: "mandatory", skillId: "skill-cp", skillName: "Close protection" }),
        req({ field: "language", kind: "preferred", value: { language: "de", minProficiency: "conversational" } }),
      ]),
      candidate(),
      { now: NOW },
    );
    expect(r.eligibility).toBe("eligible");
    expect(r.unmetPreferences).toHaveLength(1);
  });

  it("every stated reason is traceable to a stored fact", () => {
    const r = matchCandidate(
      ctx([
        req({ field: "skill", kind: "mandatory", skillId: "skill-cp", skillName: "Close protection", evidenceRequirement: "verified" }),
        req({ field: "experience_years", kind: "preferred", operator: "gte", value: 5 }),
      ]),
      candidate(),
      { now: NOW },
    );
    for (const rule of r.ruleResults.filter((x) => x.outcome === "pass")) expect(rule.evidence).not.toBeNull();
    expect(r.supportingFacts.some((f) => f.label === "Close protection" && f.verification === "verified")).toBe(true);
  });
});

describe("rankCandidates", () => {
  const requirements = [
    req({ field: "skill", kind: "mandatory", skillId: "skill-cp", skillName: "Close protection" }),
    req({ field: "experience_years", kind: "preferred", operator: "gte", value: 5, weight: 2 }),
  ];

  it("separates eligible, review and ineligible lists and sorts by score", () => {
    const strong = candidate({ id: "a", name: "A" });
    const weak = candidate({ id: "b", name: "B", yearsExperience: 1 });
    const pending = candidate({ id: "c", name: "C" });
    pending.skillClaims[0]!.verificationStatus = "pending_review";
    const none = candidate({ id: "d", name: "D", skillClaims: [] });
    const ranked = rankCandidates(
      ctx([{ ...requirements[0]!, evidenceRequirement: "verified" }, requirements[1]!]),
      [weak, none, pending, strong],
      { now: NOW },
    );
    expect(ranked.eligible.map((r) => r.candidateId)).toEqual(["a", "b"]);
    expect(ranked.review.map((r) => r.candidateId)).toEqual(["c"]);
    expect(ranked.ineligible.map((r) => r.candidateId)).toEqual(["d"]);
  });

  it("lets a reranker reorder eligible results but not change membership", () => {
    const a = candidate({ id: "a", name: "A" });
    const b = candidate({ id: "b", name: "B", yearsExperience: 1 });
    const ranked = rankCandidates(ctx(requirements), [a, b], { now: NOW }, (list) => [...list].reverse());
    expect(ranked.eligible.map((r) => r.candidateId)).toEqual(["b", "a"]);
    const tampered = rankCandidates(ctx(requirements), [a, b], { now: NOW }, (list) => list.slice(0, 1));
    expect(tampered.eligible).toHaveLength(2);
  });
});

describe("validateRequirements", () => {
  it("requires a justification for mandatory rules and a skill reference for skill rules", () => {
    const problems = validateRequirements([
      req({ field: "skill", kind: "mandatory", justification: "", skillId: null }),
      req({ field: "experience_years", kind: "preferred", operator: "gte", value: 3 }),
    ]);
    expect(problems).toHaveLength(2);
  });
});
