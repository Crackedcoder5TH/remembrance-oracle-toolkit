/**
 * Lead Scoring Engine
 *
 * Weighted scoring algorithm that ranks leads by business value.
 * A veteran seeking term life in a high-population state scores higher
 * than an undecided non-veteran in a low-volume market.
 *
 * Score range: 0–100
 *   90–100: Hot (immediate follow-up)
 *   70–89:  Warm (same-day follow-up)
 *   50–69:  Standard (next-business-day)
 *   0–49:   Cool (batch queue)
 */

export interface LeadScore {
  total: number;
  tier: "hot" | "warm" | "standard" | "cool";
  factors: {
    coverage: number;
    veteran: number;
    state: number;
    completeness: number;
    recency: number;
  };
}

// --- Coverage interest weights (max 30 points) ---
const COVERAGE_WEIGHTS: Record<string, number> = {
  "term": 28,
  "whole": 30,
  "universal": 25,
  "final-expense": 26,
  "annuity": 22,
  "not-sure": 10,
};

// --- Veteran status weights (max 20 points) ---
// Veterans have access to SGLI/VGLI conversion, group rates, and
// specialized underwriting — higher value to carriers
const VETERAN_WEIGHTS: Record<string, number> = {
  "veteran": 20,
  "non-veteran": 8,
};

// --- High-volume insurance states (max 20 points) ---
// Top states by life insurance policy density and premium volume
const HIGH_VALUE_STATES = new Set([
  "TX", "FL", "CA", "NY", "PA", "OH", "IL", "GA", "NC", "VA",
  "NJ", "MI", "TN", "AZ", "IN", "MO", "MD", "WI", "SC", "AL",
]);

const MEDIUM_VALUE_STATES = new Set([
  "CO", "MN", "LA", "KY", "OR", "OK", "CT", "IA", "MS", "AR",
  "KS", "UT", "NV", "NE", "WV", "NM", "HI", "NH", "ME", "ID",
]);

/**
 * Score a lead based on weighted business factors.
 */
export function scoreLead(lead: {
  coverageInterest: string;
  veteranStatus: string;
  militaryBranch: string;
  state: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  createdAt: string;
}): LeadScore {
  // Coverage factor (0–30)
  const coverage = COVERAGE_WEIGHTS[lead.coverageInterest] || 10;

  // Veteran factor (0–20)
  let veteran = VETERAN_WEIGHTS[lead.veteranStatus] || 5;
  // Bonus for specific branch identification (indicates engagement)
  if (lead.veteranStatus === "veteran" && lead.militaryBranch) {
    veteran = Math.min(20, veteran + 2);
  }

  // State factor (0–20)
  let state = 10; // default
  if (HIGH_VALUE_STATES.has(lead.state)) state = 20;
  else if (MEDIUM_VALUE_STATES.has(lead.state)) state = 15;

  // Completeness factor (0–15)
  let completeness = 0;
  if (lead.firstName) completeness += 3;
  if (lead.lastName) completeness += 3;
  if (lead.email) completeness += 3;
  if (lead.phone) completeness += 3;
  if (lead.dateOfBirth) completeness += 3;

  // Recency factor (0–15)
  let recency = 15;
  const ageMs = Date.now() - new Date(lead.createdAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours > 72) recency = 3;
  else if (ageHours > 24) recency = 7;
  else if (ageHours > 6) recency = 11;

  const total = Math.min(100, coverage + veteran + state + completeness + recency);

  let tier: LeadScore["tier"];
  if (total >= 90) tier = "hot";
  else if (total >= 70) tier = "warm";
  else if (total >= 50) tier = "standard";
  else tier = "cool";

  return {
    total,
    tier,
    factors: { coverage, veteran, state, completeness, recency },
  };
}
