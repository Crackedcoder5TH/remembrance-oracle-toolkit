'use strict';

/**
 * Shared constants for the risk-score + risk-factors modules.
 *
 * Extracted into its own module so both files can import without
 * bumping each other's cyclomatic complexity count. The values are
 * tuned against the Phase 1 + Phase 2 empirical corpus — see
 * docs/benchmarks/risk-score-phase2-2026-04-15.md for the rationale.
 */

// FILE-LEVEL cyclomatic cap. McCabe's ≤10 is a per-FUNCTION guideline;
// applying it to file-level totals misclassifies normal implementation
// files as HIGH. The cap-sweep in scripts/cyclomatic-cap-sweep.js
// tested caps 20..150 against the validation corpus:
//
//   cap   ρ        HIGH files
//    20  +0.5143   12  (too aggressive — 25% precision)
//    30  +0.3729   12  (earlier v1 default — same precision issue)
//    50  +0.3699   10  ← shipped: stable ρ, best false-positive rate
//    60  +0.3744    9
//    80  +0.3744    7
//   150  +0.3534    2  (plateau collapses, rank signal weakens)
//
// Cap 50 sits in the stable-ρ zone and flags files with cyclomatic
// ≥ 30 (0.6 × 50) as HIGH. That matches the "cyclomatic > 20 is a
// problem" rule of thumb from NIST adapted for file-level totals.
const CYCLOMATIC_CAP = 50;

// Maximum nesting depth that's still readable. >6 is a smell but not
// directly bug-indicative — it's tracked as a signal, not a weight.
const MAX_DEPTH_CAP = 6;

// v1 default weights: cyclomatic-only. See the Phase 2 ablation
// (scripts/risk-score-ablation.js) for why — no linear combination
// beat raw cyclomatic on 20 samples. Callers with feedback data can
// override via options.weights.
const DEFAULT_WEIGHTS = Object.freeze({
  coherency: 0.0,
  cyclomatic: 1.0,
});

// 3 risk levels (not the spec's 5). Boundaries chosen so the McCabe
// threshold (cyc ≈ 10 → risk ≈ 0.33) lands inside MEDIUM and NIST's
// problem flag (cyc ≥ 20 → risk ≥ 0.67) lands inside HIGH.
const RISK_LEVELS = Object.freeze({
  HIGH:   { min: 0.60, label: 'HIGH',   description: 'High bug probability — review now' },
  MEDIUM: { min: 0.30, label: 'MEDIUM', description: 'Moderate bug probability — monitor' },
  LOW:    { min: 0.00, label: 'LOW',    description: 'Low bug probability — routine' },
});

module.exports = {
  CYCLOMATIC_CAP,
  MAX_DEPTH_CAP,
  DEFAULT_WEIGHTS,
  RISK_LEVELS,
};
