/**
 * Lead Scoring — compatibility shim over the coherency-native gate.
 *
 * The actual math now lives in app/lib/valor/lead-coherency.ts. This file
 * preserves the historical LeadScore surface so downstream consumers
 * (admin exports, agent portal, client purchase flow, distribution) keep
 * working unchanged while the scoring is computed from the archetype
 * cascade instead of a hand-tuned weighted sum.
 *
 * Score range: 0–100 (now a linear projection of the coherency score)
 *   85–100: Hot      (coherency ≥ TRANSCENDENCE 0.95)
 *   70–84:  Warm     (coherency ≥ SYNERGY 0.85)
 *   55–69:  Standard (coherency ≥ FOUNDATION 0.70)
 *   0–54:   Cool     (below foundation)
 *
 * The tier thresholds map to the Remembrance coherency thresholds so the
 * cathedral and the oracle agree on what "hot" means.
 */

import {
  scoreLeadByCoherency,
  legacyTierFor,
  legacyTotalFor,
} from "./valor/lead-coherency";

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
  /** Raw coherency score in [0, 1] — available for admin surfaces. */
  coherency?: number;
  /** Dominant archetype name from the cascade (e.g. "valor/protective-veteran"). */
  archetype?: string;
}

/**
 * Score a lead. Backwards-compatible with the previous weighted algorithm;
 * under the hood this delegates to the coherency cascade and projects back
 * into the legacy LeadScore shape.
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
  const coh = scoreLeadByCoherency({
    coverageInterest: lead.coverageInterest,
    purchaseIntent: lead.purchaseIntent,
    veteranStatus: lead.veteranStatus,
    militaryBranch: lead.militaryBranch,
    state: lead.state,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    dateOfBirth: lead.dateOfBirth,
    createdAt: lead.createdAt,
    consentTcpa: true,
    consentPrivacy: true,
  });

  // Project the 16-dimensional shape back into the six factor buckets
  // the admin UI already knows how to render. Each legacy factor is
  // rescaled into the historical 0–25 / 0–20 / 0–18 / 0–17 / 0–10 / 0–10 band.
  const d = coh.dimensions;
  const factors = {
    coverage: Math.round(d.coverage_clarity * 25),
    intent: Math.round(d.intent_strength * 20),
    veteran: Math.round((d.veteran_integrity * 0.8 + d.branch_specificity * 0.2) * 18),
    state: Math.round(d.state_market_fit * 17),
    completeness: Math.round(d.field_completeness * 10),
    recency: Math.round(d.recency * 10),
  };

  return {
    total: legacyTotalFor(coh.score),
    tier: legacyTierFor(coh.score),
    factors,
    coherency: coh.score,
    archetype: coh.dominantArchetype,
  };
}
