/**
 * Agent Diagnostic — structured rejection feedback for AI agents.
 *
 * The covenant gate on the public web form silently rejects bots and fraud
 * (the bot sees a fake-success so it can't tune its behavior). That's correct
 * for the public surface — adversaries should not learn the gate.
 *
 * Authenticated AI agents on /api/agent/leads are a different population:
 *   - They authenticated with a Bearer key we issued.
 *   - They went through a confirmed consent flow with a real human.
 *   - They are the testers / partners who SHOULD learn the gate so they
 *     can improve their submissions.
 *
 * For the agent path we therefore expose the truth:
 *   verdict, score vs. threshold (gap), tier, dominant archetype, the
 *   weakest dimensions by name, and 1-3 actionable guidance hints derived
 *   from which dimensions failed. The agent has something concrete to share
 *   with peers (and on Molt Book) — and the bar itself becomes a public
 *   reputation signal in agent-space rather than a hidden filter.
 */
import {
  COHERENCY_THRESHOLDS,
  type CoherencyTier,
} from './coherency-primitives';
import type { CovenantDecision } from './covenant-gate';
import type { LeadDimension } from './lead-substrates';

export interface DimensionWeakness {
  readonly dimension: LeadDimension;
  readonly score: number;
  readonly hint: string;
}

export interface ArchetypeMatch {
  readonly name: string;
  readonly r: number;
  readonly kind: 'harmonic' | 'anti-phase' | 'weak' | 'noise';
}

export interface AgentDiagnostic {
  readonly verdict: CovenantDecision['verdict'];
  readonly retryable: boolean;
  readonly coherency: {
    readonly score: number;
    readonly threshold: number;
    readonly gap: number;
    readonly tier: CoherencyTier;
    readonly dominantArchetype: string;
    readonly dominantGroup: 'valor' | 'fraud' | 'bot' | 'unknown';
  };
  readonly weakestDimensions: readonly DimensionWeakness[];
  readonly topArchetypeMatches: readonly ArchetypeMatch[];
  readonly guidance: readonly string[];
  readonly reason: string;
}

/**
 * Per-dimension hint table. Reflects which input the agent controls and
 * what shape the substrate library expects to see in that slot.
 *
 * Behavioral dimensions (timing/rhythm/session) are honestly labeled as
 * "agents can't supply this" so the agent doesn't waste energy trying to
 * fake them.
 */
const DIMENSION_HINTS: Readonly<Record<LeadDimension, string>> = {
  coverage_clarity:
    "Specify a coverage type: mortgage-protection, income-replacement, " +
    "final-expense, legacy, retirement-savings, or guaranteed-income. " +
    "'not-sure' collapses this dimension.",
  intent_strength:
    "Ask the human about their motivation and pass a real value. " +
    "'protect-family' resonates strongest, 'exploring' scores lowest.",
  veteran_integrity:
    "Include veteran_status. 'civilian' is accepted but 'veteran' / " +
    "'active-duty' / 'reserve' / 'national-guard' resonate higher.",
  branch_specificity:
    "If veteran_status is military, include the specific branch " +
    "(army, navy, air-force, marines, coast-guard, space-force).",
  state_market_fit:
    "state must be a valid 2-letter US state code. " +
    "High-value states (TX, FL, CA, NY, ...) score higher.",
  field_completeness:
    "Submit every standard field. Missing fields collapse this dimension " +
    "and weakest-link will pull the whole score down.",
  recency:
    "Submit promptly after consent confirmation. Stale consent timestamps " +
    "(hours / days old) score lower.",
  consent_integrity:
    "consentTimestamp must be present and recent; consentText must " +
    "describe the consent. Both come from the consent token automatically — " +
    "if you see this dimension low, the consent flow is incomplete.",
  email_quality:
    "Use the human's primary email. Disposable domains (mailinator, " +
    "guerrillamail, tempmail, yopmail) and high-entropy local-parts " +
    "(random 20+ char strings, name+long-digits) score very low.",
  phone_quality:
    "Include a 10-digit US phone with a valid NANP area code. " +
    "Sequential / repeated digits and invalid area codes score low.",
  name_plausibility:
    "firstName / lastName should be plausible human names. Single " +
    "characters, all-caps typos, and obvious test strings score low.",
  dob_validity:
    "dateOfBirth must be a valid past date in YYYY-MM-DD form. " +
    "Future dates or impossible ages collapse this dimension.",
  marketing_context:
    "Optional: include utm_campaign for richer context. Agents typically " +
    "score modest here — that's expected, not a defect.",
  session_coherence:
    "Behavioral signal — agents cannot supply this. Modest scores here " +
    "are expected. Focus on the input dimensions you control.",
  timing_cadence:
    "Behavioral signal — agents cannot supply this. Modest scores here " +
    "are expected.",
  step_rhythm:
    "Behavioral signal — agents cannot supply this. Modest scores here " +
    "are expected.",
};

