/**
 * Valor Lead Substrates — the archetype waveforms.
 *
 * Each lead is reduced to a 16-dimensional normalized vector (its "shape").
 * That shape is correlated (Pearson) against these archetype vectors in a
 * cascade. The archetype with the strongest resonance is what the lead
 * "is" — not because we assigned a label, but because the math says so.
 *
 * This is the same move the void substrate makes at the 80K-pattern scale,
 * scaled down to a curated set relevant for veteran life insurance leads.
 *
 * Dimension order (MUST stay stable — all archetypes align to these indices):
 *   0  coverage_clarity
 *   1  intent_strength
 *   2  veteran_integrity
 *   3  branch_specificity
 *   4  state_market_fit
 *   5  field_completeness
 *   6  recency
 *   7  consent_integrity
 *   8  email_quality
 *   9  phone_quality
 *  10  name_plausibility
 *  11  dob_validity
 *  12  marketing_context
 *  13  session_coherence
 *  14  timing_cadence
 *  15  step_rhythm
 */

export const LEAD_DIM = 16;

export const LEAD_DIMENSIONS = [
  'coverage_clarity',
  'intent_strength',
  'veteran_integrity',
  'branch_specificity',
  'state_market_fit',
  'field_completeness',
  'recency',
  'consent_integrity',
  'email_quality',
  'phone_quality',
  'name_plausibility',
  'dob_validity',
  'marketing_context',
  'session_coherence',
  'timing_cadence',
  'step_rhythm',
] as const;

export type LeadDimension = typeof LEAD_DIMENSIONS[number];

/**
 * The canonical archetype library. Keys follow `group/name` — same shape as
 * the oracle's and void's substrate names so a future Remembrance Director
 * can treat them uniformly.
 *
 * Values in [0, 1] represent the expected dimension strength for each archetype.
 * The Pearson correlation is scale-invariant, so these numbers encode SHAPE,
 * not absolute expected values.
 */
export const LEAD_ARCHETYPES: ReadonlyMap<string, readonly number[]> = new Map([
  /* ── Valor group: high-coherency leads we want ────────────── */

  // The primary target: a veteran choosing specific protection with strong intent.
  ['valor/protective-veteran', [
    /* coverage  */ 0.95,
    /* intent    */ 0.95,
    /* veteran   */ 0.98,
    /* branch    */ 0.90,
    /* state     */ 0.85,
    /* complete  */ 0.98,
    /* recency   */ 0.98,
    /* consent   */ 0.98,
    /* email     */ 0.90,
    /* phone     */ 0.90,
    /* name      */ 0.90,
    /* dob       */ 0.95,
    /* marketing */ 0.65,
    /* session   */ 0.80,
    /* timing    */ 0.80,
    /* rhythm    */ 0.80,
  ]],

  // Active-duty or guard/reserve with family-protection framing.
  ['valor/service-family', [
    0.90, 0.95, 0.92, 0.95, 0.75, 0.95, 0.98,
    0.98, 0.88, 0.88, 0.88, 0.92, 0.55, 0.78, 0.78, 0.80,
  ]],

  // Civilian family member of a service member, clear intent.
  ['valor/engaged-civilian', [
    0.85, 0.88, 0.55, 0.20, 0.78, 0.92, 0.98,
    0.98, 0.88, 0.88, 0.88, 0.90, 0.70, 0.78, 0.80, 0.80,
  ]],

  // Real but cool lead — exploring, undecided coverage.
  ['valor/exploratory', [
    0.35, 0.35, 0.50, 0.30, 0.60, 0.80, 0.95,
    0.95, 0.80, 0.80, 0.80, 0.80, 0.50, 0.65, 0.70, 0.70,
  ]],

  /* ── Fraud group: shapes we should reject ─────────────────── */

  // Fields don't cohere — e.g. branch=Navy but status=non-military, or
  // a mortgage-protection pick from someone under 25 with fake DOB.
  ['fraud/mismatched', [
    0.80, 0.80, 0.20, 0.90, 0.80, 0.90, 0.95,
    0.90, 0.85, 0.20, 0.30, 0.25, 0.30, 0.40, 0.60, 0.55,
  ]],

  // Suspicious completeness with weak provenance (no UTM, low session).
  ['fraud/harvested', [
    0.75, 0.60, 0.85, 0.60, 0.70, 0.98, 0.95,
    0.85, 0.40, 0.40, 0.50, 0.55, 0.10, 0.10, 0.50, 0.40,
  ]],

  /* ── Bot group: uniform/constant anti-human shapes ────────── */

  // Headless filler — near-max everywhere, no human variance, fast submit.
  ['bot/uniform-fast', [
    0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98,
    0.98, 0.98, 0.98, 0.98, 0.98, 0.05, 0.05, 0.05, 0.05,
  ]],

  // Sophisticated bot — imitates human fields, but with flat timing.
  ['bot/constant-cadence', [
    0.80, 0.80, 0.75, 0.80, 0.75, 0.90, 0.95,
    0.95, 0.85, 0.85, 0.85, 0.85, 0.30, 0.20, 0.10, 0.10,
  ]],

  // Honeypot-triggered — hidden field filled or timing < 3s.
  ['bot/honeypot', [
    0.50, 0.50, 0.50, 0.50, 0.50, 0.90, 0.99,
    0.90, 0.50, 0.50, 0.30, 0.30, 0.10, 0.05, 0.02, 0.02,
  ]],
]);

/** Flatten the archetype map into ordered arrays, suitable for the cascade. */
export function archetypesAsSubstrateMap(): ReadonlyMap<string, readonly number[]> {
  return LEAD_ARCHETYPES;
}

/** Return the archetype group ("valor" | "fraud" | "bot") from a fully qualified name. */
export function archetypeGroup(name: string): 'valor' | 'fraud' | 'bot' | 'unknown' {
  const slash = name.indexOf('/');
  if (slash < 0) return 'unknown';
  const group = name.slice(0, slash);
  if (group === 'valor' || group === 'fraud' || group === 'bot') return group;
  return 'unknown';
}
