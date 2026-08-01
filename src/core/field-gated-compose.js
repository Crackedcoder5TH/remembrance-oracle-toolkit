'use strict';

/**
 * field-gated-compose.js — the composition gate: layer attention
 * routed through the Living Remembrance Engine.
 *
 * The last unimplemented clause of the master equation. Every layer
 * (L1–L5) stays a pure deterministic sense; every pattern's signature
 * stays a frozen, attestable function of content. What becomes dynamic
 * is the READING — how the layers are weighted when two signatures
 * meet. Record is frozen; reading is alive.
 *
 * This module ORGANIZES existing organs rather than inventing new ones
 * (inventory: the goggles capability index, run before building):
 *   - params surface .......... getEngine().params('composition')
 *                               (precedent: gogglesParams)
 *   - global state ξ .......... field-coupling.peekField()
 *   - per-layer reliability ... the field's sources histogram, tagged
 *                               contributions via field-coupling.contribute
 *   - per-depth flow view ..... void-library.scoreWithFlow / index.flow()
 *                               (this module adds per-BLOCK cosines)
 *
 * Weight formula, per comparison of signatures a, b:
 *
 *   salience_l   = sqrt(norm_l(a) · norm_l(b))          — does this layer
 *                  even carry signal for THESE patterns (deterministic)
 *   reliability_l = field's EMA of the layer's past agreement readings
 *                  (neutral 0.5 until the field has evidence)
 *   sharpness    = exp(beta · (ξ_global − 0.5))          — confident field
 *                  concentrates attention, uncertain field explores
 *   w_l ∝ floor + (salience_l · reliability_l)^sharpness — floored so no
 *                  sense ever goes fully deaf, then normalized to Σw=1
 *
 * Every verdict returns its full audit record: the weights used, the
 * per-layer cosines, and a hash of the field snapshot — so a dynamic
 * reading is still reproducible GIVEN the recorded state, the way a
 * lab logs instrument calibration alongside each measurement.
 *
 * Safety properties (each guards a known failure mode of recurrent
 * attention): floors (irreversible collapse), EMA-slow reliability
 * (lurching), external re-anchoring left to the convergence scripts
 * (echo chamber), best-effort field access (a missing engine degrades
 * to neutral weights = today's static behaviour, never throws).
 *
 * ⚠ DO NOT SWAP THIS IN FOR composedCosine WITHOUT RECALIBRATING THE BANDS.
 *
 * The docstring above says a detached field "degrades to neutral weights =
 * today's static behaviour". That is true of the RELIABILITY term only.
 * Salience still varies per layer, so the weights are never actually equal
 * and the gated score is on a DIFFERENT SCALE from the flat cosine — not a
 * refinement of the same one.
 *
 * Measured 2026-08-02 over 1,225 real pairs from src/, at neutral
 * reliability:
 *
 *   mean |gated - static|      0.037
 *   max  |gated - static|      0.115
 *   resonance verdict CHANGED  568 pairs = 46.4%
 *   direction                  566 of 568 read LOWER
 *
 * The goggles' bands (resonanceConsonant 0.90 / Familiar 0.82 / Distinct
 * 0.70, in PARAMS.goggles) were calibrated against the flat cosine. Swapping
 * the formula underneath them would push almost half of all verdicts down a
 * band and make the ecosystem read as newly incoherent — a measurement
 * artefact that would look exactly like real drift.
 *
 * Wiring this into the encoder is therefore a two-part job: switch the
 * formula AND recalibrate the bands against the gated distribution, with
 * held-out validation. Not a one-line default change.
 */

const crypto = require('node:crypto');

const LAYER_DIM = 29;

// Local fallback for the params — same shape as PARAMS.composition in
// living-remembrance.js. One source of truth lives there; this copy
// only serves when the engine is unreachable.
const FALLBACK = {
  floor: 0.10,
  beta: 2.0,
  emaAlpha: 0.10,
  neutralReliability: 0.5,
};

