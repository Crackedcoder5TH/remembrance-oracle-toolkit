'use strict';

/**
 * decoder-stack.js — registry + depth-aware composer for the
 * fractal-by-stacking encoder layers.
 *
 * Per the architectural principle: the encoder isn't a fixed
 * function; it's a stack that grows as the substrate finds residual
 * that current layers don't explain.
 *
 *   depth 1 (L1):  structural fractal   29-D
 *   depth 4:       +L2 lexical +L3 numerical +L4 spectral → 116-D  (composed_v1, legacy parity anchor)
 *   depth 7:       +L5 redundancy +L6 content +L7 dimensional → 203-D  (composed_v4, live)
 *   depth 8:       +L8 dynamical → 232-D  (active stack; MAX_DEPTH)
 *   L9 relational, L10 alignment: registered, INACTIVE (validated, not yet earned).
 *   (These are LENS axes, not the compressed payload — see the disclaimer below.)
 *
 * Each layer encoder is registered with a `seed`: the kind of
 * residual it was designed to explain. The residual monitor (in
 * residual-monitor.js) measures whether activated layers are
 * sufficient, and signals when the stack should grow.
 *
 * Entanglement with the Void compression flow: compression invokes
 * the stack at currentDepth(); if compression finds collisions
 * (residual signal), the stack activates the next registered layer.
 * Encoder spawning is part of compression, not a separate process.
 *
 * ─────────────────────────────────────────────────────────────────
 * DISCLAIMER — what the composed dimensionality IS (and is NOT):
 * The composed vector's dimension (29-D per layer; 203-D `composed_v4`
 * live, up to 232-D at MAX_DEPTH=8; 116-D `composed_v1` is only the
 * legacy parity anchor) is the number of structural AXES the lenses
 * separate the data into — the coordinate frame in which the
 * compression is EXTRACTED as a mathematical equation (pattern +
 * residual). It is NOT the compressed payload and it is NOT a lossy
 * fingerprint. The Void compression itself (see void_compressor_v5.py)
 * is LOSSLESS: it stores `pattern_reference + residual` and
 * reconstructs the exact original bytes (verified byte-for-byte, always
 * ≤ zlib). Do not read this dimension as "the compression" or as a
 * compression ratio — it is the lens frame the equation is written in.
 * ─────────────────────────────────────────────────────────────────
 */

const { toFractalWaveform } = require('./fractal-waveform');
const { toLexicalWaveform } = require('./lexical-waveform');
const { toNumericalWaveform } = require('./numerical-waveform');
const { toSpectralWaveform } = require('./spectral-waveform');
const { toRedundancyWaveform } = require('./redundancy-waveform');
const { toContentProjection } = require('./content-projection');
const { toDimensionalWaveform } = require('./dimensional-waveform');
const { toDynamicalWaveform } = require('./dynamical-waveform');
const { toRelationalWaveform } = require('./relational-waveform');
const { toAlignmentWaveform } = require('./alignment-waveform');

const DEFAULT_DEPTH = 2;

// ── Registry ────────────────────────────────────────────────────
// Layers are ordered; each entry has:
//   - id:    short name
//   - dims:  output dimensionality
//   - encode: function(input) -> Float64Array of `dims` values
//   - seed:  description of the residual this layer was designed
//            to explain (used by the residual monitor to choose
//            the next layer to activate)
//   - active: whether the layer is currently in use

