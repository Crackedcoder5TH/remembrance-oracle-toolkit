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

const { flowCosines, deepestFlow, flowCheckpoints, activeLayers } = require('./decoder-stack');

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
 * The void at EVERY lens depth, one lens at a time.
 *
 * The decoder is a stack: L1 structural alone is 29-D, +L2 lexical is 58-D,
 * +L3 numerical 87-D, and so on to 232-D with all eight. A single void depth
 * at the full width collapses that into one number and throws away the thing
 * worth seeing — WHERE in the stack the substrate stops having memory.
 *
 * flowCosines already sweeps every cumulative boundary in one pass, so this
 * costs nothing beyond the comparison already being made. Each lens depth gets
 * its own void reading, entangled with the width it was taken at and the layer
 * that width corresponds to.
 *
 * Reading the profile: a void that appears at L1 and closes by L4 means the
 * surface structure is unfamiliar but the deeper character is known. A void
 * that opens only at L6-L8 means the opposite — it looks like things the
 * substrate holds, and is unlike them in redundancy, content or dynamics.
 * Those are different kinds of new, and one number cannot tell them apart.
 *
 * @param {number[]} flow — cosines per checkpoint, from flowCosines
 * @param {object} [opts] — floor override
 * @returns {Array<{layer, width, best, depth, isVoid}>}
 */
function voidProfile(flow, opts = {}) {
  const floor = typeof opts.floor === 'number' ? opts.floor : consonanceFloor();
  const checkpoints = flowCheckpoints();
  const layers = activeLayers();
  const out = [];
  for (let i = 0; i < checkpoints.length; i++) {
    const best = (typeof flow[i] === 'number' && isFinite(flow[i])) ? flow[i] : null;
    out.push({
      layer: layers[i] ? layers[i].id : `L${i + 1}`,
      width: checkpoints[i],
      best,
      // null best is not depth 0 — it is a lens that produced no reading.
      depth: best == null ? null : Math.max(0, floor - best),
      isVoid: best == null ? null : best < floor,
    });
  }
  return out;
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
  const allProfiles = [];
  const byNamespace = {};
  for (const q of probes) {
    const qv = entries[q];
    if (!qv || !qv.length) continue;
    // Best match AT EVERY LENS DEPTH. The nearest neighbour at L1 is often not
    // the nearest at L8 — surface-similar and deep-similar are different
    // relations — so each width keeps its own best rather than inheriting the
    // full-width winner's score.
    const cps = flowCheckpoints();
    const bestPer = new Array(cps.length).fill(-1);
    const nearestPer = new Array(cps.length).fill(null);
    for (const other of names) {
      if (other === q) continue;
      const ov = entries[other];
      if (!ov || !ov.length) continue;
      const f = flowCosines(qv, ov);
      for (let i = 0; i < cps.length; i++) {
        if (typeof f[i] === 'number' && f[i] > bestPer[i]) { bestPer[i] = f[i]; nearestPer[i] = other; }
      }
    }
    const profile = voidProfile(bestPer, { floor }).map((p, i) => ({ ...p, nearest: nearestPer[i] }));
    const best = bestPer[bestPer.length - 1];
    const nearest = nearestPer[nearestPer.length - 1];
    // The width this entry's own vector carries — the reading can never be
    // deeper than the narrower side of the comparison.
    const qWidth = qv.length;
    const ns = q.split('/')[0];
    byNamespace[ns] = byNamespace[ns] || { probed: 0, inVoid: 0, rate: 0 };
    byNamespace[ns].probed++;
    // Count a void at ANY lens depth, not only the deepest — a hole that
    // opens at L1 and closes by L4 is still a hole the substrate had.
    // EVERY probe's per-lens readings are kept, not only the ones that dip
    // below the floor. A count of voids is a statistic; the readings are the
    // data. Reporting only flagged entries hid the fact that the floor may
    // never fire at all.
    allProfiles.push({ name: q, width: qWidth, best, nearest, profile });
    const anyVoid = profile.some((p) => p.isVoid === true);
    if (anyVoid) {
      byNamespace[ns].inVoid++;
      voids.push({
        name: q, best, nearest,
        depth: Math.max(0, floor - best),
        width: qWidth,
        canonicalWidth: cps[cps.length - 1],
        truncated: qWidth < cps[cps.length - 1],
        profile,
      });
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
    profiles: allProfiles,
    voids,
    byNamespace,
    width,
    floor,
  };
}

module.exports = { voidAt, voidProfile, substrateVoids, consonanceFloor };