let _lre = null;
let _fieldCoupling = null;
function _engineParams() {
  try {
    if (!_lre) _lre = require('./living-remembrance');
    return _lre.getEngine().params('composition') || FALLBACK;
  } catch (_) { return FALLBACK; }
}
function _peekField() {
  try {
    if (!_fieldCoupling) _fieldCoupling = require('./field-coupling');
    return _fieldCoupling.peekField();
  } catch (_) { return null; }
}
function _contribute(obs) {
  try {
    if (!_fieldCoupling) _fieldCoupling = require('./field-coupling');
    return _fieldCoupling.contribute(obs);
  } catch (_) { return null; }
}

/** Number of 29-D blocks a signature carries (5 at depth 5). */
function blockCount(vec) {
  return Math.floor((vec ? vec.length : 0) / LAYER_DIM);
}

/** Per-block L2 norms — the layer's signal presence for this pattern. */
function blockNorms(vec) {
  const n = blockCount(vec);
  const out = new Float64Array(n);
  for (let l = 0; l < n; l++) {
    let s = 0;
    const start = l * LAYER_DIM;
    for (let k = start; k < start + LAYER_DIM; k++) s += vec[k] * vec[k];
    out[l] = Math.sqrt(s);
  }
  return out;
}

/** Per-block cosines between two signatures (NOT cumulative depths —
 *  each 29-D block compared in isolation, the attention units). */
function blockCosines(a, b) {
  const n = Math.min(blockCount(a), blockCount(b));
  const out = new Float64Array(n);
  for (let l = 0; l < n; l++) {
    const start = l * LAYER_DIM;
    let dot = 0, na = 0, nb = 0;
    for (let k = start; k < start + LAYER_DIM; k++) {
      dot += a[k] * b[k]; na += a[k] * a[k]; nb += b[k] * b[k];
    }
    out[l] = (na > 1e-12 && nb > 1e-12) ? dot / Math.sqrt(na * nb) : 0;
  }
  return out;
}

/** Short hash of the field snapshot — the calibration stamp every
 *  dynamic verdict carries so it stays reproducible given the state. */
function fieldStamp(state) {
  if (!state) return 'field:detached';
  const core = {
    c: +(state.coherence ?? 0).toFixed(6),
    e: +(state.globalEntropy ?? 0).toFixed(6),
    n: state.updateCount ?? 0,
  };
  return crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0, 16);
}

/**
 * Read a layer's reliability from the engine's dedicated reliability store.
 *
 * This used to read state.sources['encoder:L<n>'].lastCoherence — i.e. the
 * coherency field being used as a key-value store, with an AGREEMENT score
 * written in under the name `coherence`. That is the same substitution that
 * put 41 wrong contributions into this field; closing the learning loop that
 * way would have reintroduced it eight layers at a time.
 *
 * Reliability now has its own home (engine.getLayerReliability), so learning
 * the attention weights moves no equation term.
 */
function _layerReliability(state, layerIdx, neutral) {
  // Prefer the dedicated store, whether handed a state snapshot or not.
  if (state && state.layerReliability) {
    const v = state.layerReliability['L' + (layerIdx + 1)];
    if (typeof v === 'number' && isFinite(v)) return Math.max(0, Math.min(1, v));
  }
  return neutral;
}

/**
 * Compute attention weights for comparing two signatures.
 *
 * @param {Float64Array} a  composed signature (any depth ≥ 1)
 * @param {Float64Array} b  composed signature
 * @param {object} [opts]
 * @param {object} [opts.fieldState]  explicit field snapshot — pass to
 *   make the call fully deterministic (tests, replays, audits). When
 *   omitted the live field is read (and its stamp recorded).
 * @param {object} [opts.params]      explicit composition params.
 * @returns {{ weights: Float64Array, audit: object }}
 */