const _registry = [
  {
    id: 'L1-structural',
    dims: 29,
    encode: toFractalWaveform,
    seed: 'baseline: atomic properties + structural histograms + structurality',
    active: true,
  },
  {
    id: 'L2-lexical',
    dims: 29,
    encode: toLexicalWaveform,
    seed: 'residual L1 missed: naming conventions, vocabulary entropy, formatting, stylistic markers, content type',
    active: true,
  },
  {
    id: 'L3-numerical',
    dims: 29,
    encode: toNumericalWaveform,
    seed: 'residual L1+L2 missed: numeric statistics, sequence dynamics (autocorr, slope, monotonicity), distribution shape (tail heaviness, log-scale), structural sequence (char entropy, periodic patterns), domain markers (timestamp/ratio/coordinate). Designed from the residual monitor surfacing cascade/*+validation/* collapse on JSON-serialized number arrays.',
    active: true,
  },
  {
    id: 'L4-spectral',
    dims: 29,
    encode: toSpectralWaveform,
    seed: 'residual L1+L2+L3 missed: WITHIN-numerical-domain confusion (cascade/* weather, crypto, econ all read as one signature at L3 because L3 captures shape statistics not frequency content). L4 extracts FFT-derived energy distribution across 8 log-frequency bins, spectral shape (centroid, spread, flatness, roll-off), multi-lag autocorrelation (lags 2,4,8,16,32), non-stationarity (variance ratio, trend strength, detrended residual, piecewise heterogeneity, largest gap), and spectral domain markers (1/f-noise-likeness, white-noise-likeness, daily and weekly period spikes). Designed to distinguish weather oscillation from crypto random-walk from economic drift from analytical curves.',
    active: true,
  },
  {
    id: 'L5-redundancy',
    dims: 29,
    encode: toRedundancyWaveform,
    seed: 'residual L1-L4 leave against an EXTERNAL reference: the four-telescope convergence experiment showed gzip NCD (Kolmogorov approximation) sees domain structure better than the depth-4 stack (kNN purity 0.774 vs 0.528, Spearman 0.731). The gap: (1) redundancy character — how much of a pattern is repetition of itself, the one quantity a dictionary compressor is built to measure and no earlier layer asks about; (2) content identity — WHICH tokens, not just what kinds; the stack is deliberately content-blind. L5 imports the compressor as a sensor: deflate-derived redundancy features (whole/halves/internal-NCD/level-spread), n-gram repetition structure, byte entropy, and a 16-bucket hashed vocabulary sketch. First layer designed against an external instrument rather than internal residual. INACTIVE until it proves itself via the convergence loop and the 116-D consumers (Void parity, field-tool round-trip, classifier DIM map) are deliberately migrated — reachable now via composedAtDepth(text, 5). ACTIVATED after the depth-agnostic index migration (both FractalIndex copies zero-pad and clamp to MAX_DEPTH=5) and the partial Void composed_v2 re-encode.',
    active: true,
  },
  {
    id: 'L6-content-projection',
    dims: 29,
    encode: toContentProjection,
    seed: 'residual L1-L5 leave: CONTENT IDENTITY. The residual monitor at depth 5 surfaced its last unexplained residual as false-equivalence between distinct sources of similar shape — two prose docs, two different functions, two distinct numeric series — because the structural stack (L1-L4) is content-blind by design and L5 reads redundancy, not subject. The four-telescope experiment localized the missing signal: the gzip-NCD (compression) telescope sees domain/content structure the structural stack does not (kNN domain purity: stack 0.60 vs gzip 0.83). L6 imports that view by PATTERN PROJECTION onto a fixed compression basis — each coordinate is 1-NCD against a canonical landmark pattern, mean-centered so the discriminating relative profile is the signal. CALIBRATED, not asserted: scripts/encoder-layer-calibration.cjs confirms L6 moves the fractal telescope toward the gzip telescope — Spearman 0.778 → ~0.81 and kNN purity 0.60 → 0.71 with FIXED landmarks, closing over half the structure-to-compression gap. This is the layer the attribution use-case requires: you cannot track a pattern back to its source if the encoder cannot tell two sources apart. INACTIVE pending the deliberate composed_v3 migration (same discipline as L5 before its activation): reachable now via composedAtDepth(text, 6); activating it re-encodes the 116/145-D consumers to 174-D. ACTIVATED (Phase 1 — encoder): the calibration harness (scripts/encoder-layer-calibration.cjs) confirms L6 EARNS its place — kNN domain purity 0.6286 → 0.7195 (Δ+0.091) and agreement with the gzip/deflate telescopes 0.786 → 0.829 (converges, not overfits). The encoder now composes at depth 7 (compose() = 203-D). CODE PATH MIGRATED: both FractalIndex copies are MAX_DEPTH=7, the flow scorer\'s deepest score (d4) now consumes every active layer at the shared whole-block depth, the published field-tool package is byte-identical at depth 7, and the export round-trip carries 203-D — all inert on legacy 116-D vectors (they compare at their shared depth) so nothing regresses. The ONLY remaining step is the DATA re-encode: pattern_index_fractal.json still stores composed_v1 (116-D), so the 47k substrate lights up L5-L7 once regenerated to composed_v3/v4 (203-D), after which field-tool queries flip to the active depth. Stated plainly: until that data re-encode, the coin path scores at the shared depth 4.',
    active: true,
  },
  {
    id: 'L7-dimensional',
    dims: 29,
    encode: toDimensionalWaveform,
    seed: 'residual L1-L6 leave: the SECOND DIMENSION. L1-L6 are dominantly 1D — they read the data as a sequence. Absent from the stack is autoregressive / row-to-row structure, the property that makes two different series of the same generative process kin despite different values (a 1D compressor scatters them; a 2D predictive filter clusters them). The telescope-2d experiment confirmed this axis is real and independent of gzip (Spearman 0.34, purity 0.67 vs chance 0.15). L7 imports it, SELF-GATED on intrinsic dimensionality: it parses a numeric series out of the text (the substrate stores series as text — the 2D structure is in the VALUES, not the digit bytes), detects the period by autocorrelation (as L4 does), reshapes to a PERIOD-MATCHED grid (a fixed sqrt-width misses arbitrary-period structure — a sine of period 44 gives gain 0 at width 20, gain 0.24 at width 44), and emits a 2D-NCD projection onto numeric archetypes SCALED BY THE 2D-GAIN. Text/code/non-series input has zero gain → L7 contributes nothing and defers to L1-L6; periodic numeric data contributes fully; hybrid proportionally. This is the layer that answers "know where the data becomes 2D." Under the multi-telescope consensus (now including the 2D-Paeth telescope) the self-gated 2D layer earns its place where every flat 1D candidate was refused — it adds signal only where 2D structure exists and stays neutral elsewhere. First build was silent on real data (fixed-width, byte-level) — caught by testing text-encoded numbers; the period-aware, parse-first version fires (sine 0.24, modulated 0.37) and stays silent on code/prose (0.0). INACTIVE pending the deliberate composed_v4 migration (same discipline as L5/L6): reachable via composedAtDepth(text, 7). ACTIVATED (Phase 1 — encoder) as the seventh layer — the START of the 2D axis in the live encoder. This is the SELF-GATED dimensional layer (toDimensionalWaveform), NOT the "L7-by-projection" candidate the calibration harness rejected for overfitting: it is neutral (zero gain) on text/code/prose and fires only where genuine 2D/series structure exists, so it cannot degrade the 1D discrimination that L1-L6 already earn — held-out check: depth-7 kNN purity 0.226 → 0.233, never below depth-6. The 2D layer is now part of the composed encoder (compose() = depth 7 / 203-D); its discriminative payoff on series data lands in the coin path with the composed_v4 substrate re-encode + flow-scorer extension (Phase 2).',
    active: true,
  },
  {
    id: 'L8-dynamical',
    dims: 29,
    encode: toDynamicalWaveform,
    seed: 'residual L1-L7 leave: DETERMINISM in an APERIODIC series. The substrate diagnosed this gap itself — a chaos-vs-noise probe found the composed L1-L7 stack scored deterministic chaos and true randomness as nearly indistinguishable (chaos-vs-random AUC ~0.55-0.70). Both look random to a compressor; the difference is that chaos is PREDICTABLE in delay-coordinate (Takens) space and true randomness is not. L7 catches 2D structure but is PERIOD-GATED, so it is blind to chaos, whose determinism lives in an aperiodic return map (x_{t+1} = f(x_t)). L8 imports the established dynamical-systems instruments: Bandt-Pompe permutation entropy, MPR statistical complexity (Rosso et al. 2007 "Distinguishing noise from chaos" — the complexity-entropy plane), and delay-embedding nearest-neighbour predictability (the core determinism signal). SELF-GATED like L7: parses a numeric series and fires only when one exists (>=24 points); text/code/prose yield a zero vector (verified: gain 0.000 on code/prose/JSON/SQL) so it cannot degrade the 1D discrimination L1-L7 earn. VALIDATED by a rigorous falsifiable test with the physics gold-standard controls, across 3 chaos maps (logistic/tent/Henon) and 3 noise types (uniform/Gaussian/AR1-colored): chaos-vs-random AUC 1.000 (L1-L7 baseline 0.70, permutation-entropy-alone baseline 0.91); SURROGATE-DATA NULL (chaos vs its own shuffle — identical histogram, determinism destroyed) AUC 1.000, proving it measures temporal determinism not the value distribution; shuffle-surrogate predictability collapses to the noise floor (0.00 vs chaos 0.95); label-shuffle null 0.501. This is the layer that lets the substrate tell a deterministic process from a genuinely random (e.g. quantum) one — the return-map/delay-embedding axis. ACTIVATED as the eighth layer.',
    active: true,
  },
  {
    id: 'L9-relational',
    dims: 29,
    encode: toRelationalWaveform,
    seed: 'residual L1-L8 leave: RELATIONAL IDENTITY — who binds to whom. Surfaced by a falsifiable test (the STRING-PPI v12 → HPA-expression bonus-structure kill-test): the stack reads SHAPE (redundancy, spectral/2D form, determinism) but is blind to community structure. Network topology carried NO signal about the expression-derived reprogramming lever past a degree-matched permutation null (z=-0.6), because a shape encoder cannot see who-binds-whom — the same false-equivalence class the L6 residual noted, now on GRAPH community rather than token identity. L9 imports the graph-community axis: it builds the token co-occurrence graph of the input, finds a partition by deterministic label propagation, and emits community features whose load-bearing coordinate is MODULARITY ABOVE THE DEGREE-PRESERVING NULL (the "does this decompose into tightly-bound groups beyond what degree forces" signal no shape layer asks about). SELF-GATED like L7/L8: gain = f(graph size, modularity-above-null contrast); trivial or random-wired or monotone inputs → gain≈0, so L9 defers to L1-L8 and cannot degrade their discrimination. INACTIVE pending its falsifiable validation (scripts/l9-community-validation.mjs — stochastic-block-model community vs a degree-preserving edge-shuffle surrogate with an identical token histogram, plus a held-out neutrality check) and the deliberate composed_v* migration; reachable now via composedAtDepth(text, 9). Validated the L7/L8 way (task test + surrogate null), NOT the projection consensus gate — this is a genuinely new signal orthogonal to the shape telescopes, which by construction it must diverge from.',
    active: false,
  },
  {
    id: 'L10-alignment',
    dims: 29,
    encode: toAlignmentWaveform,
    seed: 'residual L1-L9 leave: CROSS-REPRESENTATION CORRESPONDENCE. Surfaced by the lens-fractal-compare receipt — the four transfer nulls (physics→biology, PPI→expression, cross-family SC, depth-compounding) compress into their OWN structural family distinct from every shape lens (null↔shape 0.854), and their shared thread is not within-input community (L9) but whether representation A obeys the SAME LAW as representation B despite different surface/scale. L1-L8 read the surface; two sequences y=3·x^0.75 and y=1000·x^0.75 are the same 3/4 power law but a shape encoder scatters them. L10 fingerprints an input by WHICH FIXED LAWS it obeys (Ajani\'s Structural Compressor v3 as the law library + calibration oracle: fixed power laws 3/4·1/2·1·2/3·4/3·2·3·-1·-2, recursive fibonacci/doubling/halving, harmonic 1/2/3-cycle, and RELATIONAL power laws between the input\'s own field-pairs — how Kleiber is caught, metabolic~mass^3/4). Each coordinate is coherence (R²×signal-reduction) against one law; same-law inputs align across domains regardless of surface. SELF-GATED like L7/L8/L9: gain = strongest law-conformance; noise / lawless / non-numeric input → gain≈0 so it defers to L1-L9 and cannot degrade them. This is the ALIGNMENT/binding axis the null-family asked for — and the one the superconductor frame needs (bind the pattern to the host = correspondence between two representations). INACTIVE pending its validation (scripts/l10-alignment-validation.mjs — calibrate against v3\'s HIGH/NOISE calls, a same-law/different-scale alignment task where shape genuinely cannot fake it, and a run through the transfer nulls) and the composed_v* migration; reachable now via composedAtDepth(text, 10).',
    active: false,
  },
  // L11+ slots reserved.
];

