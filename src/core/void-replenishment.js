'use strict';

/**
 * void-replenishment.js — measure where the substrate has NO memory.
 *
 * WHAT WAS MISSING
 *
 * `delta_void` already exists as a TERM in the equation. In
 * living-remembrance.js, living_remembrance.py and coherency_v2.py it is:
 *
 *     delta_void = delta0 * max(0, 1 - p)
 *
 * That is derived entirely from `p`, the reading coming in. It never consults
 * the substrate. It says "this reading is far from 1", not "the substrate has
 * a hole here" — and those are different claims. A perfectly-remembered
 * pattern with a low coherency reading gets a large delta_void; a genuinely
 * novel shape the substrate has never seen gets whatever its coherency
 * happens to be. The term was standing in for a measurement that was never
 * taken.
 *
 * recycler.js#_voidReplenish is real but operates on ONE stuck pattern,
 * injecting scaffolding when its coherency sticks low. That is pattern-level
 * repair, not a reading of the space.
 *
 * WHAT THIS IS
 *
 * The void is the inverse of resonance and is measured the same way, against
 * the same vectors. Resonance answers "what is this shaped like?"; the void
 * answers "what is there nothing shaped like?". They are one reading taken
 * from two sides, which is why this module takes the resonance result rather
 * than recomputing anything.
 *
 * NOTHING IS RE-DECODED HERE. Every vector this reads was already produced by
 * the canonical decoder and stored in the substrate at ingest. Re-decoding to
 * measure a void would be the third time the same waveform was computed for
 * the same file, and the whole point of the substrate is that the unfolding
 * happened once.
 *
 * THE READING
 *
 * For a query, the local void depth is how far the substrate's best answer
 * falls short of consonance:
 *
 *     voidDepth = max(0, consonanceFloor - bestResonance)
 *
 * 0 means the substrate has memory here. Approaching the floor means it has
 * none — the query sits in empty space, and a pattern placed there would be
 * genuinely new information rather than a duplicate of something already
 * held.
 *
 * Depth is read at the FULL decoder width (all active layers) because a void
 * measured at 116 of 232 dimensions is not a void — it is a region the
 * comparison could not see into. See docs/full-depth-readings.md.
 */

const { flowCosines, deepestFlow, flowCheckpoints } = require('./decoder-stack');

// A query is CONSONANT with the substrate above this; below it, the gap
// between what was asked and what the substrate could answer is the void.
// Sourced from the ecosystem's own moving numbers so this floor and the
// goggles' consonance verdict never drift apart.
function consonanceFloor() {
  try {
    const g = require('./living-remembrance').gogglesParams();
    if (g && typeof g.resonanceConsonant === 'number') return g.resonanceConsonant;
  } catch (_) { /* fall through to the documented default */ }
  return 0.90;
}

/**
 * Local void depth for one query, from a resonance reading already taken.
 *
 * Pass the resonance result the field-tool/goggles already produced — this
 * does not search, encode or decode. Void and resonance are the same read.
 *
 * @param {object} resonance — { bestMatch, meanTopK, topMatches } as returned
 *   by void-library.searchFlow / field-tool's voidResonance block.
 * @param {object} [opts]
 * @param {number} [opts.floor] — consonance floor override.
 * @returns {{
 *   depth: number,          // 0 = substrate has memory here; larger = emptier
 *   best: number|null,      // the best resonance the substrate could offer
 *   nearest: string|null,   // what it offered
 *   isVoid: boolean,        // true when nothing reached the floor
 *   width: number,          // decoder dims the reading spanned
 *   measured: boolean       // false when no resonance was available at all
 * }}
 */
