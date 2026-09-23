'use strict';
const { quiet } = require('./quiet');

/**
 * resonance-space.js — carry a decoder vector into the ONE resonance space.
 *
 * Every overlap, cosine or correlation between decoder vectors is a reading
 * only in the space where the substrate discriminates: the per-layer
 * whitened reference (whitening-reference.js). decoder-stack, FractalIndex
 * and the library already apply it at their own doors; this is the same
 * door for anyone holding two vectors — the Living Remembrance engine's
 * healed-anchor overlap was the last consumer taking cosines in the raw
 * cone (trap 49), and this module is the channel it now flows through.
 *
 * The retired 256-D byte waveform is refused by width: it has no layers to
 * whiten and can never be dressed as a decoder vector. On a host without a
 * reference the vector stays raw, LABELLED, so a raw overlap is never
 * mistaken for a whitened one.
 */

const RETIRED_WIDTH = 256;

/**
 * @param {ArrayLike<number>} vec
 * @returns {{vec:number[]|Float64Array, space:'whitened'|'raw'}|null} null when refused
 */
function toSpace(vec) {
  if (!vec || !vec.length || vec.length === RETIRED_WIDTH) return null;
  try {
    const REF = require('./whitening-reference');
    const ref = REF.reference();
    if (ref) return { vec: REF.whitenComposed(vec, ref), space: 'whitened' };
  } catch (e) { quiet('core:resonance-space', e); }
  return { vec: Array.from(vec), space: 'raw' };
}
toSpace.atomicProperties = { charge: 0, valence: 1, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 1, group: 9, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = { toSpace, RETIRED_WIDTH };