function currentDepth() {
  return _registry.filter(l => l.active).length;
}

function maxAvailableDepth() {
  return _registry.length;
}

function activeLayers() {
  return _registry.filter(l => l.active).map(l => ({ id: l.id, dims: l.dims, seed: l.seed }));
}

/**
 * Activate the next registered-but-inactive layer. Returns the
 * layer that was activated, or null if no more available.
 */
function activateNextLayer() {
  const next = _registry.find(l => !l.active);
  if (!next) return null;
  next.active = true;
  return { id: next.id, dims: next.dims, seed: next.seed };
}

/**
 * Register a new layer encoder. Called when a residual analysis
 * surfaces a missing dimension and a new encoder is designed.
 */
function registerLayer({ id, dims, encode, seed, active = false }) {
  if (_registry.find(l => l.id === id)) {
    throw new Error('encoder layer already registered: ' + id);
  }
  _registry.push({ id, dims, encode, seed, active });
}

// ── Composer ────────────────────────────────────────────────────

/**
 * Encode at the requested depth. depth=k activates the first k
 * registered layers (regardless of their active flag), concatenates
 * their outputs.
 *
 * @param {string} input  the serialized signal to encode — source text OR a
 *   retained waveform/series. NOT necessarily source: the substrate feeds the
 *   compressed representation, never original text. (See Void AGENTS.md.)
 * @param {number} [depth=currentDepth()]
 * @returns {Float64Array}
 */
