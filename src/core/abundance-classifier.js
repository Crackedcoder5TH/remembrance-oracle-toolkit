'use strict';

/**
 * abundance-classifier.js — classifier head over the composed 116-D
 * fractal signature: extraction-aligned vs abundance-aligned.
 *
 * The encoder stack (L1 structural, L2 lexical, L3 numerical,
 * L4 spectral) was never given an "extraction" or "abundance" label,
 * yet the two pattern classes occupy different regions of signature
 * space because they have genuinely different geometry:
 *
 *   EXTRACTION — flow concentrates and does not return:
 *     - L3 tailHeavy:    top-5% of values hold most of the mass
 *     - L3 dominantBin:  values pile into one order of magnitude
 *     - L3 monotone:     long one-directional runs (accumulation)
 *     - L3 inc/dec asym: flow moves one way far more than the other
 *     - L4 trendStrength: strong unbounded drift (R² of linear fit)
 *     - L4 low spectral entropy / low flatness: energy concentrated
 *       in a narrow frequency band (one timescale dominates)
 *
 *   ABUNDANCE — flow circulates, diversifies, regenerates:
 *     - L3 zeroCross:    values cross the mean repeatedly (give/take)
 *     - L3 uniqueFrac:   high diversity of values
 *     - L2 uniqueRatio + entropy: regenerative vocabulary
 *     - L4 onefLike:     1/f spectral slope — the self-organized-
 *       criticality signature of living, balanced systems
 *     - L4 high spectral entropy: energy spread across the band
 *     - L1 alignment/intention: healing/benevolent keyword balance
 *
 * The geometry is primary. When raw text is available, a small
 * semantic lexicon pass adds a secondary signal (extraction verbs
 * vs regeneration verbs), weighted lightly so vocabulary can tilt
 * but never override structure.
 *
 * Two entry points:
 *   classifyAlignment(text)       — full: geometry + lexicon
 *   classifySignature(composed)   — geometry only, from a
 *                                   precomputed 116-D vector
 *
 * Output (both): {
 *   extraction:  0..1,
 *   abundance:   0..1,
 *   alignment:  -1..1   (abundance − extraction),
 *   label:      'abundance-aligned' | 'extraction-aligned' | 'mixed',
 *   confidence:  0..1,
 *   evidence:   [{ marker, pole, value, weight }]  strongest first
 * }
 *
 * Deterministic. Pure. No external dependencies.
 */

const { compose, composedAtDepth } = require('./encoder-stack');

const COMPOSED_DIM = 116;

// ── Dimension indices in the composed 116-D vector ──────────────
// L1 occupies 0..28, L2 29..57, L3 58..86, L4 87..115. Each index
// below is (layer base + within-layer dim) per the inspect* maps in
// the four encoder files. If an encoder's layout changes, the spec
// (docs/FRACTAL_WAVEFORM_SPEC.md and the layer headers) governs.
const DIM = {
  // L1 structural (base 0)
  l1Alignment: 10,      // healing=1 / neutral=0.5 / degrading=0
  l1Intention: 11,      // benevolent=1 / neutral=0.5 / malevolent=0
  // L2 lexical (base 29)
  l2UniqueRatio: 29 + 6,
  l2Entropy: 29 + 7,
  // L3 numerical (base 58)
  l3ZeroCross: 58 + 9,
  l3Monotone: 58 + 11,
  l3IncFrac: 58 + 14,
  l3DecFrac: 58 + 15,
  l3DominantBin: 58 + 18,
  l3TailHeavy: 58 + 19,
  l3UniqueFrac: 58 + 20,
  // L4 spectral (base 87)
  l4SpectralEntropy: 87 + 9,
  l4Flatness: 87 + 14,
  l4TrendStrength: 87 + 21,
  l4OnefLike: 87 + 25,
};

// ── Marker weights ───────────────────────────────────────────────
// Geometry carries the score; weights sum to 1 per pole so each
// pole score stays a true weighted mean in [0, 1].
const EXTRACTION_WEIGHTS = {
  tailHeavy: 0.22,        // concentration of mass
  dominantBin: 0.13,      // magnitude monoculture
  monotone: 0.18,         // one-way accumulation
  flowAsymmetry: 0.17,    // |incFrac − decFrac|
  trendStrength: 0.15,    // unbounded drift
  narrowBand: 0.15,       // 1 − spectral entropy
};

