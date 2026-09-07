'use strict';

/**
 * code-to-waveform.js — oracle's canonical encoder. ONE representation.
 *
 * `codeToWaveform` IS the 232-D fractal decoder at its active depth
 * (decoder-stack.composedAtDepth, 8 layers × 29). It used to be the 29-D L1
 * alone (fractal-waveform.toFractalWaveform), and before that the 256-sample
 * byte-stretch. Both are retired here: the L1 is the first 29 dims of the
 * one vector and is never carried as a vector of its own, and nothing in the
 * ecosystem encodes to 256-D (see RETIRED_BYTE_LEN below).
 *
 * `waveformCosine` is the one cosine (ECOSYSTEM §7): decoder-stack's
 * composedCosine, which carries both vectors into the one whitened space.
 * A vector that is not the canonical width is not a reading — NaN says
 * "no vector", never a number (0 would read as orthogonal, which is a
 * reading). This is what makes a stale row invisible instead of wrong.
 *
 * Migration: field rows written before this carried 29-D (and, earlier,
 * 256-D) waveforms; scripts/migrate-waveforms-to-fractal.js re-encodes any
 * row whose width is not TARGET_LEN from its source `code` column.
 *
 * Cross-language parity: Python reaches the same decoder through Void's
 * canonical_vector.py (WIDTH = 232), so JS↔Python parity holds for the
 * canonical vector itself (contract C-67 drives both engines).
 */

const { composedAtDepth, composedCosine, currentDepth } = require('./decoder-stack');

const LAYER_DIM = 29;

// THE width: the decoder at its active depth, asked for — never written down.
const TARGET_LEN = currentDepth() * LAYER_DIM;

// ─── RETIRED: the 256-D byte-stretch ──────────────────────────────────────
// The byte-stretch pair (linear-interpolated UTF-8 bytes onto a 256-point
// grid) were the previous representation of a pattern. They could not tell
// code from prose (a JS file and a README read 0.86 cosine, above real
// code-vs-code pairs) and were retired with Void's to_waveform.py
// (ECOSYSTEM §7). The functions are GONE. The one number that survives is
// the width, so the migration script can still recognise legacy rows on
// disk. It is a marker of what was, never a target to encode to.
const RETIRED_BYTE_LEN = 256;

/**
 * The canonical vector of a text: the 232-D decoder at the active depth.
 * Empty / non-string input is the zero vector at the canonical width.
 * @param {string} input
 * @returns {Float64Array}
 */
function codeToWaveform(input) {
  if (typeof input !== 'string' || input.length === 0) return new Float64Array(TARGET_LEN);
  return composedAtDepth(input, currentDepth());
}

/**
 * The one cosine between two canonical vectors, in the one space.
 * NaN when either side is not a canonical-width vector (no reading);
 * 0 when either side has no structure (the zero vector).
 */
function waveformCosine(a, b) {
  if (!_canonical(a) || !_canonical(b)) return NaN;
  return composedCosine(a, b);
}

function _canonical(v) {
  return !!v && typeof v.length === 'number' && v.length === TARGET_LEN;
}

// ─── Stable fingerprint (used for dedup IDs across the codebase) ─────────

/** FNV-1a over the waveform's 4-decimal string form. Deterministic and
 * dependency-free. Note: this hash changes when the encoder changes, so
 * digests recorded by an earlier encoder differ from digests computed by
 * the decoder for the same source. */
function digestWaveform(wf) {
  let h = 0x811c9dc5;
  for (let i = 0; i < wf.length; i++) {
    const s = wf[i].toFixed(4);
    for (let j = 0; j < s.length; j++) {
      h ^= s.charCodeAt(j);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

// ─── Canonical exports ───────────────────────────────────────────────────

module.exports = {
  // Canonical: the 232-D decoder at its active depth.
  TARGET_LEN,
  LAYER_DIM,
  codeToWaveform,
  waveformCosine,
  digestWaveform,
  // The retired representation's width — a marker for migration, not an encoder.
  RETIRED_BYTE_LEN,
};

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
codeToWaveform.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
waveformCosine.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
_canonical.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
digestWaveform.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 13, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
