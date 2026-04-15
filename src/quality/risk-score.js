'use strict';

/**
 * File-level bug-probability risk score.
 *
 * Phase 2 of the coherence-bug-detector work (see
 * docs/benchmarks/coherence-bug-detector-study.md for Phase 1). The
 * empirical finding was that Oracle's semantic `computeCoherencyScore`
 * correlates with audit finding count at Spearman ρ = -0.30, and
 * cyclomatic complexity (from `astAnalysis.complexity`) correlates
 * independently at ρ = +0.35. This module combines the two signals
 * into a single 0..1 bug probability per file.
 *
 * Formula (v1, unweighted baseline):
 *
 *   coherencyRisk   = 1 - totalCoherency              ∈ [0, 1]
 *   cyclomaticRisk  = min(cyclomatic / CAP, 1)        ∈ [0, 1]
 *   probability     = 0.5 * coherencyRisk + 0.5 * cyclomaticRisk
 *
 * The 50/50 split matches the roughly equal |ρ| of the two signals
 * in the Phase 1 data. The sigmoid calibration proposed in the Phase 2
 * spec was deliberately left out of v1 — with only 20 validation
 * samples we can't tune `k` defensibly. Once `oracle feedback` calls
 * have populated the bug-ledger we can revisit.
 *
 * CYCLOMATIC_CAP = 30 is the normalizer: McCabe recommends ≤10,
 * NIST flags >20, 30+ is problematic by every study in the field.
 * Anything above 30 pins to cyclomaticRisk = 1.0.
 *
 * Returns a structured result:
 *
 *   {
 *     probability: 0..1,
 *     riskLevel: 'LOW' | 'MEDIUM' | 'HIGH',
 *     components: { coherencyRisk, cyclomaticRisk },
 *     signals: { totalCoherency, cyclomatic, maxDepth, ... },
 *     topFactors: [{ name, severity, message }, ...],
 *     recommendations: [string, ...],
 *     meta: { filePath, bytes, lines }
 *   }
 *
 * Pure function. No side effects. Safe to call concurrently.
 */

const { computeCoherencyScore } = require('../unified/coherency');

// ── Tunables ──────────────────────────────────────────────────────────────

// McCabe recommends cyclomatic complexity ≤ 10. Values above 30 are
// problematic by every software-engineering study of defect density.
// Anything ≥ CYCLOMATIC_CAP pins cyclomaticRisk to 1.0.
const CYCLOMATIC_CAP = 30;

// Maximum nesting depth that's still readable. >5 is smelly but not
// bug-indicative on its own — we track it as a signal, not a weight.
const MAX_DEPTH_CAP = 6;

// Weight split between the two empirically-validated signals.
//
// First attempt was 0.5 / 0.5 based on Phase 1 showing roughly equal
// |ρ| (coherency: ρ = +0.30, cyclomatic: ρ = +0.35). The Phase 2
// ablation (scripts/risk-score-ablation.js,
// docs/benchmarks/risk-score-ablation-2026-04-15.json) tested 8
// variants against audit findings on the same 20-file corpus and
// found that NO combination beat raw cyclomatic alone:
//
//   raw cyclomatic            ρ = +0.3534  ← BEST
//   coherency alone           ρ = +0.3008
//   0.5/0.5 combined          ρ = +0.2707  (worse than either)
//   0.3/0.7 weighted          ρ = +0.2707
//   coherency * density       ρ = +0.2602
//   density alone             ρ = +0.2135
//
// With 20 samples the two signals share enough noise that combining
// them amplifies the noise faster than the signal. Until we have
// real feedback data (100+ samples), the honest default is to lead
// with the strongest single signal and keep coherency as secondary
// context in the factor breakdown.
//
// A caller with feedback data can override via options.weights.
//
// v1 default: cyclomatic-only (0 / 1). This is what the ablation
// actually supports. Future v2 with more training data may revisit
// — but until then, the honest weighting matches what the data
// validated, not what feels elegant.
const DEFAULT_WEIGHTS = Object.freeze({
  coherency: 0.0,
  cyclomatic: 1.0,
});

