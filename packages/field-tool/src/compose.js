'use strict';

/**
 * compose.js — the full 7-layer encoder, standalone in the field tool.
 *
 * The published package is now the WHOLE telescope, not just its L1
 * lens. composed(text) → 203-D signature (L1 structural + L2 lexical +
 * L3 numerical + L4 spectral + L5 redundancy + L6 content-projection +
 * L7 dimensional/2D), byte-identical to the oracle substrate's
 * decoder-stack. The parity gate (test/) proves it.
 *
 * Zero dependencies beyond node:zlib (stdlib, used by L5/L6/L7).
 * Deterministic.
 */

const { toFractalWaveform } = require('./fractal-waveform');
const { toLexicalWaveform } = require('./lexical-waveform');
const { toNumericalWaveform } = require('./numerical-waveform');
const { toSpectralWaveform } = require('./spectral-waveform');
const { toRedundancyWaveform } = require('./redundancy-waveform');
const { toContentProjection } = require('./content-projection');
const { toDimensionalWaveform } = require('./dimensional-waveform');
const { toDynamicalWaveform } = require('./dynamical-waveform');

const LAYER_DIM = 29;
const DEPTHS = [toFractalWaveform, toLexicalWaveform, toNumericalWaveform, toSpectralWaveform, toRedundancyWaveform, toContentProjection, toDimensionalWaveform, toDynamicalWaveform];

/** Compose to the given depth (1..8). Default 8 — the full stack.
 *  `input` is the serialized signal to encode (source text OR a retained
 *  waveform/series) — the substrate feeds the compressed form, not source. */
function composed(input, depth = 8) {
  const k = Math.max(1, Math.min(DEPTHS.length, depth));
  const out = new Float64Array(k * LAYER_DIM);
  for (let l = 0; l < k; l++) {
    const v = DEPTHS[l](input);
    for (let i = 0; i < LAYER_DIM; i++) out[l * LAYER_DIM + i] = v[i];
  }
  return out;
}

/** Cosine between two same-length composed signatures. */
function composedCosine(a, b) {
  let d = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0;
}

function composedCosineOf(a, b, depth = 8) {
  return composedCosine(composed(a, depth), composed(b, depth));
}

module.exports = { LAYER_DIM, composed, composedCosine, composedCosineOf };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
composed.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 1, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
composedCosine.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 1, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
composedCosineOf.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