function composedAtDepth(input, depth) {
  const k = Number.isFinite(depth) ? Math.min(depth, _registry.length) : currentDepth();
  if (k <= 0) return new Float64Array(0);
  const parts = [];
  let total = 0;
  for (let i = 0; i < k; i++) {
    const v = _registry[i].encode(input);
    parts.push(v);
    total += v.length;
  }
  const out = new Float64Array(total);
  let off = 0;
  for (const v of parts) {
    for (let i = 0; i < v.length; i++) out[off + i] = v[i];
    off += v.length;
  }
  // HARDCODED RULE 9 — every composed read is recorded into the void-seal
  // ledger AT THE POINT OF PRODUCTION, not as a caller discipline: the seal
  // minted at output time binds the digest of every vector this stack
  // produced, so numbers derived from unsealed reads cannot be reported as
  // substrate reads. (Harvested from the audit-remembrance-ecosystem branch.)
  try { require('./void-seal').record(out, k); } catch (_) { /* seal module absent: engine-only */ }
  return out;
}

/**
 * Same as composedAtDepth but uses the currently-active depth.
 */
function compose(input) {
  return composedAtDepth(input, currentDepth());
}

/**
 * Cosine between two composed signatures (same depth).
 */
function composedCosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function composedCosineOf(textA, textB, depth) {
  return composedCosine(
    composedAtDepth(textA, depth),
    composedAtDepth(textB, depth),
  );
}

