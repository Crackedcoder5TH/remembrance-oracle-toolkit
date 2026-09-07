'use strict';
const { quiet } = require('../core/quiet');

/**
 * coherency-token-components — the THREE numbers a coherency token is
 * derived from, each measured through the instrument and carried with its
 * source, so the slot can never again be filled by "whatever number was at
 * hand".
 *
 * WHAT WAS WRONG (trap 51). COHERENCY_V1_SPEC named two different quantities
 * for `waveform_score` in one sentence — "top-K mean correlation against the
 * substrate library" (resonance) and compress()['avg_l1_coherence'] (the
 * compressor's byte coherency) — and both implementations took the number
 * from their caller. Measured 2026-09-06 through the surface on six real
 * inputs: with the compressor's reading in the slot, code unified at
 * 0.20–0.30 (rejection) and only a periodic series cleared the gate; with
 * whitened resonance in the slot, code unified at 0.73–0.88 and the series
 * was rejected. The gate did not decide; the slot did.
 *
 * THE SLOT, FIXED. waveform_score IS the pattern's resonance with the
 * substrate library: the mean top-K cosine of its 232-D decoder vector
 * (decoder-stack.composedAtDepth at the active depth) against the library,
 * taken in the ONE resonance space (whitening-reference.js) — the same
 * reading the goggles' META lens prints. Source label
 * `resonance:void-library:meanTopK:whitened`. The compressor's byte
 * coherency is a different quantity; it rides on every seal under its own
 * name (`void:compress_signal`) and is carried here as `coherency`, never in
 * the slot. The retired 256-D byte waveform is refused by width: a vector
 * that is not a whole number of 29-D layers, or is exactly 256 wide, cannot
 * be a decoder vector and never enters a token.
 *
 *   text_score     — src/unified/coherency.js computeCoherencyScore(code).total
 *                    (source code only; null for prose / data)
 *   waveform_score — resonance as above (every input)
 *   atomic_score   — src/atomic + covenant-fractal: 1.0 when every top-level
 *                    function declares its 13 dimensions and none is blocking
 *                    (dangerous / degrading / malevolent); the declared
 *                    fraction otherwise; 0.0 on any blocking value (code only)
 *
 * unified = geometric mean over the non-null components (coherency-v1.js).
 */

const crypto = require('node:crypto');

