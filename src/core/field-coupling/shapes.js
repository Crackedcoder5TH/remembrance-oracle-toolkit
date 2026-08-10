'use strict';
const { quiet } = require('../quiet');

/**
 * field-coupling/shapes.js — variance-signature growth — the recognised-natural shape registry, grown only from already-verified material; persistence rides a sealed covenant gate.
 * Extracted verbatim from src/core/field-coupling.js in decomposition #4;
 * inline requires repathed one level deeper.
 */


// Persisting a learned shape appends to the growth log — a real
// mutation, so it rides the covenant gate like every other write.
const { createGate, requireGate } = require('../covenant-fractal');
const _appendLearnedShape = requireGate((gate, line) => require('node:fs').appendFileSync(_LEARNED_PERSIST_PATH, line));
const _sealedGate = () => createGate().seal({ charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid', reactivity: 'inert', electronegativity: 0.2, group: 12, period: 2, harmPotential: 'none', alignment: 'neutral', intention: 'benevolent', domain: 'field-memory' });

// ── Variance-signature growth (parallel to covenant growth) ──────────────
//
// The variance gate is grown the same way the covenant is grown: a shape
// signature becomes a recognised-natural shape only after a contribution
// with that signature has already passed both oracles (coherency +
// signal-validity) and been absorbed. Once recognised, future contributions
// with structurally similar signatures classify as `learned-natural` and
// bypass the H3-default narrow-band/constant rejection.
//
// Discipline: the gate does not learn from any contribution — only from
// ones that have already proven coherent. The same ratchet as the covenant.
// The H3-derived thresholds (constant <= 0.0005, narrow <= 0.005, etc.)
// remain the floor; the learned set grows what counts as "natural" *above*
// the floor.
const _LEARNED_SHAPES = [];

const _LEARNED_PERSIST_PATH = (function () {
  try {
    const path = require('node:path');
    return path.join(process.env.REMEMBRANCE_HOME || process.cwd(), '.remembrance', 'variance-signature-growth.jsonl');
  } catch (_) { return null; }
})();

let _learnedLoaded = false;

function _loadLearnedShapes() {
  if (_learnedLoaded) return;
  _learnedLoaded = true;
  if (!_LEARNED_PERSIST_PATH) return;
  try {
    const fs = require('node:fs');
    if (!fs.existsSync(_LEARNED_PERSIST_PATH)) return;
    const lines = fs.readFileSync(_LEARNED_PERSIST_PATH, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const sig = JSON.parse(line);
        if (Number.isFinite(sig.mean) && Number.isFinite(sig.variance) && Number.isFinite(sig.n)) {
          _LEARNED_SHAPES.push(sig);
        }
      } catch (_) { quiet('core:field-coupling:shapes:require', _); /* skip malformed line */ }
    }
  } catch (_) { quiet('core:field-coupling:shapes:require', _); /* best-effort */ }
}

function _persistLearnedShape(sig) {
  if (!_LEARNED_PERSIST_PATH) return false;
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const dir = path.dirname(_LEARNED_PERSIST_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _appendLearnedShape(_sealedGate(), JSON.stringify(sig) + '\n');
    return true;
  } catch (_) { return false; }
}

// A candidate matches a learned signature when its (mean, variance, n)
// are within tolerance of an entry's. Tolerances:
//   mean      ± 0.10           (close-enough centre)
//   variance  ratio in [0.5, 2.0]  (same order of magnitude)
//   n         within a factor of 4 (similar batch scale)
function _matchesLearnedShape(input) {
  _loadLearnedShapes();
  if (_LEARNED_SHAPES.length === 0) return null;
  const MEAN_TOL = 0.10;
  for (const sig of _LEARNED_SHAPES) {
    if (Math.abs(input.mean - sig.mean) > MEAN_TOL) continue;
    // Variance: 0-vs-0 is exact match; otherwise check ratio.
    if (sig.variance === 0 && input.variance === 0) {
      // both constant — also require n similarity below
    } else {
      const denom = Math.max(sig.variance, 1e-9);
      const ratio = input.variance / denom;
      if (ratio < 0.5 || ratio > 2.0) continue;
    }
    // n similarity — within a factor of 4. Single-shot (n=1) only matches
    // single-shot learned signatures.
    if (input.n === 1 && sig.n !== 1) continue;
    if (input.n !== 1 && sig.n !== 1) {
      const nRatio = input.n / sig.n;
      if (nRatio < 0.25 || nRatio > 4.0) continue;
    }
    return sig;
  }
  return null;
}

/**
 * Record a shape signature as recognised-natural. Called by the
 * covenant-trust absorption path after BOTH oracles have already
 * accepted the contribution and the pattern has been absorbed. Same
 * discipline as covenant growth: the gate only learns from
 * already-verified material. The H3 default thresholds remain the
 * floor; learned signatures grow what counts as natural above the floor.
 *
 * @param {{mean:number, variance:number, n:number, source?:string}} sig
 * @returns {boolean} true if recorded, false if rejected (malformed or duplicate)
 */
function recordLearnedShape(sig) {
  _loadLearnedShapes();
  if (!sig || !Number.isFinite(sig.mean) || !Number.isFinite(sig.variance) || !Number.isFinite(sig.n)) return false;
  // Skip if a structurally-equivalent signature is already learned.
  if (_matchesLearnedShape({ mean: sig.mean, variance: sig.variance, n: sig.n })) return false;
  const record = {
    mean: sig.mean,
    variance: sig.variance,
    n: sig.n,
    source: sig.source || 'unknown',
    learnedAt: new Date().toISOString(),
  };
  _LEARNED_SHAPES.push(record);
  _persistLearnedShape(record);
  return true;
}

recordLearnedShape.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Read-only snapshot of the recognised shape signatures. */
function recognizedShapeSignatures() {
  _loadLearnedShapes();
  return _LEARNED_SHAPES.slice();
}

recognizedShapeSignatures.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Test-only: clear the in-memory learned set. Does not delete persisted log. */
function _resetLearnedShapes() { _LEARNED_SHAPES.length = 0; _learnedLoaded = true; }

// ── Learned shapes grouped by source-prefix domain ───────────────────────

/**
 * Group recognised shape signatures by source-prefix domain (e.g.
 * 'void:', 'agent:', 'meta:', 'covenant:'). Tells you which domains
 * have taught the variance gate what natural shapes look like.
 *
 * @returns {object} { 'void': [...], 'agent': [...], ... }
 */
function learnedShapesByDomain() {
  _loadLearnedShapes();
  const out = {};
  for (const sig of _LEARNED_SHAPES) {
    const src = sig.source || 'unknown';
    const domain = src.includes(':') ? src.split(':')[0] : src;
    if (!out[domain]) out[domain] = [];
    out[domain].push(sig);
  }
  return out;
}

learnedShapesByDomain.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = { _loadLearnedShapes, _persistLearnedShape, _matchesLearnedShape, recordLearnedShape, recognizedShapeSignatures, _resetLearnedShapes, learnedShapesByDomain };