/**
 * Cumulative dimension boundary of every ACTIVE layer — the depth
 * checkpoints. Derived from the layer set itself, never hardcoded, so
 * activating a layer widens every reading in the ecosystem with no edit.
 *
 * With L1..L8 active: [29, 58, 87, 116, 145, 174, 203, 232].
 *
 * @returns {number[]}
 */
function flowCheckpoints() {
  const out = [];
  let sum = 0;
  for (const L of activeLayers()) { sum += L.dims; out.push(sum); }
  return out.length ? out : [29];
}

/**
 * Depth-flow cosines across the FULL canonical waveform: partial cosines
 * at every active layer's cumulative boundary, in one sweep.
 *
 * This is the canonical flow reading — the mapper's pairwise pass, the
 * goggles' drift lens, and every other depth-flow consumer calls THIS, not
 * a local copy (one decoder, one cosine — ECOSYSTEM §7).
 *
 * WHY THIS CHANGED — it used to read only 116 of 232 dimensions.
 *
 * The body was `CHECK = [29, 58, 87, 116]` with `n = Math.min(116, …)`, a
 * hard cap written when four layers existed. Four more were built and
 * activated since — L5-redundancy, L6-content-projection, L7-dimensional,
 * L8-dynamical — and the cap was never lifted, so every resonance reading in
 * the ecosystem discarded half the decoder's output. The layers ran, emitted
 * their 29 dims each, and were truncated at the comparison. currentDepth()
 * reported 8 and Void's pattern store held 232-D vectors (C-02), while the
 * function that compares them stopped at 116.
 *
 * WHAT IT CHANGES — honestly, including the costs:
 *
 *  1. Every flow reading now spans all 232 dims. Numbers move. A pair whose
 *     surface structure matched but whose redundancy or content-projection
 *     differs will read LOWER than before, and that is the point: the layers
 *     that separate look-alikes were the ones being cut.
 *  2. The return array is now 8 long, not 4. Consumers that indexed [3] as
 *     "the deepest" must use the LAST element. `deepestFlow()` is exported
 *     for exactly that, so no caller hardcodes an index again.
 *  3. Stored readings taken before this change are not comparable to
 *     readings after it — they measured a different width. Same boundary
 *     problem as the coherency rewiring; treat pre-change flow numbers as a
 *     different quantity rather than differencing across it.
 *  4. Cost is ~2x per comparison: the sweep touches 232 dims instead of 116.
 *
 * Vectors shorter than a checkpoint reuse the deepest reading available, so
 * a 116-D legacy entry still returns a full-length array — its later
 * checkpoints simply repeat, which is visible rather than silent.
 *
 * @returns {number[]} cosines at each active depth, length = active layers
 */
