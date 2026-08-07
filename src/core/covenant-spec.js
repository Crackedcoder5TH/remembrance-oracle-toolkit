'use strict';

/**
 * Read the shared covenant spec from Void-Data-Compressor/covenant.json.
 *
 * Resolution order (first hit wins):
 *   1. process.env.COVENANT_SPEC_PATH
 *   2. ../Void-Data-Compressor/covenant.json relative to this file
 *   3. ./covenant.json in cwd
 *   4. fallback: throws — covenant cannot be assumed
 *
 * This is the JS twin of void's covenant_spec.py. Both modules read
 * the SAME file so a threshold change in one place propagates to the
 * other repo without code duplication.
 */

const fs = require('fs');
const path = require('path');

const FALLBACK_CANDIDATES = [
  path.resolve(__dirname, '../../../Void-Data-Compressor/covenant.json'),
  path.resolve(__dirname, '../../../void-data-compressor/covenant.json'),
  path.resolve(process.cwd(), 'covenant.json'),
];

let _cache = null;
let _cachedPath = null;

function _resolvePath() {
  if (process.env.COVENANT_SPEC_PATH && fs.existsSync(process.env.COVENANT_SPEC_PATH)) {
    return process.env.COVENANT_SPEC_PATH;
  }
  for (const p of FALLBACK_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function load() {
  if (_cache) return _cache;
  const p = _resolvePath();
  if (!p) {
    throw new Error(
      'covenant-spec: covenant.json not found. ' +
      'Set COVENANT_SPEC_PATH or place covenant.json in cwd.'
    );
  }
  _cache = JSON.parse(fs.readFileSync(p, 'utf8'));
  _cachedPath = p;
  return _cache;
}

function threshold(name, fallback = 0) {
  const v = load().thresholds[name];
  return typeof v === 'number' ? v : fallback;
}

function principles() { return load().principles; }
module.exports = {
  load,
  threshold,

  principles,

};

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
load.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 10, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
threshold.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
principles.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
