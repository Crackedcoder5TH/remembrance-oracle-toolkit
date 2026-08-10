'use strict';
const { quiet } = require('../core/quiet');

/**
 * coherency_v1 — published unified coherency formula.
 *
 * See COHERENCY_V1_SPEC.md (Void-Data-Compressor repo). JS twin of
 * void's coherency_v1.py. Both MUST produce identical floats for
 * the same input — this is enforced via shared test fixtures.
 */

const covenantSpec = require('../core/covenant-spec');

function compute({ textScore = null, waveformScore = null, atomicScore = null } = {}) {
  const components = [];
  if (textScore !== null && textScore !== undefined) components.push(_clip01(textScore));
  if (waveformScore !== null && waveformScore !== undefined) components.push(_clip01(waveformScore));
  if (atomicScore !== null && atomicScore !== undefined) components.push(_clip01(atomicScore));

  let unified;
  if (components.length === 0) {
    unified = 0.0;
  } else {
    let product = 1.0;
    for (const x of components) product *= x;
    unified = Math.pow(product, 1.0 / components.length);
  }

  const __retVal = {
    text_score:     _roundOrNull(textScore),
    waveform_score: _roundOrNull(waveformScore),
    atomic_score:   _roundOrNull(atomicScore),
    unified:        _round(unified, 12),
  };
  // ── LRE field-coupling (auto-wired) ──
  try {
    const __lre_p1 = '../core/field-coupling';
    const __lre_p2 = require('path').join(__dirname, '../core/field-coupling');
    for (const __p of [__lre_p1, __lre_p2]) {
      try {
        const { recordCost: __recordCost } = require(__p);
        __recordCost({ units: 1, kind: 'work', source: 'oracle:coherency-v1:compute' });
        break;
      } catch (_) { quiet('unified:coherency-v1:__recordCost', _); /* try next */ }
    }
  } catch (_) { quiet('unified:coherency-v1:__recordCost', _); /* best-effort */ }
  return __retVal;
}

function label(unified) {
  if (unified >= covenantSpec.threshold('transcendence')) return 'transcendence';
  if (unified >= covenantSpec.threshold('synergy'))       return 'synergy';
  if (unified >= covenantSpec.threshold('stability'))     return 'stability';
  if (unified >= covenantSpec.threshold('pull_threshold')) return 'pull';
  if (unified >= covenantSpec.threshold('covenant_gate')) return 'gate';
  return 'rejection';
}

function _clip01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0.0;
  if (n < 0) return 0.0;
  if (n > 1) return 1.0;
  return n;
}

function _round(x, d) {
  const k = Math.pow(10, d);
  return Math.round(x * k) / k;
}

function _roundOrNull(x) {
  return (x === null || x === undefined) ? null : _round(Number(x), 12);
}

module.exports = { compute, label };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
compute.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
label.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