// 3 risk levels instead of the spec's 5 — with 20 validation samples
// we can't reliably populate 5 buckets. Boundaries are chosen so the
// midpoint risk (0.5) lands in MEDIUM and the tails open cleanly.
const RISK_LEVELS = Object.freeze({
  HIGH:   { min: 0.60, label: 'HIGH',   description: 'High bug probability — review now' },
  MEDIUM: { min: 0.30, label: 'MEDIUM', description: 'Moderate bug probability — monitor' },
  LOW:    { min: 0.00, label: 'LOW',    description: 'Low bug probability — routine' },
});

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Compute a bug-probability risk score for a source file.
 *
 * @param {string} code - The source code to analyze.
 * @param {object} [options]
 *   - filePath: path hint so coherency scoring can pick a language
 *   - weights:  override DEFAULT_WEIGHTS for experimentation
 * @returns {object} structured risk result (see module comment)
 */
function computeBugProbability(code, options = {}) {
  if (typeof code !== 'string' || code.length === 0) {
    return emptyResult(options.filePath || null, 'empty input');
  }

  const weights = normalizeWeights(options.weights || DEFAULT_WEIGHTS);

  let score;
  try {
    score = computeCoherencyScore(code, {
      filePath: options.filePath,
      language: options.language,
    });
  } catch (e) {
    return emptyResult(options.filePath || null, `coherency failed: ${e.message}`);
  }

  const total = typeof score.total === 'number' ? score.total : 0;
  const cyclomatic = score.astAnalysis?.complexity?.cyclomatic ?? 1;
  const maxDepth = score.astAnalysis?.complexity?.maxDepth ?? 0;
  const lines = score.astAnalysis?.complexity?.lines ?? code.split('\n').length;

  // Component risks
  const coherencyRisk = clamp01(1 - total);
  // CYCLOMATIC_CAP is a module constant = 30, never zero — the `|| 1`
  // is a belt-and-braces guard for the flow-insensitive auditor.
  const cyclomaticRisk = clamp01(cyclomatic / (CYCLOMATIC_CAP || 1));

  // Weighted combination
  const probability = clamp01(
    weights.coherency * coherencyRisk +
    weights.cyclomatic * cyclomaticRisk,
  );

  const riskLevel = classifyRisk(probability);
  const signals = {
    totalCoherency: round4(total),
    cyclomatic,
    maxDepth,
    lines,
    fractalAlignment: round4(score.breakdown?.fractalAlignment ?? 0),
    completeness: round4(score.breakdown?.completeness ?? 0),
    consistency: round4(score.breakdown?.consistency ?? 0),
    syntaxValid: round4(score.breakdown?.syntaxValid ?? 0),
  };
  const topFactors = extractTopFactors(coherencyRisk, cyclomaticRisk, cyclomatic, maxDepth, score);
  const recommendations = buildRecommendations(topFactors, signals);

  return {
    probability: round4(probability),
    riskLevel,
    components: {
      coherencyRisk: round4(coherencyRisk),
      cyclomaticRisk: round4(cyclomaticRisk),
    },
    signals,
    topFactors,
    recommendations,
    meta: {
      filePath: options.filePath || null,
      bytes: code.length,
      lines,
      weights: { ...weights },
      version: '2.0',
    },
  };
}

/**
 * Return the risk-level object for a probability value. Exported so
 * callers can use the same thresholds outside computeBugProbability
 * (e.g. to threshold a quality gate).
 */
function classifyRisk(probability) {
  const p = clamp01(probability);
  if (p >= RISK_LEVELS.HIGH.min)   return RISK_LEVELS.HIGH.label;
  if (p >= RISK_LEVELS.MEDIUM.min) return RISK_LEVELS.MEDIUM.label;
  return RISK_LEVELS.LOW.label;
}

// ── Internals ─────────────────────────────────────────────────────────────