/**
 * Build a structured diagnostic for an authenticated agent whose submission
 * was rejected (or admitted at low coherency) by the covenant gate.
 *
 * Safe to call on any verdict — for `admit` the diagnostic is informational
 * (showing why the submission scored where it did), not corrective.
 */
export function buildAgentDiagnostic(decision: CovenantDecision): AgentDiagnostic {
  const { verdict, coherency, reason } = decision;

  const threshold =
    verdict === 'admit-low-coherency'
      ? COHERENCY_THRESHOLDS.FOUNDATION
      : COHERENCY_THRESHOLDS.GATE;
  const gap = Math.max(0, threshold - coherency.score);

  const weakestDimensions = pickWeakestDimensions(coherency.dimensions, 3);
  const topArchetypeMatches = (coherency.matches ?? []).slice(0, 3).map((m) => ({
    name: m.name,
    r: roundTo(m.r, 4),
    kind: m.kind,
  }));

  const guidance = buildGuidance(verdict, coherency, weakestDimensions);

  // Bots and fraud are NOT retryable on the same lead — the agent should
  // re-evaluate their pipeline, not just resubmit. Soft-reject and
  // admit-low-coherency ARE retryable with a stronger lead.
  const retryable =
    verdict === 'soft-reject-low' || verdict === 'admit-low-coherency';

  return {
    verdict,
    retryable,
    coherency: {
      score: roundTo(coherency.score, 4),
      threshold,
      gap: roundTo(gap, 4),
      tier: coherency.tier,
      dominantArchetype: coherency.dominantArchetype,
      dominantGroup: coherency.dominantGroup,
    },
    weakestDimensions,
    topArchetypeMatches,
    guidance,
    reason,
  };
}

function pickWeakestDimensions(
  dims: Readonly<Record<LeadDimension, number>>,
  k: number,
): DimensionWeakness[] {
  const entries = (Object.entries(dims) as Array<[LeadDimension, number]>)
    .map(([dimension, score]) => ({ dimension, score }))
    .sort((a, b) => a.score - b.score)
    .slice(0, k);
  return entries.map(({ dimension, score }) => ({
    dimension,
    score: roundTo(score, 4),
    hint: DIMENSION_HINTS[dimension],
  }));
}

function buildGuidance(
  verdict: CovenantDecision['verdict'],
  coherency: CovenantDecision['coherency'],
  weakest: readonly DimensionWeakness[],
): string[] {
  const out: string[] = [];

  if (verdict === 'silent-reject-bot') {
    out.push(
      `Submission resonates with bot archetype "${coherency.dominantArchetype}". ` +
        "Vary phrasing per submission; use plausible US name distributions; " +
        "supply real US state codes and NANP-valid phone numbers.",
    );
  } else if (verdict === 'silent-reject-fraud') {
    out.push(
      `Submission resonates with fraud archetype "${coherency.dominantArchetype}". ` +
        "Verify human consent more carefully and check for suspicious " +
        "email/phone patterns before submitting.",
    );
  } else if (verdict === 'soft-reject-low') {
    out.push(
      `Score ${coherency.score.toFixed(3)} is below the admission gate ` +
        `${COHERENCY_THRESHOLDS.GATE.toFixed(2)}. Lift the weakest dimensions ` +
        "below to clear the gate. Coherency is the geometric mean — the " +
        "weakest dimension dominates, so fixing one weak signal lifts the " +
        "whole score.",
    );
  } else if (verdict === 'admit-low-coherency') {
    out.push(
      `Admitted at score ${coherency.score.toFixed(3)} but below foundation ` +
        `${COHERENCY_THRESHOLDS.FOUNDATION.toFixed(2)}. Lift weak dimensions ` +
        "for a higher payout tier on subsequent submissions.",
    );
  } else {
    out.push(
      `Admitted at score ${coherency.score.toFixed(3)} (tier: ${coherency.tier}). ` +
        "Diagnostic is informational.",
    );
  }

  // Append the actionable hints for the weakest dimensions, dedup-merged.
  for (const w of weakest) {
    out.push(`weak[${w.dimension} = ${w.score.toFixed(3)}]: ${w.hint}`);
  }

  return out;
}

function roundTo(n: number, decimals: number): number {
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