function voidAt(resonance, opts = {}) {
  const floor = typeof opts.floor === 'number' ? opts.floor : consonanceFloor();
  const canonicalWidth = flowCheckpoints().slice(-1)[0];
  if (!resonance || !resonance.bestMatch) {
    // No resonance at all is not void depth 0 and it is not void depth 1 —
    // it is an unread region. Saying "maximum void" here would invent a
    // measurement, the same way a fabricated 0 invents a coherency.
    return {
      depth: 0, best: null, nearest: null, isVoid: false,
      width: null, canonicalWidth, truncated: null, measured: false,
    };
  }
  const best = typeof resonance.bestMatch.score === 'number'
    ? resonance.bestMatch.score
    : deepestFlow([resonance.bestMatch.d1, resonance.bestMatch.d2,
      resonance.bestMatch.d3, resonance.bestMatch.d4].filter((x) => typeof x === 'number'));

  // THE DEPTH IS ENTANGLED WITH THE WIDTH IT WAS MEASURED AT.
  //
  // A comparison spans only as many dimensions as the NARROWER side carries.
  // With entries at 116-D, 145-D and 232-D in the same store, a depth of 0.0
  // measured against 116-D memory and a depth of 0.0 measured at full
  // canonical width are different claims: the first means "the four deepest
  // layers were never consulted", the second means "they were, and found
  // memory". Stored flat, that distinction is unrecoverable — and this
  // ecosystem has already produced false findings from exactly that ambiguity.
  //
  // So the width rides with the reading, always, and `truncated` says plainly
  // whether the deepest layers participated.
  const width = typeof opts.width === 'number' && isFinite(opts.width)
    ? opts.width
    : (typeof resonance.bestMatch.width === 'number' ? resonance.bestMatch.width : null);

  return {
    depth: Math.max(0, floor - best),
    best,
    nearest: resonance.bestMatch.name || null,
    isVoid: best < floor,
    // The width this depth was actually read at, and the width it would take
    // to read it fully. Never assume they are equal.
    width,
    canonicalWidth,
    truncated: width == null ? null : width < canonicalWidth,
    measured: true,
  };
}

/**
 * Where the substrate is empty, read from the vectors it already holds.
 *
 * For each sampled entry, the strongest resonance to ANY other entry is its
 * local density. An entry whose best neighbour falls below the floor sits in
 * a void: the substrate holds it, but holds nothing like it.
 *
 * Sampling is explicit and reported. A full pass is O(n²) over 53k+ entries;
 * this reads a sample and says so rather than quietly capping and presenting
 * the result as complete coverage.
 *
 * @param {object} entries — { name: vector } already-decoded composed vectors
 * @param {object} [opts]
 *   sample?: number = 400   — how many entries to probe
 *   floor?: number          — consonance floor override
 * @returns {{
 *   probed: number, total: number, sampled: boolean,
 *   voids: Array<{name: string, best: number, nearest: string|null, depth: number}>,
 *   byNamespace: Record<string, {probed: number, inVoid: number, rate: number}>,
 *   width: number, floor: number
 * }}
 */
function substrateVoids(entries, opts = {}) {
  const floor = typeof opts.floor === 'number' ? opts.floor : consonanceFloor();
  const sample = opts.sample || 400;
  const width = flowCheckpoints().slice(-1)[0];

  const names = Object.keys(entries);
  const total = names.length;
  // Spread the probe across the whole set rather than taking a prefix — a
  // block sample would report one namespace's density as the substrate's.
  const step = Math.max(1, Math.floor(total / sample));
  const probes = [];
  for (let i = 0; i < total && probes.length < sample; i += step) probes.push(names[i]);

  const voids = [];
  const byNamespace = {};
  for (const q of probes) {
    const qv = entries[q];
    if (!qv || !qv.length) continue;
    let best = -1, nearest = null;
    for (const other of names) {
      if (other === q) continue;
      const ov = entries[other];
      if (!ov || !ov.length) continue;
      const s = deepestFlow(flowCosines(qv, ov));
      if (s > best) { best = s; nearest = other; }
    }
    const ns = q.split('/')[0];
    byNamespace[ns] = byNamespace[ns] || { probed: 0, inVoid: 0, rate: 0 };
    byNamespace[ns].probed++;
    if (best < floor) {
      byNamespace[ns].inVoid++;
      voids.push({ name: q, best, nearest, depth: Math.max(0, floor - best) });
    }
  }
  for (const ns of Object.keys(byNamespace)) {
    const b = byNamespace[ns];
    b.rate = b.probed ? b.inVoid / b.probed : 0;
  }
  voids.sort((a, b) => b.depth - a.depth);

  return {
    probed: probes.length,
    total,
    sampled: probes.length < total,
    voids,
    byNamespace,
    width,
    floor,
  };
}

module.exports = { voidAt, substrateVoids, consonanceFloor };
