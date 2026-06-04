/**
 * Covenant Gate — the admission decision.
 *
 * A lead is admitted when:
 *   1. coherency >= GATE (0.60), AND
 *   2. dominant archetype is not a bot variant, AND
 *   3. anti-phase resonance against valor archetypes is weaker than harmonic.
 *
 * Otherwise the gate returns a silent-rejection response matching the existing
 * honeypot pattern — the client sees a fake-success so bots don't adjust, but
 * the lead is never persisted.
 *
 * This is the oracle's covenant principle applied at the business boundary:
 * the math gates admission, not a handwritten rule file.
 */

import {
  LeadCoherency,
  LeadInput,
  scoreLeadByCoherency,
  scoreLeadByCoherencyAsync,
} from './lead-coherency';
import { COHERENCY_THRESHOLDS } from './coherency-primitives';
import type { ValidationResult } from './remembrance-bridge';

export type CovenantVerdict =
  | 'admit'               // passes every gate
  | 'admit-low-coherency' // passes gate but below FOUNDATION — admin review
  | 'silent-reject-bot'   // matches bot archetype — fake-success to client
  | 'silent-reject-fraud' // matches fraud archetype — fake-success to client
  | 'soft-reject-low'     // below GATE — client sees decline
;

export interface CovenantDecision {
  readonly verdict: CovenantVerdict;
  readonly coherency: LeadCoherency;
  readonly reason: string;
  /**
   * Dual-oracle verdict from the Remembrance field. Populated only by the
   * async covenant variant (`evaluateCovenantAsync`). May be null when the
   * oracle is unreachable — treated as "no objection" by the consensus rule.
   */
  readonly dualOracle?: ValidationResult | null;
}

/**
 * Single entry point. Never throws. Returns the decision object; the caller
 * decides what HTTP response to produce.
 */
export function evaluateCovenant(lead: LeadInput): CovenantDecision {
  const coherency = scoreLeadByCoherency(lead);
  const {
    score, dominantGroup, dominantArchetype, admitted,
  } = coherency;

  if (dominantGroup === 'bot') {
    return {
      verdict: 'silent-reject-bot',
      coherency,
      reason: `dominant resonance with bot archetype ${dominantArchetype}`,
    };
  }

  if (dominantGroup === 'fraud' && score < COHERENCY_THRESHOLDS.FOUNDATION) {
    return {
      verdict: 'silent-reject-fraud',
      coherency,
      reason: `dominant resonance with fraud archetype ${dominantArchetype} @ score=${score.toFixed(3)}`,
    };
  }

  if (!admitted || score < COHERENCY_THRESHOLDS.GATE) {
    return {
      verdict: 'soft-reject-low',
      coherency,
      reason: `coherency ${score.toFixed(3)} below gate ${COHERENCY_THRESHOLDS.GATE}`,
    };
  }

  if (score < COHERENCY_THRESHOLDS.FOUNDATION) {
    return {
      verdict: 'admit-low-coherency',
      coherency,
      reason: `coherency ${score.toFixed(3)} admitted but below foundation ${COHERENCY_THRESHOLDS.FOUNDATION}`,
    };
  }

  return {
    verdict: 'admit',
    coherency,
    reason: `coherency ${score.toFixed(3)} resonates with ${dominantArchetype}`,
  };
}

/* ── Async (dual-oracle consensus) variant ────────────────────────── */

/**
 * Async covenant evaluator implementing TWO-ORACLE CONSENSUS.
 *
 * Two oracles must agree before a lead is admitted:
 *   1. the local valor archetype cascade (the existing `evaluateCovenant`
 *      logic — bot/fraud/below-gate checks), AND
 *   2. the Remembrance field's dual-oracle dry-run on the coherency score.
 *
 * Consensus refinement rule (applied AFTER the local verdict is computed):
 *   - local verdict is `admit` AND dualOracle is null or accepted → stay `admit`
 *     (oracle unreachable is treated as "no objection" — best-effort design)
 *   - local verdict is `admit` BUT dualOracle.suspect === true → downgrade
 *     to `admit-low-coherency` (the existing quarantine slot) and surface the
 *     oracle's sophisticated-injection shapeClass in the reason
 *   - local verdict is anything else → preserved as-is (the local oracle is
 *     authoritative for explicit rejections; the field can only quarantine
 *     a would-be admit, not promote a reject)
 *
 * The synchronous `evaluateCovenant` is unchanged; both APIs coexist.
 */
export async function evaluateCovenantAsync(lead: LeadInput): Promise<CovenantDecision> {
  const coherency = await scoreLeadByCoherencyAsync(lead);
  const dualOracle = coherency.dualOracle ?? null;
  const {
    score, dominantGroup, dominantArchetype, admitted,
  } = coherency;

  // ── Local verdict (mirrors evaluateCovenant exactly) ──────────────
  let local: CovenantDecision;
  if (dominantGroup === 'bot') {
    local = {
      verdict: 'silent-reject-bot',
      coherency,
      reason: `dominant resonance with bot archetype ${dominantArchetype}`,
      dualOracle,
    };
  } else if (dominantGroup === 'fraud' && score < COHERENCY_THRESHOLDS.FOUNDATION) {
    local = {
      verdict: 'silent-reject-fraud',
      coherency,
      reason: `dominant resonance with fraud archetype ${dominantArchetype} @ score=${score.toFixed(3)}`,
      dualOracle,
    };
  } else if (!admitted || score < COHERENCY_THRESHOLDS.GATE) {
    local = {
      verdict: 'soft-reject-low',
      coherency,
      reason: `coherency ${score.toFixed(3)} below gate ${COHERENCY_THRESHOLDS.GATE}`,
      dualOracle,
    };
  } else if (score < COHERENCY_THRESHOLDS.FOUNDATION) {
    local = {
      verdict: 'admit-low-coherency',
      coherency,
      reason: `coherency ${score.toFixed(3)} admitted but below foundation ${COHERENCY_THRESHOLDS.FOUNDATION}`,
      dualOracle,
    };
  } else {
    local = {
      verdict: 'admit',
      coherency,
      reason: `coherency ${score.toFixed(3)} resonates with ${dominantArchetype}`,
      dualOracle,
    };
  }

  // ── Consensus refinement ─────────────────────────────────────────
  // Only the `admit` verdict is subject to dual-oracle downgrade. Any other
  // verdict (bot, fraud, soft-reject, admit-low-coherency) stands as-is.
  if (local.verdict !== 'admit') return local;

  // Oracle unreachable → no objection → stay admit.
  if (dualOracle === null) return local;

  // Oracle says suspect → quarantine via the existing admit-low-coherency slot.
  if (dualOracle.suspect === true) {
    return {
      verdict: 'admit-low-coherency',
      coherency,
      reason: `coherency ${score.toFixed(3)} admitted locally but dual-oracle flagged shapeClass=${dualOracle.shapeClass} (sophisticated-injection)`,
      dualOracle,
    };
  }

  // Oracle accepted (or non-suspect) → consensus reached, stay admit.
  return local;
}
