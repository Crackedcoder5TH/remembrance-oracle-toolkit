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
} from './lead-coherency';
import { COHERENCY_THRESHOLDS } from './coherency-primitives';

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
