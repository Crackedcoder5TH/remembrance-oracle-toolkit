'use strict';

/**
 * code-to-waveform.js — oracle's canonical encoder.
 *
 * As of fractal-waveform v0.1, `codeToWaveform` and `waveformCosine` ARE
 * the structural fractal versions from ./fractal-waveform. The byte-stretch
 * (the original 256-D linear-interpolated UTF-8) is RETIRED and removed —
 * see RETIRED_BYTE_LEN below. Nothing in the ecosystem encodes to 256-D.
 *
 * Why: byte-stretch could not discriminate code from prose — a JS source
 * file and a markdown README scored 0.86 cosine, higher than several real
 * code-vs-code pairs. Fractal-waveform encodes the ecosystem's existing
 * structural vocabulary (atomic properties + structural histograms +
 * structurality), then gates the cosine by structurality agreement.
 *
 * Migration note: stored waveforms from before this change are 256-D and
 * cannot be compared against new 29-D fractal vectors. `waveformCosine`
 * returns 0 on length mismatch (instead of silently truncating to
 * `Math.min(a.length, b.length)` and producing meaningless numbers).
 * Field-memory entries with legacy `waveform: [256 floats]` will simply
 * not match new queries until re-encoded.
 *
 * Cross-language parity: Void's legacy `to_waveform.py` was DELETED
 * (2026-07, ECOSYSTEM §7) — Python reaches the canonical fractal stack
 * through Void's `fractal_encoder.py` node bridge, so JS↔Python parity
 * now holds for the canonical encoder itself.
 */

const {
  FRACTAL_DIM,
  toFractalWaveform,
  fractalCoherency,
} = require('./fractal-waveform');

// ─── RETIRED: the 256-D byte-stretch ──────────────────────────────────────
// The byte-stretch pair (linear-interpolated UTF-8
// bytes onto a 256-point grid) were the previous representation of a
// pattern. They could not tell code from prose (a JS file and a README read
// 0.86 cosine, above real code-vs-code pairs) and were retired with Void's
// to_waveform.py (ECOSYSTEM §7). The functions are GONE — not kept for
// "binary inputs", because keeping an encoder is keeping a door. The one
// number that survives is the width, so the migration script can still
// recognise legacy rows on disk and re-encode them through the fractal
// stack. It is a marker of what was, never a target to encode to.
const RETIRED_BYTE_LEN = 256;

// ─── Stable fingerprint (used for dedup IDs across the codebase) ─────────

/** FNV-1a over the waveform's 4-decimal string form. Deterministic and
 * dependency-free. Works on any waveform length, including the new
 * fractal vectors. Note: this hash changes when the encoder changes, so
 * digests recorded by the old byte encoder will differ from digests
 * computed by the new fractal encoder for the same source. */
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
  // Canonical: structural fractal encoder.
  TARGET_LEN: FRACTAL_DIM,
  codeToWaveform: toFractalWaveform,
  waveformCosine: fractalCoherency,
  digestWaveform,
  // The retired representation's width — a marker for migration, not an encoder.
  RETIRED_BYTE_LEN,
};

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
digestWaveform.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 13, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
