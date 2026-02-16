/**
 * SERF v2 — Quantum-inspired reflection scoring formula.
 * Computes the reflection score for candidate code transformations.
 */

const EPSILON_BASE = 1e-6;
const R_EFF_BASE = 0.35;
const R_EFF_ALPHA = 0.8;
const H_RVA_WEIGHT = 0.06;
const H_CANVAS_WEIGHT = 0.12;
const DELTA_VOID_BASE = 0.08;
const LAMBDA_LIGHT = 0.10;
const MAX_LOOPS = 3;
const TARGET_COHERENCE = 0.9;

const STRATEGIES = [
  { name: 'simplify', description: 'Strip complexity, distill essence' },
  { name: 'secure', description: 'Harden against harm, guard boundaries' },
  { name: 'readable', description: 'Clarify flow, improve naming' },
  { name: 'unify', description: 'Harmonize patterns, ensure consistency' },
  { name: 'correct', description: 'Handle edges, add robustness' },
];

/**
 * Code similarity — the inner product ⟨Ψ_healed|Ψ(t)⟩
 */
function innerProduct(codeA, codeB) {
  const tokensA = new Set(codeA.match(/\b\w+\b/g) || []);
  const tokensB = new Set(codeB.match(/\b\w+\b/g) || []);
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  const tokenSim = union > 0 ? intersection / union : 0;

  const linesA = new Set(codeA.split('\n').map(l => l.trim()).filter(Boolean));
  const linesB = new Set(codeB.split('\n').map(l => l.trim()).filter(Boolean));
  const lineIntersect = [...linesA].filter(l => linesB.has(l)).length;
  const lineUnion = new Set([...linesA, ...linesB]).size;
  const lineSim = lineUnion > 0 ? lineIntersect / lineUnion : 0;

  return tokenSim * 0.5 + lineSim * 0.5;
}

/**
 * SERF v2 reflection scoring.
 */
function reflectionScore(candidate, previous, context = {}) {
  const { cascadeBoost = 1, targetCoherence = TARGET_COHERENCE } = context;

  const overlap = innerProduct(candidate.code, previous.code);
  const overlapSq = overlap * overlap;
  const distance = 1 - overlapSq;

  const H_0 = candidate.coherence;
  const H_RVA = H_RVA_WEIGHT * distance * candidate.coherence;
  const H_canvas = H_CANVAS_WEIGHT * (1 - overlap);

  const r_eff = R_EFF_BASE * (1 + R_EFF_ALPHA * Math.pow(distance, 4));
  const epsilon = EPSILON_BASE * (1 + 10 * distance);

  const O_healed = candidate.coherence;
  const O_current = previous.coherence;
  const projection = O_healed * overlap - O_current * overlapSq;
  const denominator = overlapSq + epsilon;

  const voidTerm = DELTA_VOID_BASE * distance * candidate.coherence;
  const cascadeAdditive = cascadeBoost - 1;
  const exploration = 1 - overlap;
  const canvasLight = LAMBDA_LIGHT * exploration * candidate.coherence;

  const score = (H_0 + H_RVA + H_canvas)
    + r_eff * (projection / denominator)
    + voidTerm
    + cascadeAdditive
    + canvasLight;

  return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
}

module.exports = {
  STRATEGIES,
  EPSILON_BASE,
  R_EFF_BASE,
  R_EFF_ALPHA,
  H_RVA_WEIGHT,
  H_CANVAS_WEIGHT,
  DELTA_VOID_BASE,
  LAMBDA_LIGHT,
  MAX_LOOPS,
  TARGET_COHERENCE,
  innerProduct,
  reflectionScore,
};