const ABUNDANCE_WEIGHTS = {
  cyclicity: 0.20,        // zero-crossings — give and take
  valueDiversity: 0.16,   // L3 uniqueFrac
  vocabRegeneration: 0.16, // mean of L2 uniqueRatio + entropy
  onefLike: 0.16,         // 1/f self-organized criticality
  spectralSpread: 0.12,   // spectral entropy
  healingBalance: 0.20,   // mean of L1 alignment + intention
};

// ── Semantic lexicon (secondary signal, text mode only) ─────────
// Stems, matched case-insensitively. Vocabulary tilts the score by
// at most LEXICON_WEIGHT in either direction; geometry dominates.
const EXTRACTION_TERMS = [
  'extract', 'hoard', 'scarc', 'deplet', 'drain', 'exploit',
  'monopol', 'lock-in', 'lockin', 'gatekeep', 'siphon', 'skim',
  'withhold', 'penalt', 'forfeit', 'expire', 'churn', 'capture rate',
  'zero-sum', 'rent-seek',
];
const ABUNDANCE_TERMS = [
  'share', 'gift', 'give', 'regenerat', 'abundan', 'replenish',
  'renew', 'reciproc', 'circulat', 'redistribut', 'steward',
  'nourish', 'sustain', 'overflow', 'commons', 'open-source',
  'opensource', 'seed', 'flourish', 'restore',
];
const LEXICON_WEIGHT = 0.15;

