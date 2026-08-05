'use strict';

/**
 * dynamical-waveform.js — L8: the DETERMINISM / return-map layer.
 *
 * Residual L1-L7 leave (diagnosed by the substrate itself): DETERMINISTIC
 * STRUCTURE in an APERIODIC series. L7 (dimensional) catches 2D structure but
 * is period-gated, so it is blind to deterministic chaos, whose structure lives
 * in an aperiodic return map (x_{t+1} as a function of x_t): a chaos-vs-noise
 * probe found the composed stack scored deterministic chaos and true randomness
 * as indistinguishable (AUC ~0.55). Both look random to a compressor; the
 * difference is that chaos is PREDICTABLE in delay-coordinate space and noise
 * is not (Takens embedding).
 *
 * L8 imports the established dynamical-systems instruments for exactly this:
 *   - Bandt-Pompe PERMUTATION ENTROPY at several (dim, delay) scales — ordinal
 *     pattern diversity.
 *   - MPR STATISTICAL COMPLEXITY (Rosso et al. 2007, "Distinguishing noise from
 *     chaos") — H · Jensen-Shannon disequilibrium; chaos sits at intermediate
 *     entropy / HIGH complexity, noise at high entropy / LOW complexity.
 *   - DELAY-EMBEDDING PREDICTABILITY — nearest-neighbour 1-step prediction error
 *     in reconstructed phase space; low error = deterministic. This is the core
 *     signal that separates chaos from noise.
 *
 * SELF-GATED like L7: it parses a numeric series from the input and fires only
 * when one exists (>= MIN_SERIES points). Text / code / non-series input yields
 * a near-zero vector and defers to L1-L7. 29-D to match the stack.
 *
 * Dependency-free, deterministic.
 */

const DIM_TARGET = 29;
const MIN_SERIES = 24;

/** Parse a numeric series out of the input (mirrors L7's parse-first design). */
function _parseSeries(input) {
  if (typeof input !== 'string' || input.length === 0) return null;
  const m = input.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g);
  if (!m || m.length < MIN_SERIES) return null;
  const s = m.map(Number).filter(Number.isFinite);
  return s.length >= MIN_SERIES ? s : null;
}

function _factorial(n) { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; }

/** Ordinal (permutation) pattern distribution over delay vectors of dim d, delay τ. */
function _ordinalDist(s, d, tau) {
  const counts = new Map();
  let total = 0;
  for (let i = 0; i + (d - 1) * tau < s.length; i++) {
    const idx = [];
    for (let j = 0; j < d; j++) idx.push(j);
    idx.sort((a, b) => s[i + a * tau] - s[i + b * tau] || a - b); // argsort → permutation
    const key = idx.join(',');
    counts.set(key, (counts.get(key) || 0) + 1);
    total++;
  }
  return { counts, total };
}

/** Normalized permutation entropy H ∈ [0,1]. */
function _permEntropy(s, d, tau) {
  const { counts, total } = _ordinalDist(s, d, tau);
  if (total < 2) return 0;
  let H = 0;
  for (const c of counts.values()) { const p = c / total; H -= p * Math.log(p); }
  return H / Math.log(_factorial(d));
}

/** MPR statistical complexity C = H · Q_J, Q_J = normalized Jensen-Shannon
 *  disequilibrium of the ordinal distribution vs the uniform distribution. */
function _statComplexity(s, d, tau) {
  const { counts, total } = _ordinalDist(s, d, tau);
  if (total < 2) return 0;
  const M = _factorial(d);
  const pe = 1 / M;
  // Shannon of P and of the (P+U)/2 mixture
  const H = (probs) => { let h = 0; for (const p of probs) if (p > 0) h -= p * Math.log(p); return h; };
  const P = [];
  for (const c of counts.values()) P.push(c / total);
  while (P.length < M) P.push(0);           // absent patterns → 0
  const Hp = H(P);
  const mix = P.map((p) => 0.5 * (p + pe));
  const Hmix = H(mix);
  const Hpe = Math.log(M);
  const Hnorm = Hp / Hpe;                    // normalized entropy
  // Jensen-Shannon divergence, normalized to [0,1]
  const JS = Hmix - 0.5 * Hp - 0.5 * Hpe;
  const Qmax = -0.5 * ((M + 1) / M * Math.log(M + 1) - 2 * Math.log(2 * M) + Math.log(M));
  const Qj = Qmax > 0 ? JS / Qmax : 0;
  return Hnorm * Qj;                          // complexity
}

/** Delay-embedding 1-step predictability: build m-dim delay vectors, for each
 *  find its nearest spatial neighbour (temporally separated by >= Theiler w),
 *  predict the next value from the neighbour's next value, and return
 *  1 - normalized RMSE. High = deterministic (chaos), ~0 = unpredictable (noise). */
