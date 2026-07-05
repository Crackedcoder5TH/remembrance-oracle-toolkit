'use strict';

/**
 * compose.js — the full 5-layer encoder, standalone in the field tool.
 *
 * The published package is now the WHOLE telescope, not just its L1
 * lens. composed(text) → 145-D signature (L1 structural + L2 lexical +
 * L3 numerical + L4 spectral + L5 redundancy), byte-identical to the
 * oracle substrate's encoder-stack. The parity gate (test/) proves it.
 *
 * Zero dependencies beyond node:zlib (stdlib, used by L5). Deterministic.
 */

const { toFractalWaveform } = require('./fractal-waveform');
const { toLexicalWaveform } = require('./lexical-waveform');
const { toNumericalWaveform } = require('./numerical-waveform');
const { toSpectralWaveform } = require('./spectral-waveform');
const { toRedundancyWaveform } = require('./redundancy-waveform');

const LAYER_DIM = 29;
const DEPTHS = [toFractalWaveform, toLexicalWaveform, toNumericalWaveform, toSpectralWaveform, toRedundancyWaveform];

/** Compose to the given depth (1..5). Default 5 — the full stack. */
function composed(text, depth = 5) {
  const k = Math.max(1, Math.min(DEPTHS.length, depth));
  const out = new Float64Array(k * LAYER_DIM);
  for (let l = 0; l < k; l++) {
    const v = DEPTHS[l](text);
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

function composedCosineOf(a, b, depth = 5) {
  return composedCosine(composed(a, depth), composed(b, depth));
}

module.exports = { LAYER_DIM, composed, composedCosine, composedCosineOf };
