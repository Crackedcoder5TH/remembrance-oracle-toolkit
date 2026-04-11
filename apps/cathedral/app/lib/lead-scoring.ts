/**
 * Lead Scoring Engine
 *
 * Weighted scoring algorithm that ranks leads by business value.
 * A veteran seeking term life in a high-population state scores higher
 * than an undecided non-military lead in a low-volume market.
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
    intent: number;
    veteran: number;
    state: number;
    completeness: number;
    recency: number;
  };
}

// --- Coverage interest weights (max 25 points) ---
const COVERAGE_WEIGHTS: Record<string, number> = {
  "term": 23,
  "whole": 25,
  "universal": 21,
  "final-expense": 22,
  "annuity": 18,
  "not-sure": 8,
};

// --- Purchase intent weights (max 20 points) ---
// Self-reported buying intent — one of the strongest conversion signals.
const INTENT_WEIGHTS: Record<string, number> = {
  "protect-family": 20,
  "want-protection": 12,
  "exploring": 5,
};

// --- Service category weights (max 18 points) ---
// Active-duty and veterans have access to SGLI/VGLI conversion, group rates,
// and specialized underwriting — higher value to carriers.
// Reserve and National Guard also qualify for military-specific products.
const VETERAN_WEIGHTS: Record<string, number> = {
  "active-duty": 18,
  "veteran": 18,
  "reserve": 16,
  "national-guard": 16,
  "non-military": 7,
};

// --- High-volume insurance states (max 17 points) ---
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
  purchaseIntent?: string;
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
  // Coverage factor (0–25)
  const coverage = COVERAGE_WEIGHTS[lead.coverageInterest] || 8;

  // Intent factor (0–20)
  const intent = INTENT_WEIGHTS[lead.purchaseIntent || ""] || 5;

  // Veteran factor (0–18)
  let veteran = VETERAN_WEIGHTS[lead.veteranStatus] || 5;
  // Bonus for specific branch identification (indicates engagement)
  if (lead.veteranStatus !== "non-military" && lead.militaryBranch) {
    veteran = Math.min(18, veteran + 2);
  }

  // State factor (0–17)
  let state = 9; // default
  if (HIGH_VALUE_STATES.has(lead.state)) state = 17;
  else if (MEDIUM_VALUE_STATES.has(lead.state)) state = 13;

  // Completeness factor (0–10)
  let completeness = 0;
  if (lead.firstName) completeness += 2;
  if (lead.lastName) completeness += 2;
  if (lead.email) completeness += 2;
  if (lead.phone) completeness += 2;
  if (lead.dateOfBirth) completeness += 2;

  // Recency factor (0–10)
  let recency = 10;
  const ageMs = Date.now() - new Date(lead.createdAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours > 72) recency = 2;
  else if (ageHours > 24) recency = 5;
  else if (ageHours > 6) recency = 8;

  const total = Math.min(100, coverage + intent + veteran + state + completeness + recency);

  let tier: LeadScore["tier"];
  if (total >= 90) tier = "hot";
  else if (total >= 70) tier = "warm";
  else if (total >= 50) tier = "standard";
  else tier = "cool";

  return {
    total,
    tier,
    factors: { coverage, intent, veteran, state, completeness, recency },
  };
}
