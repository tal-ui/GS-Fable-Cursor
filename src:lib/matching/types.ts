import type { MatchSnapshot } from "@/db/schema";

export type RuleOutcome = "pass" | "fail" | "unknown";

export type Requirement = {
  id: string;
  kind: "mandatory" | "preferred";
  field:
    | "skill"
    | "language"
    | "work_authorization"
    | "citizenship"
    | "availability_from"
    | "availability_duration_weeks"
    | "relocation"
    | "compensation_max"
    | "experience_years"
    | "military_role"
    | "certification"
    | "location_country";
  operator: "equals" | "not_equals" | "gte" | "lte" | "in" | "not_in" | "contains" | "before" | "after" | "exists";
  value: unknown;
  skillId?: string | null;
  skillName?: string | null;
  evidenceRequirement: "none" | "declared" | "verified";
  justification?: string | null;
  weight: number;
};

export type RequisitionContext = {
  id: string;
  title: string;
  locationCountry: string;
  startDate: string | null;
  durationWeeks: number | null;
  requirementVersion: number;
  requirements: Requirement[];
  rankingVersion: string;
  weights: { skills: number; proficiency: number; experience: number; preferences: number; freshness: number };
};

export type SkillClaimFact = {
  skillId: string;
  skillCode: string;
  skillName: string;
  declaredProficiency: "basic" | "intermediate" | "advanced" | "expert";
  yearsExperience: number | null;
  verificationStatus: "unverified" | "pending_review" | "verified" | "rejected" | "expired";
  reviewedAt: string | null;
  expiresAt: string | null;
};

export type CandidateFacts = {
  id: string;
  name: string;
  status: string;
  country: string | null;
  citizenships: string[];
  preferredCountries: string[];
  willingToRelocate: boolean | null;
  yearsExperience: number | null;
  militaryRole: string | null;
  workAuthorizations: {
    country: string;
    type: "citizen" | "permanent_resident" | "work_permit" | "visa_sponsorship_required" | "none";
    verificationStatus: "unverified" | "pending_review" | "verified" | "rejected" | "expired";
    validUntil: string | null;
  }[];
  skillClaims: SkillClaimFact[];
  languages: {
    language: string;
    proficiency: "basic" | "conversational" | "professional" | "fluent" | "native";
    verificationStatus: "unverified" | "pending_review" | "verified" | "rejected" | "expired";
  }[];
  availability: {
    availableFrom: string;
    availableUntil: string | null;
    minDurationWeeks: number | null;
    maxDurationWeeks: number | null;
    willingToRelocate: boolean;
    lastConfirmedAt: string | null;
  } | null;
  compensation: {
    type: "expected" | "minimum" | "current" | "offered";
    amount: number;
    currency: string;
    period: "hourly" | "daily" | "weekly" | "monthly" | "annual";
    grossNet: "gross" | "net";
  }[];
  activePlacements: { start: string; end: string | null }[];
};

export type MatchSettings = {
  availabilityFreshnessDays: number;
  verificationStaleDays: number;
  now: Date;
};

export type MatchResult = MatchSnapshot & { candidateId: string; candidateName: string };