function _predictability(s, m, tau) {
  const w = 4;                               // Theiler window (exclude temporal neighbours)
  const last = s.length - m * tau;           // need a "next" value
  const pts = [];
  for (let i = 0; i + (m - 1) * tau < s.length - 1; i++) {
    const v = [];
    for (let j = 0; j < m; j++) v.push(s[i + j * tau]);
    pts.push({ v, next: s[i + (m - 1) * tau + 1], t: i });
  }
  if (pts.length < 10) return 0;
  let mu = 0; for (const p of pts) mu += p.next; mu /= pts.length;
  let varr = 0; for (const p of pts) varr += (p.next - mu) ** 2; varr /= pts.length;
  if (varr < 1e-12) return 0;
  let se = 0, n = 0;
  for (let a = 0; a < pts.length; a++) {
    let bestD = Infinity, bestNext = null;
    for (let b = 0; b < pts.length; b++) {
      if (Math.abs(pts[a].t - pts[b].t) < w) continue;
      let dd = 0; for (let j = 0; j < m; j++) { const e = pts[a].v[j] - pts[b].v[j]; dd += e * e; }
      if (dd < bestD) { bestD = dd; bestNext = pts[b].next; }
    }
    if (bestNext !== null) { se += (pts[a].next - bestNext) ** 2; n++; }
  }
  if (n === 0) return 0;
  const rmse = Math.sqrt(se / n);
  return Math.max(0, 1 - rmse / Math.sqrt(varr));   // 1 = perfectly predictable
}

/**
 * Encode the determinism / return-map identity of `input`. 29-D; ~0 for
 * non-series input. `input` is the serialized signal (source text OR a retained
 * waveform/series) — see AGENTS.md; this layer reads the numeric SERIES in it.
 * @param {string} input
 * @returns {Float64Array} 29-D
 */
function toDynamicalWaveform(input) {
  const out = new Float64Array(DIM_TARGET);
  const s = _parseSeries(input);
  if (!s) return out;                        // self-gated: no series → neutral

  // z-normalize (scale-invariant; ordinal + predictability are already scale-free
  // but normalize the copy used for prediction distances)
  let mu = 0; for (const x of s) mu += x; mu /= s.length;
  let sd = 0; for (const x of s) sd += (x - mu) ** 2; sd = Math.sqrt(sd / s.length) || 1;
  const z = s.map((x) => (x - mu) / sd);

  let k = 0;
  // Permutation entropy at (d,τ)
  for (const [d, tau] of [[3, 1], [4, 1], [5, 1], [6, 1], [4, 2], [4, 3], [5, 2]]) out[k++] = _permEntropy(z, d, tau);
  // Statistical complexity at (d,τ) — the chaos-vs-noise separator
  for (const [d, tau] of [[3, 1], [4, 1], [5, 1], [6, 1], [4, 2], [5, 2]]) out[k++] = _statComplexity(z, d, tau);
  // Delay-embedding predictability (determinism) at (m,τ)
  for (const [m, tau] of [[2, 1], [3, 1], [4, 1], [5, 1], [3, 2], [4, 2]]) out[k++] = _predictability(z, m, tau);
  // Nonlinear prediction GAIN over a linear AR(1) predictor (isolates nonlinear determinism)
  const ar1 = (() => {
    let n = 0, d0 = 0; for (let i = 1; i < z.length; i++) { n += z[i] * z[i - 1]; d0 += z[i - 1] * z[i - 1]; }
    const a = d0 > 1e-12 ? n / d0 : 0;
    let se = 0, v = 0, mu2 = 0; for (let i = 1; i < z.length; i++) mu2 += z[i]; mu2 /= (z.length - 1);
    for (let i = 1; i < z.length; i++) { se += (z[i] - a * z[i - 1]) ** 2; v += (z[i] - mu2) ** 2; }
    return v > 1e-12 ? Math.max(0, 1 - se / v) : 0;         // linear predictability
  })();
  for (const [m, tau] of [[2, 1], [3, 1]]) out[k++] = Math.max(0, _predictability(z, m, tau) - ar1);
  // A couple of coarse recurrence/spread features to fill the block
  out[k++] = ar1;
  // permutation-entropy slope across d (regular→low, noise→flat-high, chaos→intermediate)
  out[k++] = _permEntropy(z, 6, 1) - _permEntropy(z, 3, 1);
  while (k < DIM_TARGET) out[k++] = 0;
  return out;
}

/** The measured determinism score of an input in [0,1] — how predictable-in-delay-
 *  space (deterministic) it is; 0 for non-series. Useful as a gate / diagnostic. */
function dynamicalGain(input) {
  const s = _parseSeries(input);
  if (!s) return 0;
  let mu = 0; for (const x of s) mu += x; mu /= s.length;
  let sd = 0; for (const x of s) sd += (x - mu) ** 2; sd = Math.sqrt(sd / s.length) || 1;
  const z = s.map((x) => (x - mu) / sd);
  return _predictability(z, 3, 1);
}

module.exports = { DIM: DIM_TARGET, toDynamicalWaveform, dynamicalGain, _parseSeries, _permEntropy, _statComplexity, _predictability };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
toDynamicalWaveform.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 13, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
dynamicalGain.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 13, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
