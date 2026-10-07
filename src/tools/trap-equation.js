/**
 * THE TRAP EQUATION — the live evaluator (the operator's naming and
 * ruling, 2026-09-30: complete the loop; the word entangled with its
 * identity).
 *
 * seeds/trap-equation.json carries the equation's FITTED CONSTANTS —
 * the lexical model (idf weights, each trap's normalized shape vector,
 * θ_I) fitted by Void-Data-Compressor/scripts/trap_equation.py from
 * measured distributions. This module APPLIES those constants to the
 * text of a guarded touch; it never refits, never builds a corpus of
 * its own (the fit is canonical in one place — rerunning the fitter is
 * how the equation optimizes toward its unbreakable form).
 *
 * The evaluated term is I(x) — the equation's dominant term (the fit
 * gave the structural 232-D term α = 0.09, and computing it needs the
 * one encoder, which is Python and shall not grow a JS twin: C-53).
 * The fire rule is the equation's own:
 *
 *     fire trap b* = argmax_b cos_idf(x, shape_b)   iff   I(x) > θ_I
 *
 * θ_I is fitted with false fires costed double, so this consumer stays
 * quieter than the hand-written match[] lists it generalizes — it adds
 * fires that vocabulary lists missed, it never replaces them.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let _cache = null;

function _readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_e) { return null; }
}
_readJSON.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 6, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function _load() {
  if (_cache !== null) return _cache;
  const eq = _readJSON(path.join(ROOT, 'seeds', 'trap-equation.json'));
  const db = _readJSON(path.join(ROOT, 'seeds', 'traps.seed.json'));
  const model = eq && eq.lexical_model;
  const traps = db && Array.isArray(db.traps) ? db.traps : null;
  if (!model || !model.idf || !Array.isArray(model.shapes) || !traps
      || model.shapes.length !== traps.length) {
    _cache = false;           // absent or out of step with the ledger: silent, never wrong
    return _cache;
  }
  _cache = { idf: model.idf, shapes: model.shapes, thetaI: Number(model.theta_I), traps };
  return _cache;
}
_load.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 10, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function _tokens(text) {
  return String(text || '').toLowerCase().match(/[a-z_][a-z0-9_]{2,}/g) || [];
}
_tokens.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 12, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * Evaluate THE TRAP EQUATION's I(x) on `text`.
 * Returns { trap, score, index } for the loudest trap iff I(x) > θ_I,
 * else null. Words the fitted vocabulary never saw carry no weight —
 * the constants are applied exactly as fitted.
 */
function fire(text) {
  const m = _load();
  if (!m) return null;
  const tf = Object.create(null);
  for (const w of _tokens(text)) {
    if (m.idf[w] !== undefined) tf[w] = (tf[w] || 0) + 1;
  }
  const words = Object.keys(tf);
  if (!words.length) return null;
  let norm = 0;
  for (const w of words) {
    const v = tf[w] * m.idf[w];
    tf[w] = v;
    norm += v * v;
  }
  norm = Math.sqrt(norm);
  if (!norm) return null;
  let best = -1, bestIdx = -1;
  for (let i = 0; i < m.shapes.length; i++) {
    const shape = m.shapes[i];
    let dot = 0;
    for (const w of words) {
      const sw = shape[w];
      if (sw !== undefined) dot += (tf[w] / norm) * sw;
    }
    if (dot > best) { best = dot; bestIdx = i; }
  }
  if (bestIdx < 0 || !(best > m.thetaI)) return null;
  return { trap: m.traps[bestIdx], score: best, index: bestIdx };
}
fire.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 5, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = { fire };
