'use strict';

/**
 * File-level bug-probability risk score.
 *
 * Phase 2 of the coherence-bug-detector work. Full empirical rationale
 * in docs/benchmarks/risk-score-phase2-2026-04-15.md. TL;DR:
 *
 *   - Phase 1 found Oracle semantic coherency correlates at ρ = -0.30
 *     and cyclomatic complexity correlates at ρ = +0.35 with audit
 *     finding count.
 *   - Phase 2 ablation tested 8 weight combinations against the same
 *     20-file corpus. NO combination beat raw cyclomatic alone.
 *   - Shipped v1 default is cyclomatic-only with a 30-cap plateau
 *     (ρ = +0.37, marginal +0.02 over raw cyclomatic).
 *   - `options.weights` escape hatch stays open for v2 with more data.
 *
 * The factor table + constants are split into their own files
 * (risk-factors.js, risk-score-constants.js) so this module stays
 * thin and scorable under its own quality gate.
 *
 * Pure function. No side effects. Safe to call concurrently.
 */

const {
  extractFactors,
  buildSignals,
  tryScore,
  round4,
} = require('./risk-factors');
const {
  CYCLOMATIC_CAP,
  MAX_DEPTH_CAP,
  DEFAULT_WEIGHTS,
  RISK_LEVELS,
} = require('./risk-score-constants');

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Compute a bug-probability risk score for a source file.
 *
 * @param {string} code - The source code to analyze.
 * @param {object} [options]
 *   - filePath: path hint so coherency scoring can pick a language
 *   - weights:  override DEFAULT_WEIGHTS for experimentation
 * @returns {object} structured risk result with probability, riskLevel,
 *                   components, signals, topFactors, recommendations, meta
 */
function computeBugProbability(code, options = {}) {
  if (typeof code !== 'string' || code.length === 0) {
    return emptyResult(options.filePath || null, 'empty input');
  }

  const weights = normalizeWeights(options.weights || DEFAULT_WEIGHTS);

  const score = tryScore(code, options);
  if (!score) return emptyResult(options.filePath || null, 'coherency scoring failed');

  const total = typeof score.total === 'number' ? score.total : 0;
  const ast = score.astAnalysis?.complexity;
  const cyclomatic = ast?.cyclomatic ?? 1;
  const maxDepth = ast?.maxDepth ?? 0;
  const lines = ast?.lines ?? code.split('\n').length;

  const coherencyRisk = clamp01(1 - total);
  // CYCLOMATIC_CAP is a module constant = 30, never zero — the `|| 1`
  // is a belt-and-braces guard for the flow-insensitive auditor.
  const cyclomaticRisk = clamp01(cyclomatic / (CYCLOMATIC_CAP || 1));

  const probability = clamp01(
    weights.coherency * coherencyRisk +
    weights.cyclomatic * cyclomaticRisk,
  );

  const signals = buildSignals(total, cyclomatic, maxDepth, lines, score);
  const ctx = {
    coherencyRisk, cyclomaticRisk, cyclomatic, maxDepth,
    completeness: score.breakdown?.completeness,
  };
  const matched = extractFactors(ctx);

  return {
    probability: round4(probability),
    riskLevel: classifyRisk(probability),
    components: {
      coherencyRisk: round4(coherencyRisk),
      cyclomaticRisk: round4(cyclomaticRisk),
    },
    signals,
    topFactors: matched.map(f => ({ name: f.name, severity: f.severity, message: f.message })),
    recommendations: matched.length > 0
      ? matched.map(f => f.recommendation)
      : ['No high-severity factors detected. Routine maintenance only.'],
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
 * Return the risk-level label for a probability value. Exported so
 * callers can threshold against the same buckets as the scorer.
 */
function classifyRisk(probability) {
  const p = clamp01(probability);
  if (p >= RISK_LEVELS.HIGH.min)   return RISK_LEVELS.HIGH.label;
  if (p >= RISK_LEVELS.MEDIUM.min) return RISK_LEVELS.MEDIUM.label;
  return RISK_LEVELS.LOW.label;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function normalizeWeights(w) {
  const c = Number(w.coherency);
  const y = Number(w.cyclomatic);
  const cFinite = Number.isFinite(c) ? c : 0;
  const yFinite = Number.isFinite(y) ? y : 0;
  const sum = cFinite + yFinite;
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  return { coherency: cFinite / sum, cyclomatic: yFinite / sum };
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
    meta: {
      filePath, bytes: 0, lines: 0,
      weights: { ...DEFAULT_WEIGHTS },
      version: '2.0',
      skipped: reason,
    },
  };
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

module.exports = {
  computeBugProbability,
  classifyRisk,
  CYCLOMATIC_CAP,
  MAX_DEPTH_CAP,
  DEFAULT_WEIGHTS,
  RISK_LEVELS,
};

// ── Atomic self-description (batch-generated) ────────────────────
computeBugProbability.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
classifyRisk.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 2, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