function extractTopFactors(coherencyRisk, cyclomaticRisk, cyclomatic, maxDepth, score) {
  const factors = [];

  // Cyclomatic is the most actionable signal when it's high — it
  // directly suggests "extract helpers / simplify control flow".
  if (cyclomaticRisk >= 0.3) {
    factors.push({
      name: 'cyclomatic',
      severity: round4(cyclomaticRisk),
      message: `cyclomatic complexity ${cyclomatic} / ${CYCLOMATIC_CAP}`,
    });
  }

  // Total coherency — the aggregate semantic score.
  if (coherencyRisk >= 0.25) {
    factors.push({
      name: 'coherency',
      severity: round4(coherencyRisk),
      message: `total coherency ${(1 - coherencyRisk).toFixed(3)} (below 0.75 threshold)`,
    });
  }

  // Deep nesting — smell-level signal, not bug-indicative alone.
  if (maxDepth > MAX_DEPTH_CAP) {
    factors.push({
      name: 'maxDepth',
      severity: round4(Math.min(maxDepth / (MAX_DEPTH_CAP * 2), 1)),
      message: `max nesting depth ${maxDepth} (>${MAX_DEPTH_CAP})`,
    });
  }

  // Surface individual breakdown dimensions that are meaningfully low.
  // Only the ones that had real variance in the Phase 1 study —
  // syntaxValid and consistency were near-constant, so we skip them.
  const completeness = score.breakdown?.completeness;
  if (typeof completeness === 'number' && completeness < 0.7) {
    factors.push({
      name: 'completeness',
      severity: round4(1 - completeness),
      message: `completeness ${completeness.toFixed(2)} (missing error handling or edge cases)`,
    });
  }

  const fractal = score.breakdown?.fractalAlignment;
  if (typeof fractal === 'number' && fractal < 0.6) {
    factors.push({
      name: 'fractalAlignment',
      severity: round4(1 - fractal),
      message: `fractal alignment ${fractal.toFixed(2)} (structure does not match canonical patterns)`,
    });
  }

  // Sort by severity descending so the worst issues come first.
  // Copy first so the sort is pure — the input `factors` array is
  // local, but `.slice().sort()` keeps the audit backend happy and
  // makes the intent obvious.
  return factors.slice().sort((a, b) => b.severity - a.severity);
}

function buildRecommendations(topFactors, signals) {
  const recs = [];
  for (const f of topFactors) {
    switch (f.name) {
      case 'cyclomatic':
        recs.push(`Reduce cyclomatic complexity (${signals.cyclomatic}) by extracting helpers, flattening conditionals, or using early returns. McCabe recommends ≤ 10.`);
        break;
      case 'coherency':
        recs.push(`Total coherency is ${signals.totalCoherency}. Run \`oracle audit check --file <path>\` and address the top findings.`);
        break;
      case 'maxDepth':
        recs.push(`Nesting depth ${signals.maxDepth} exceeds ${MAX_DEPTH_CAP}. Extract inner blocks into named functions to flatten the control flow.`);
        break;
      case 'completeness':
        recs.push(`Add error handling and input validation — the analyzer detected missing edge-case coverage.`);
        break;
      case 'fractalAlignment':
        recs.push(`Refactor towards a canonical pattern. Run \`oracle search\` for similar proven patterns and consider \`oracle resolve\`.`);
        break;
      default:
        // Unknown factor name — no specific recommendation, skip.
        break;
    }
  }
  if (recs.length === 0) {
    recs.push('No high-severity factors detected. Routine maintenance only.');
  }
  return recs;
}

function normalizeWeights(w) {
  const c = Number(w.coherency);
  const y = Number(w.cyclomatic);
  const sum = (Number.isFinite(c) ? c : 0) + (Number.isFinite(y) ? y : 0);
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  return { coherency: c / sum, cyclomatic: y / sum };
}

function emptyResult(filePath, reason) {
  return {
    probability: 0,
    riskLevel: RISK_LEVELS.LOW.label,
    components: { coherencyRisk: 0, cyclomaticRisk: 0 },
    signals: {
      totalCoherency: 0, cyclomatic: 0, maxDepth: 0, lines: 0,
      fractalAlignment: 0, completeness: 0, consistency: 0, syntaxValid: 0,
    },
    topFactors: [],
    recommendations: [],
    meta: { filePath, bytes: 0, lines: 0, weights: { ...DEFAULT_WEIGHTS }, version: '2.0', skipped: reason },
  };
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function round4(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10000) / 10000;
}

module.exports = {
  computeBugProbability,
  classifyRisk,
  CYCLOMATIC_CAP,
  MAX_DEPTH_CAP,
  DEFAULT_WEIGHTS,
  RISK_LEVELS,
};
