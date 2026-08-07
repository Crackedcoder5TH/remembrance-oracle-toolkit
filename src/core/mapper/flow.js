'use strict';

/**
 * mapper/flow.js — the coherency-flow reading and the one sibling engine.
 *
 * Depth-aware reading of how a cousin relationship reads at every
 * scale of the encoder. The shape of the flow IS the signal:
 *
 *   STABLE-HIGH    d1 ≈ d2 ≈ d3 ≈ d4 ≈ high  → real fundamental cousin
 *   ASCENDING      d1 low, d4 high            → hidden similarity surfacing
 *   DECAY          d1 high, d4 low             → surface similarity only
 *   OSCILLATING    mixed                       → partial / scale-dependent
 *
 * Coherency is meant to be read as a flow across all depths, not from any
 * one depth's verdict. Each depth captures structure at a different scale;
 * the flow shape says what kind of similarity is at hand.
 *
 * All cosine sweeps route to the canonical decoder stack (ECOSYSTEM §7:
 * one decoder, one cosine). Extracted from coherency-mapper.js in the
 * flagship decomposition.
 */

const {
  flowCosines: _flowCosines, deepestFlow: _deepestFlow, flowCheckpoints,
} = require('../decoder-stack');

function _cosineLen(a, b, len) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Read the coherency flow between two patterns across all depths.
 * Each pattern must carry both `l1` (29-D) and `composed` (29*k-D)
 * vectors from the substrate.
 *
 * Returns the d1..dN cosines plus the flow shape category.
 */
function coherencyFlow(a, b) {
  if (!a || !b) return null;
  const composedA = a.composed || a.composed_v1;
  const composedB = b.composed || b.composed_v1;
  // Route to the canonical sweep instead of re-deriving checkpoints here.
  // This body carried its own `CHECK`-equivalent — 29/58/87/Math.min(116, …)
  // — written when four layers existed, so it stayed at 116-D after
  // flowCosines was widened to every active layer. One decoder, one cosine.
  if (composedA && composedB) {
    const flow = _flowCosines(composedA, composedB);
    const out = { flow, shape: classifyFlow(flow) };
    flow.forEach((v, i) => { out['d' + (i + 1)] = v; });
    out.deepest = _deepestFlow(flow);
    return out;
  }
  // No composed vectors — the L1 reading is all there is, repeated across
  // the checkpoints so the shape is visible rather than silently short.
  const d1 = _cosineLen(a.l1 || a.fractal, b.l1 || b.fractal, 29);
  const flow = flowCheckpoints().map(() => d1);
  const out = { flow, shape: classifyFlow(flow) };
  flow.forEach((v, i) => { out['d' + (i + 1)] = v; });
  out.deepest = d1;
  return out;
}
coherencyFlow.atomicProperties = {
  charge: -1, valence: 2, mass: 'light', spin: 'odd', phase: 'liquid',
  reactivity: 'stable', electronegativity: 0.5, group: 15, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'analysis',
};

/**
 * In-repo pairwise depth-flow — the ONE sibling engine both map modes
 * share. For every entry, sweep the whole pool: stable-high count,
 * duplicates (min-depth ≥ duplicateAt), and the top-5 sibling
 * neighbourhood with flow shapes. Extracted from mapFromSubstrate so
 * the deep path can run the exact same comparison over vectors it just
 * encoded — deep mode previously derived in-repo stats from substrate
 * topK matches, which are EMPTY for an unwitnessed repo (every file
 * misread as ORPHAN — the supabase degeneracy) and truncated for a
 * witnessed one.
 *
 * @param {Array<{rel: string, vec: number[]}>} entries — the pool
 * @param {object} [opts] duplicateAt?: number = 0.999
 * @returns {Array<{stableHigh, duplicates, siblings}>} per-entry stats
 */
function _pairwiseFlow(entries, opts = {}) {
  const duplicateAt = opts.duplicateAt || 0.999;
  const n = entries.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let stableHigh = 0;
    const duplicates = [];
    const siblings = []; // kept sorted desc by d4, capped at 5
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      // The whole flow, at every active depth. `d4` is kept as the key name
      // because goggles.js reads it, but it now carries the DEEPEST reading
      // (232-D today), not the 116-D fourth checkpoint. Duplicate detection
      // in particular was running on the half that cannot tell look-alikes
      // apart, which is the half that decides whether two files are the same.
      const flow = _flowCosines(entries[i].vec, entries[j].vec);
      const shape = classifyFlow(flow);
      const deep = _deepestFlow(flow);
      if (shape === 'STABLE-HIGH') {
        stableHigh++;
        const minDepth = Math.min(...flow);
        if (minDepth >= duplicateAt) {
          duplicates.push({ name: entries[j].rel, score: deep, minDepth, shape });
        }
      }
      if (siblings.length < 5 || deep > siblings[siblings.length - 1].d4) {
        siblings.push({ rel: entries[j].rel, d4: deep, shape });
        siblings.sort((a, b) => b.d4 - a.d4);
        if (siblings.length > 5) siblings.pop();
      }
    }
    out[i] = { stableHigh, duplicates, siblings };
  }
  return out;
}

/**
 * Pull the depth readings out of a flow, however it arrived.
 *
 * A flow used to be exactly four numbers, so callers destructured d1..d4.
 * It is now one reading per ACTIVE decoder layer (eight today), and the
 * count changes whenever a layer activates. Reading a fixed d1..d4 would
 * silently classify on the first 116 of 232 dimensions — the same
 * truncation that made every resonance reading half-blind.
 *
 * Accepts an array (the canonical form flowCosines returns) or a legacy
 * {d1..dN} object, and returns every depth present.
 */
function _flowValues(f) {
  if (Array.isArray(f)) return f.filter((x) => typeof x === 'number' && isFinite(x));
  const out = [];
  for (let i = 1; ; i++) {
    const v = f['d' + i];
    if (typeof v !== 'number' || !isFinite(v)) break;
    out.push(v);
  }
  return out;
}

function classifyFlow(f) {
  const values = _flowValues(f);
  if (!values.length) return 'STABLE-MID';
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min;
  if (range < 0.05) {
    if (max > 0.90) return 'STABLE-HIGH';
    if (max < 0.50) return 'STABLE-LOW';
    return 'STABLE-MID';
  }
  let inc = 0, dec = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i-1] + 0.01) inc++;
    if (values[i] < values[i-1] - 0.01) dec++;
  }
  if (dec >= 2 && inc <= 1) return 'DECAY';
  if (inc >= 2 && dec <= 1) return 'ASCENDING';
  return 'OSCILLATING';
}
classifyFlow.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 15, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'analysis',
};

function formatFlow(f) {
  if (!f) return 'no-flow';
  const v = _flowValues(f);
  if (!v.length) return 'no-flow';
  // Every active depth, not the first four. The arrow chain is the whole
  // waveform's flow now — L1 structural through L8 dynamical.
  return `${v.map((x) => x.toFixed(3)).join(' → ')}  [${f.shape}]`;
}
formatFlow.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.2, group: 13, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'presentation',
};

module.exports = { coherencyFlow, classifyFlow, formatFlow, _pairwiseFlow, _flowValues, _cosineLen };
