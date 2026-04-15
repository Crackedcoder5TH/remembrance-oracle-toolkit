'use strict';

/**
 * Risk-score factor table — data-driven detectors and recommendations.
 *
 * Split out from `risk-score.js` so the main scoring module can stay
 * under its own quality gate. Each entry is a self-contained detector:
 *
 *   name:           stable id
 *   detect(ctx):    returns null (skip) or { severity, message }
 *   recommend(ctx): returns a string; only called when detect matched
 *
 * The scoring module's `extractFactors()` iterates this table, runs
 * each detector against a context object, and returns a sorted list.
 *
 * Notable omission: `fractalAlignment` was in earlier drafts but the
 * Phase 1 correlation data went the WRONG direction — higher fractal
 * correlated with MORE bugs (ρ = +0.26), not fewer. Removing the
 * fractal factor avoids surfacing a claim the data does not support.
 * The raw value is still reported in `signals` for context, just not
 * as a "top risk factor" with a recommendation.
 */

const { CYCLOMATIC_CAP, MAX_DEPTH_CAP } = require('./risk-score-constants');

const FACTOR_TABLE = [
  {
    name: 'cyclomatic',
    detect: (ctx) => ctx.cyclomaticRisk >= 0.3
      ? { severity: ctx.cyclomaticRisk, message: `cyclomatic complexity ${ctx.cyclomatic} / ${CYCLOMATIC_CAP}` }
      : null,
    recommend: (ctx) => `Reduce cyclomatic complexity (${ctx.cyclomatic}) by extracting helpers, flattening conditionals, or using early returns. McCabe recommends ≤ 10.`,
  },
  {
    name: 'coherency',
    detect: (ctx) => ctx.coherencyRisk >= 0.25
      ? { severity: ctx.coherencyRisk, message: `total coherency ${(1 - ctx.coherencyRisk).toFixed(3)} (below 0.75 threshold)` }
      : null,
    recommend: (ctx) => `Total coherency is ${(1 - ctx.coherencyRisk).toFixed(3)}. Run \`oracle audit check --file <path>\` and address the top findings.`,
  },
  {
    name: 'maxDepth',
    detect: (ctx) => ctx.maxDepth > MAX_DEPTH_CAP
      ? { severity: Math.min(ctx.maxDepth / (MAX_DEPTH_CAP * 2), 1), message: `max nesting depth ${ctx.maxDepth} (>${MAX_DEPTH_CAP})` }
      : null,
    recommend: (ctx) => `Nesting depth ${ctx.maxDepth} exceeds ${MAX_DEPTH_CAP}. Extract inner blocks into named functions to flatten the control flow.`,
  },
  {
    name: 'completeness',
    detect: (ctx) => typeof ctx.completeness === 'number' && ctx.completeness < 0.7
      ? { severity: 1 - ctx.completeness, message: `completeness ${ctx.completeness.toFixed(2)} (missing error handling or edge cases)` }
      : null,
    recommend: () => `Add error handling and input validation — the analyzer detected missing edge-case coverage.`,
  },
];

/**
 * Run the factor table against a scoring context and return matched
 * factors sorted by severity descending. Pure function — neither the
 * table nor the context are mutated.
 */
function extractFactors(ctx) {
  const matched = [];
  for (const entry of FACTOR_TABLE) {
    const hit = entry.detect(ctx);
    if (!hit) continue;
    matched.push({
      name: entry.name,
      severity: round4(hit.severity),
      message: hit.message,
      recommendation: entry.recommend(ctx),
    });
  }
  return matched.slice().sort((a, b) => b.severity - a.severity);
}

/**
 * Build a flat `signals` object from a coherency-score result.
 * Lives in this file rather than risk-score.js so the main scoring
 * module stays under its own cyclomatic gate (each `??` operator
 * adds 1 to the file's cyclomatic count, so 8 signal extractions
 * burn through the budget fast).
 */
function buildSignals(total, cyclomatic, maxDepth, lines, score) {
  const b = score.breakdown || {};
  return {
    totalCoherency: round4(total),
    cyclomatic,
    maxDepth,
    lines,
    fractalAlignment: round4(b.fractalAlignment ?? 0),
    completeness: round4(b.completeness ?? 0),
    consistency: round4(b.consistency ?? 0),
    syntaxValid: round4(b.syntaxValid ?? 0),
  };
}

/**
 * Score a file with the coherency engine, swallowing parse errors
 * and returning null on failure. Moved here for the same reason as
 * buildSignals — try/catch adds cyclomatic pressure on risk-score.js.
 */
function tryScore(code, options) {
  const { computeCoherencyScore } = require('../unified/coherency');
  try {
    return computeCoherencyScore(code, {
      filePath: options.filePath,
      language: options.language,
    });
  } catch { return null; }
}

function round4(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10000) / 10000;
}

module.exports = {
  FACTOR_TABLE,
  extractFactors,
  buildSignals,
  tryScore,
  round4,
};