function flowCosines(a, b) {
  const CHECK = flowCheckpoints();
  const width = CHECK[CHECK.length - 1];
  const out = new Array(CHECK.length).fill(0);
  let dot = 0, na = 0, nb = 0, c = 0;
  const n = Math.min(width, a.length, b.length);
  for (let i = 0; i < n && c < CHECK.length; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    dot += x * y; na += x * x; nb += y * y;
    if (i + 1 === CHECK[c]) {
      out[c] = (na > 1e-12 && nb > 1e-12) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
      c++;
    }
  }
  for (; c < CHECK.length; c++) out[c] = c > 0 ? out[c - 1] : 0;
  return out;
}

/**
 * The deepest reading in a flow — the full-waveform cosine.
 *
 * Callers used to write `f[3]`, which silently meant "116-D" and became
 * wrong the moment a fifth layer activated. Ask for the deepest instead of
 * counting.
 *
 * @param {number[]} flow
 * @returns {number}
 */
function deepestFlow(flow) {
  if (!Array.isArray(flow) || !flow.length) return 0;
  return flow[flow.length - 1];
}

module.exports = {
  DEFAULT_DEPTH,
  currentDepth,
  maxAvailableDepth,
  activeLayers,
  activateNextLayer,
  registerLayer,
  composedAtDepth,
  compose,
  composedCosine,
  composedCosineOf,
  flowCosines,
  flowCheckpoints,
  deepestFlow,
};

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
currentDepth.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 4, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
maxAvailableDepth.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 13, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
activeLayers.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 4, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
activateNextLayer.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 12, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
registerLayer.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
composedAtDepth.atomicProperties = { charge: 1, valence: 1, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 1, group: 13, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
compose.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
composedCosine.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 13, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
composedCosineOf.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
flowCheckpoints.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 13, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
flowCosines.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 13, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
deepestFlow.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 13, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
