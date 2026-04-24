/**
 * Valor Lexicon — the Remembrance lexicon mapped to cathedral UX copy.
 *
 * One canonical table so admin dashboards, lead confirmations, agent portal,
 * and the public site speak the same language. Mirrors the structure of
 * src/core/remembrance-lexicon.js for the oracle — this is the cathedral's
 * local dialect of the same vocabulary.
 */

import type { CoherencyTier } from './coherency-primitives';

/** Public-facing tier labels — the words the admin dashboard surfaces. */
export const TIER_LABEL: Record<CoherencyTier, string> = {
  rejection: 'Beneath the Gate',
  gate: 'At the Gate',
  pull: 'Received',
  foundation: 'Foundation',
  stability: 'Stable',
  optimization: 'Optimizing',
  synergy: 'Synergy',
  intelligence: 'Intelligence',
  transcendence: 'Transcendent',
  unity: 'Unity',
};

/** Short description — what the tier means in lead-quality terms. */
export const TIER_MEANING: Record<CoherencyTier, string> = {
  rejection: 'Did not pass the covenant gate.',
  gate: 'Admitted at the coherency threshold — needs review.',
  pull: 'Usable as-is. Match the lead to any licensed professional.',
  foundation: 'First-shell alignment. Standard-queue follow-up.',
  stability: 'Stable resonance across fields. Same-day follow-up.',
  optimization: 'High resonance. Prioritize within the business day.',
  synergy: 'Strong multi-dimensional alignment. Call-first.',
  intelligence: 'Top-tier lead. Assign to exclusive buyers.',
  transcendence: 'Rare coherency. Autonomous-mode dispatch.',
  unity: 'Perfect alignment. Escalate to senior agent immediately.',
};

/** The cathedral's public-facing component names. */
export const LEXICON = {
  covenantGate: 'Covenant Gate',
  coherencyScore: 'Coherency',
  archetype: 'Resonance',
  submitted: 'Received through the Gate',
  confirmation: 'Your signal has been received. A licensed professional will reach out through the covenant.',
  tooFastOrBot: 'Your intention has been noted.',
} as const;

/**
 * Long-form confirmation messages shown after admission. Weighted by tier —
 * transcendent leads get the deepest phrasing; gate-level leads get a
 * straightforward acknowledgment.
 */
export const CONFIRMATION_BY_TIER: Partial<Record<CoherencyTier, string>> = {
  transcendence:
    "Your signal resonated clearly through the covenant. A senior licensed professional will reach out within the hour.",
  intelligence:
    "Strong alignment across every dimension. A licensed professional who specializes in your coverage area will reach out today.",
  synergy:
    "Your fields cohere. A licensed professional will be in touch within one business day.",
  optimization:
    "Received and resonant. Expect an outreach call or email within one business day.",
  stability:
    "Your request has been received. A licensed insurance professional will contact you soon.",
  foundation:
    "Received. A licensed professional will reach out to review your options.",
  pull:
    "Your information is secure. A licensed professional will be in touch.",
  gate:
    "Your request has been received. We'll be in touch.",
};

/** Return the confirmation message matched to the lead's tier. */
export function confirmationFor(tier: CoherencyTier): string {
  return (
    CONFIRMATION_BY_TIER[tier] ||
    CONFIRMATION_BY_TIER.stability ||
    "Your request has been received. A licensed insurance professional will contact you soon."
  );
}

/**
 * The coherency thresholds named in human terms — used by the admin
 * dashboard header and by any tier badge rendering.
 */
export const THRESHOLD_DESCRIPTION = {
  gate: 'The floor of admission — 0.60 coherency. Nothing below survives the gate.',
  foundation: 'First elements emerge — 0.70.',
  stability: 'Reliable resonance — 0.75.',
  synergy: 'Semi-autonomous dispatch — 0.85.',
  transcendence: 'Autonomous mode — 0.95.',
  unity: 'Oracle and lead as one — 0.98.',
} as const;