const LAYER_DIM = 29;
const RETIRED_WIDTH = 256;
const WAVE_SOURCE = 'resonance:void-library:meanTopK:whitened';
const BLOCKING = /(?:harmPotential|alignment|intention)\s*:\s*["'](?:dangerous|degrading|malevolent)["']/;
const CODE_LANGUAGES = new Set(['javascript', 'js', 'typescript', 'ts', 'python', 'py', 'rust', 'go', 'java', 'c', 'cpp', 'ruby', 'php', 'shell', 'sh']);

/** A decoder vector, or the reason it is not one. */
function canonicalWidth(vec) {
  const n = vec ? vec.length : 0;
  if (n === RETIRED_WIDTH) return { ok: false, why: `${RETIRED_WIDTH}-D is the RETIRED byte waveform — never a decoder vector` };
  if (n < 4 * LAYER_DIM || n % LAYER_DIM !== 0) return { ok: false, why: `${n}-D is not a whole number of ${LAYER_DIM}-D decoder layers (need ≥ 4)` };
  return { ok: true, width: n, depth: n / LAYER_DIM };
}
canonicalWidth.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function _atomicScore(code) {
  const { scanForMissingAtomicProperties } = require('../core/covenant-fractal');
  const missing = scanForMissingAtomicProperties(code) || [];
  const declared = (code.match(/^\s*[A-Za-z_$][\w$]*\.atomicProperties\s*=/gm) || []).length;
  const total = declared + missing.length;
  if (total === 0) return null;                       // nothing to declare — not a code pattern
  if (BLOCKING.test(code)) return 0;                  // a blocking value anywhere blocks the pattern
  return declared / total;
}
_atomicScore.atomicProperties = { charge: 0, valence: 1, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 1, group: 2, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * Measure the components for one pattern through the instrument.
 * @param {{ code: string, language?: string, k?: number }} p
 * @returns {object} { text, wave:{score,source,width,depth,bestMatch,librarySize}, atom,
 *                     unified, label, coherency:{value,source}|null, waveform, waveformDigest, refused? }
 */
function measureComponents({ code, language, k = 5 } = {}) {
  if (typeof code !== 'string' || !code.length) return { refused: 'no pattern bytes' };
  const ds = require('../core/decoder-stack');
  const waveform = Array.from(ds.composedAtDepth(code, ds.currentDepth()));
  const w = canonicalWidth(waveform);
  if (!w.ok) return { refused: w.why };

  // waveform_score — resonance in the one space (the goggles' META reading)
  let wave = null;
  try {
    const { VoidLibrary } = require('../core/void-library');
    const lib = new VoidLibrary();
    // one extra so a self-match can be dropped without shrinking the top-K
    const r = lib.scoreWithFlow(waveform.slice(0, LAYER_DIM), waveform, { k: k + 1 });
    if (r && Array.isArray(r.topMatches) && r.topMatches.length) {
      // SELF-MATCH: a library member scores 1.0 against itself, and that number
      // describes library MEMBERSHIP, not the artifact (the same rule the
      // compressor's reading applies). It is dropped from the mean and named.
      const self = r.topMatches.filter((m) => m.score > 0.9999);
      const others = r.topMatches.filter((m) => m.score <= 0.9999).slice(0, k);
      const pool = others.length ? others : r.topMatches.slice(0, k);
      const meanTopK = pool.reduce((s, m) => s + m.score, 0) / pool.length;
      wave = { score: Math.max(0, Math.min(1, meanTopK)), source: WAVE_SOURCE, width: w.width, depth: w.depth,
        bestMatch: pool[0] ? { name: pool[0].name, score: pool[0].score } : null,
        selfMatch: self.length ? self[0].name : null, librarySize: r.librarySize };
    }
  } catch (e) { quiet('unified:coherency-token-components:wave', e); }
  if (!wave) return { refused: 'no library on this host — resonance cannot be read, so no token can be derived', waveform };

  // text_score and atomic_score — source code only
  let lang = language;
  let text = null, atom = null;
  try {
    const coh = require('./coherency');
    if (!lang && typeof coh.detectLanguage === 'function') lang = coh.detectLanguage(code);
    if (lang && CODE_LANGUAGES.has(String(lang).toLowerCase())) {
      const s = coh.computeCoherencyScore(code, { language: lang });
      if (s && Number.isFinite(s.total)) text = Math.max(0, Math.min(1, s.total));
      atom = _atomicScore(code);
    }
  } catch (e) { quiet('unified:coherency-token-components:text', e); }

  // the compressor's own reading rides beside the slot under its own name
  let coherency = null;
  try {
    const vs = require('../core/void-service');
    const c = vs.coherencyOf(code, { cachedOnly: false, quiet: true });
    if (typeof c === 'number') {
      const lr = vs.lastReading();
      coherency = { value: c, source: 'void:compress_signal', mint: lr && lr.seal ? lr.seal.mint : null };
    }
  } catch (e) { quiet('unified:coherency-token-components:coherency', e); }

  const v1 = require('./coherency-v1');
  const u = v1.compute({ textScore: text, waveformScore: wave.score, atomicScore: atom });
  const digest = crypto.createHash('sha256').update(Buffer.from(Float64Array.from(waveform).buffer)).digest('hex');
  return {
    text, wave, atom,
    unified: u.unified,
    label: v1.label(u.unified),
    components: { text_score: u.text_score, waveform_score: u.waveform_score, atomic_score: u.atomic_score },
    language: lang || null,
    coherency,
    waveform,
    waveformDigest: digest,
    waveformWidth: w.width,
  };
}
measureComponents.atomicProperties = { charge: -1, valence: 5, mass: "heavy", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 1, group: 4, period: 4, harmPotential: "none", alignment: "healing", intention: "neutral", domain: "utility" };

module.exports = { measureComponents, canonicalWidth, WAVE_SOURCE, RETIRED_WIDTH, LAYER_DIM };