function _clip(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// ── Geometric marker extraction ──────────────────────────────────

function _extractionMarkers(v) {
  return {
    tailHeavy: _clip(v[DIM.l3TailHeavy]),
    dominantBin: _clip(v[DIM.l3DominantBin]),
    monotone: _clip(v[DIM.l3Monotone]),
    flowAsymmetry: _clip(Math.abs(v[DIM.l3IncFrac] - v[DIM.l3DecFrac])),
    trendStrength: _clip(v[DIM.l4TrendStrength]),
    narrowBand: _clip(1 - v[DIM.l4SpectralEntropy]),
  };
}

function _abundanceMarkers(v) {
  return {
    // Raw zeroCross is crossings/(n−1): a clean oscillation with a
    // ~19-sample period sits near 0.1, alternating-sign noise near 1.
    // Realistic circulation lives in 0.1–0.5, so scale ×3 to use the
    // marker's full range (white noise still saturates at 1).
    cyclicity: _clip(v[DIM.l3ZeroCross] * 3),
    valueDiversity: _clip(v[DIM.l3UniqueFrac]),
    vocabRegeneration: _clip((v[DIM.l2UniqueRatio] + v[DIM.l2Entropy]) / 2),
    onefLike: _clip(v[DIM.l4OnefLike]),
    spectralSpread: _clip(v[DIM.l4SpectralEntropy]),
    healingBalance: _clip((v[DIM.l1Alignment] + v[DIM.l1Intention]) / 2),
  };
}

function _weightedMean(markers, weights) {
  let sum = 0;
  for (const [name, w] of Object.entries(weights)) sum += markers[name] * w;
  return _clip(sum);
}

// ── Lexicon pass (text mode) ─────────────────────────────────────

function _countTerms(lower, terms) {
  let n = 0;
  for (const t of terms) {
    let idx = lower.indexOf(t);
    while (idx !== -1) { n++; idx = lower.indexOf(t, idx + t.length); }
  }
  return n;
}

/**
 * Lexical tilt in [-1, 1]: positive toward abundance vocabulary,
 * negative toward extraction vocabulary, 0 when neither appears.
 */
function _lexiconTilt(text) {
  const lower = text.toLowerCase();
  const ex = _countTerms(lower, EXTRACTION_TERMS);
  const ab = _countTerms(lower, ABUNDANCE_TERMS);
  const total = ex + ab;
  if (total === 0) return 0;
  return (ab - ex) / total;
}

// ── Evidence assembly ────────────────────────────────────────────

function _evidence(exMarkers, abMarkers) {
  const rows = [];
  for (const [marker, value] of Object.entries(exMarkers)) {
    rows.push({ marker, pole: 'extraction', value, weight: EXTRACTION_WEIGHTS[marker] });
  }
  for (const [marker, value] of Object.entries(abMarkers)) {
    rows.push({ marker, pole: 'abundance', value, weight: ABUNDANCE_WEIGHTS[marker] });
  }
  // Strongest contribution (value × weight) first
  rows.sort((a, b) => b.value * b.weight - a.value * a.weight);
  return rows;
}

function _label(alignment) {
  if (alignment > 0.15) return 'abundance-aligned';
  if (alignment < -0.15) return 'extraction-aligned';
  return 'mixed';
}

/**
 * Confidence grows with how decisively the poles separate and how
 * much total signal the markers carry. An all-zero vector (empty
 * input) yields 0; a strongly one-sided signature approaches 1.
 */
function _confidence(extraction, abundance) {
  const separation = Math.abs(abundance - extraction);
  const magnitude = (extraction + abundance) / 2;
  return _clip(separation * 0.7 + magnitude * 0.3);
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Classify a precomputed composed signature (geometry only).
 *
 * @param {Float64Array|number[]} composed — 116-D composed vector
 *   (depth 4). Shorter vectors are rejected: the classifier reads
 *   L3/L4 dimensions and refuses to guess on partial stacks.
 * @returns {{ extraction:number, abundance:number, alignment:number,
 *             label:string, confidence:number, evidence:Array }}
 */
function classifySignature(composed) {
  if (!composed || composed.length !== COMPOSED_DIM) {
    throw new Error(
      `classifySignature expects a ${COMPOSED_DIM}-D composed vector (depth 4), got length ${composed ? composed.length : 'none'}`
    );
  }
  const exMarkers = _extractionMarkers(composed);
  const abMarkers = _abundanceMarkers(composed);
  const extraction = _weightedMean(exMarkers, EXTRACTION_WEIGHTS);
  const abundance = _weightedMean(abMarkers, ABUNDANCE_WEIGHTS);
  const alignment = abundance - extraction;
  return {
    extraction,
    abundance,
    alignment,
    label: _label(alignment),
    confidence: _confidence(extraction, abundance),
    evidence: _evidence(exMarkers, abMarkers),
  };
}

/**
 * Classify raw text: composes the full 4-layer signature, scores the
 * geometry, then applies the lexicon tilt as a secondary signal.
 *
 * @param {string} text — code, prose, serialized data, anything the
 *   encoder stack accepts.
 * @returns same shape as classifySignature, plus { lexiconTilt }
 */
function classifyAlignment(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return {
      extraction: 0, abundance: 0, alignment: 0,
      label: 'mixed', confidence: 0, lexiconTilt: 0, evidence: [],
    };
  }
  const composed = composedAtDepth(text, 4);
  const base = classifySignature(composed);
  const tilt = _lexiconTilt(text);
  // Vocabulary nudges, geometry decides: shift alignment by at most
  // ±LEXICON_WEIGHT, then re-derive the dependent fields.
  const alignment = Math.max(-1, Math.min(1, base.alignment + tilt * LEXICON_WEIGHT));
  const shift = (alignment - base.alignment) / 2;
  const extraction = _clip(base.extraction - shift);
  const abundance = _clip(base.abundance + shift);
  return {
    extraction,
    abundance,
    alignment,
    label: _label(alignment),
    confidence: _confidence(extraction, abundance),
    lexiconTilt: tilt,
    evidence: base.evidence,
  };
}

/**
 * Diagnostic — full marker breakdown with named dimensions, for
 * inspecting WHY a pattern classified the way it did.
 */
function inspectAlignmentMarkers(text) {
  const composed = composedAtDepth(typeof text === 'string' ? text : '', 4);
  return {
    extraction: _extractionMarkers(composed),
    abundance: _abundanceMarkers(composed),
    lexiconTilt: typeof text === 'string' ? _lexiconTilt(text) : 0,
    result: classifyAlignment(typeof text === 'string' ? text : ''),
  };
}

module.exports = {
  COMPOSED_DIM,
  DIM,
  EXTRACTION_WEIGHTS,
  ABUNDANCE_WEIGHTS,
  EXTRACTION_TERMS,
  ABUNDANCE_TERMS,
  LEXICON_WEIGHT,
  classifySignature,
  classifyAlignment,
  inspectAlignmentMarkers,
};