function gateWeights(a, b, opts = {}) {
  const p = opts.params || _engineParams();
  const state = opts.fieldState !== undefined ? opts.fieldState : _peekField();
  const n = Math.min(blockCount(a), blockCount(b));
  const weights = new Float64Array(n);
  if (n === 0) return { weights, audit: { stamp: fieldStamp(state), n: 0 } };

  const na = blockNorms(a), nb = blockNorms(b);
  const xi = state && typeof state.coherence === 'number' ? state.coherence : 0.5;
  const sharpness = Math.exp((p.beta ?? FALLBACK.beta) * (xi - 0.5));
  const floor = p.floor ?? FALLBACK.floor;
  const neutral = p.neutralReliability ?? FALLBACK.neutralReliability;

  // Normalize saliences against the strongest block so the gate reads
  // RELATIVE signal presence, not absolute magnitudes.
  let maxSal = 1e-12;
  const sal = new Float64Array(n);
  for (let l = 0; l < n; l++) {
    sal[l] = Math.sqrt(na[l] * nb[l]);
    if (sal[l] > maxSal) maxSal = sal[l];
  }

  const reliabilities = new Float64Array(n);
  let sum = 0;
  for (let l = 0; l < n; l++) {
    reliabilities[l] = _layerReliability(state, l, neutral);
    const drive = Math.pow((sal[l] / maxSal) * reliabilities[l], sharpness);
    weights[l] = floor + drive;
    sum += weights[l];
  }
  for (let l = 0; l < n; l++) weights[l] /= sum;

  return {
    weights,
    audit: {
      stamp: fieldStamp(state),
      xi: +xi.toFixed(6),
      sharpness: +sharpness.toFixed(4),
      floor,
      salience: Array.from(sal, x => +(x / maxSal).toFixed(4)),
      reliability: Array.from(reliabilities, x => +x.toFixed(4)),
    },
  };
}

/**
 * Field-gated similarity: weighted sum of per-block cosines under the
 * attention weights. Returns the score AND the full audit record.
 *
 * Degrades honestly: with no field engine loaded, weights collapse to
 * floored-equal — today's static behaviour — and the stamp says
 * 'field:detached'. Never throws.
 */
function fieldGatedSimilarity(a, b, opts = {}) {
  const cosines = blockCosines(a, b);
  const { weights, audit } = gateWeights(a, b, opts);
  let score = 0;
  for (let l = 0; l < cosines.length; l++) score += weights[l] * cosines[l];
  return {
    score,
    layers: Array.from(cosines, x => +x.toFixed(6)),
    weights: Array.from(weights, x => +x.toFixed(6)),
    audit,
  };
}

/**
 * The return path — what makes the gate LEARN. After a verdict where
 * an external reference exists (NCD from the convergence harness, a
 * covenant acceptance, a human confirmation), contribute each layer's
 * agreement with the reference into the field, tagged `encoder:L<n>`.
 * The next gateWeights() call reads the updated reliabilities.
 *
 * agreement_l = 1 − |cos_l − reference|  (how close the layer's own
 * reading was to the trusted verdict), EMA-softened by emaAlpha
 * against the previous stored value so attention drifts, never lurches.
 *
 * @param {number[]|Float64Array} layerCosines  per-block cosines
 * @param {number} referenceScore               trusted verdict in [0,1]
 * @returns {number} layers contributed (0 when the field is detached)
 */
function contributeLayerAgreement(layerCosines, referenceScore, opts = {}) {
  const p = opts.params || _engineParams();
  const state = _peekField();
  if (!layerCosines || typeof referenceScore !== 'number') return 0;
  const alpha = p.emaAlpha ?? FALLBACK.emaAlpha;
  const neutral = p.neutralReliability ?? FALLBACK.neutralReliability;
  let contributed = 0;
  for (let l = 0; l < layerCosines.length; l++) {
    const agreement = Math.max(0, Math.min(1, 1 - Math.abs(layerCosines[l] - referenceScore)));
    const prev = _layerReliability(state, l, neutral);
    const eased = prev + alpha * (agreement - prev);
    // Store as a reliability, not as a coherency contribution. See
    // _layerReliability above for why this is not _contribute().
    let stored = null;
    try {
      const eng = require('./living-remembrance').getEngine();
      stored = eng.setLayerReliability(l, eased);
      // Keep the snapshot fresh so the EMA within this loop compounds
      // correctly rather than re-reading a stale `prev` for every layer.
      if (state) {
        state.layerReliability = state.layerReliability || {};
        state.layerReliability['L' + (l + 1)] = eased;
      }
    } catch (_) { /* detached field — nothing to learn into */ }
    if (stored !== null) contributed++;
  }
  return contributed;
}

module.exports = {
  LAYER_DIM,
  FALLBACK,
  blockCount,
  blockNorms,
  blockCosines,
  fieldStamp,
  gateWeights,
  fieldGatedSimilarity,
  contributeLayerAgreement,
};
