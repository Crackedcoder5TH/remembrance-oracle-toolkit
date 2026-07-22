'use strict';

/**
 * relational-waveform.js — L9: the IDENTITY/COMMUNITY layer, self-gated on
 * modularity-above-degree-null.
 *
 * The residual L1-L8 leave, surfaced by a falsifiable test (the STRING-PPI →
 * HPA-expression bonus-structure kill-test): the stack reads SHAPE — redundancy,
 * spectral/2D form, determinism — but is blind to RELATIONAL IDENTITY: WHO binds
 * to WHOM. When a signal's information lives in the community structure of its
 * co-occurrence graph (a protein's interaction module, a program's call cluster,
 * a document's topic block), two inputs with an IDENTICAL token histogram and
 * identical 1D shape but DIFFERENT wiring are read as equivalent by L1-L8 — the
 * exact false-equivalence the PPI null localized (network topology carried no
 * signal past a degree-matched null, because a shape encoder cannot see it).
 *
 * L9 imports the graph-community axis. It builds the token co-occurrence graph of
 * the input (nodes = distinct tokens, edges = windowed adjacency counts), finds a
 * community partition by deterministic label propagation, and emits graph-
 * structural features whose load-bearing coordinate is MODULARITY ABOVE THE
 * DEGREE-PRESERVING NULL — the "does this decompose into tightly-bound groups
 * beyond what degree alone forces" signal that no shape layer asks about.
 *
 * SELF-GATED like L7/L8: the emitted vector is scaled by a gain = f(graph size,
 * modularity contrast). Inputs with a trivial co-occurrence graph (too few
 * distinct tokens) or community structure no better than the degree-null (random
 * wiring, monotone series, uniform noise) yield gain ≈ 0 → L9 contributes nothing
 * and defers to L1-L8, so it cannot degrade the discrimination they already earn.
 * Community-structured inputs contribute fully; hybrid proportionally.
 *
 * DETERMINISM IS LOAD-BEARING: fixed tokenizer, fixed label-propagation order and
 * tie-break (smallest label id), fixed iteration count — byte-identical across
 * runs. No Math.random, no Date. Identity (coin_id) is L1-anchored and untouched.
 *
 * VALIDATION (labeled method, L7/L8 discipline — a falsifiable task test with a
 * surrogate null, NOT the projection consensus gate that rejects new signals):
 * see scripts/l9-community-validation.mjs — stochastic-block-model community vs a
 * degree-preserving edge-shuffle surrogate (identical token histogram, community
 * destroyed). L9 must separate them where L1-L8 sit at chance, and must stay
 * neutral (held-out purity never below depth-8) on shape corpora.
 */

const DIM_TARGET = 29;
const MIN_NODES = 6;        // below this the co-occurrence graph is trivial → gate off
const WINDOW = 2;           // co-occurrence window (adjacency + skip-1)
const LP_PASSES = 6;        // label-propagation sweeps (deterministic)

// ── tokenizer: words/identifiers/numbers; falls back to char-grams if too sparse ──
function _tokens(text) {
  let toks = text.match(/[A-Za-z0-9_]+/g) || [];
  if (toks.length < MIN_NODES * 2) {
    // sparse symbolic input — read structure at the character level instead
    toks = text.replace(/\s+/g, ' ').split('').filter((c) => c !== ' ');
  }
  return toks;
}

// ── build the weighted co-occurrence graph ──────────────────────────
function _graph(text) {
  const toks = _tokens(text);
  if (toks.length < MIN_NODES) return null;
  const id = new Map();
  const ids = new Array(toks.length);
  for (let i = 0; i < toks.length; i++) {
    let x = id.get(toks[i]);
    if (x === undefined) { x = id.size; id.set(toks[i], x); }
    ids[i] = x;
  }
  const N = id.size;
  if (N < MIN_NODES) return null;
  // weighted adjacency as Map<node, Map<node, weight>>
  const adj = Array.from({ length: N }, () => new Map());
  const bump = (a, b) => { if (a === b) return; adj[a].set(b, (adj[a].get(b) || 0) + 1); adj[b].set(a, (adj[b].get(a) || 0) + 1); };
  for (let i = 0; i < ids.length; i++) {
    for (let w = 1; w <= WINDOW && i + w < ids.length; w++) bump(ids[i], ids[i + w]);
  }
  const deg = new Float64Array(N);
  let m2 = 0; // sum of weighted degrees = 2m
  for (let a = 0; a < N; a++) { let d = 0; for (const [, w] of adj[a]) d += w; deg[a] = d; m2 += d; }
  if (m2 === 0) return null;
  return { N, adj, deg, m2 };
}

// ── deterministic label propagation → community labels ──────────────
function _labelProp(g) {
  const { N, adj } = g;
  const label = new Int32Array(N);
  for (let i = 0; i < N; i++) label[i] = i;
  for (let pass = 0; pass < LP_PASSES; pass++) {
    let moved = false;
    for (let a = 0; a < N; a++) {
      if (adj[a].size === 0) continue;
      // weighted vote of neighbour labels; ties → smallest label id (deterministic)
      const tally = new Map();
      for (const [b, w] of adj[a]) tally.set(label[b], (tally.get(label[b]) || 0) + w);
      let best = label[a], bestW = -1;
      for (const [lb, w] of tally) { if (w > bestW || (w === bestW && lb < best)) { best = lb; bestW = w; } }
      if (best !== label[a]) { label[a] = best; moved = true; }
    }
    if (!moved) break;
  }
  return label;
}

// ── modularity of a partition (Newman); Q already subtracts the degree null ──
function _modularity(g, label) {
  const { N, adj, deg, m2 } = g;
  const m = m2 / 2;
  if (m === 0) return 0;
  // intra-community edge weight, and per-community degree sum
  let intra = 0; const degSum = new Map();
  for (let a = 0; a < N; a++) {
    degSum.set(label[a], (degSum.get(label[a]) || 0) + deg[a]);
    for (const [b, w] of adj[a]) if (label[a] === label[b]) intra += w; // counts each edge twice
  }
  let q = intra / (2 * m);
  for (const [, ds] of degSum) q -= (ds / (2 * m)) ** 2;
  return q; // in [-0.5, 1]; >0 means community above the degree-preserving null
}

// ── helpers for the feature block ───────────────────────────────────
function _gini(arr) {
  const a = Array.from(arr).sort((x, y) => x - y); const n = a.length; if (!n) return 0;
  let cum = 0, tot = 0; for (let i = 0; i < n; i++) { cum += (i + 1) * a[i]; tot += a[i]; }
  return tot === 0 ? 0 : (2 * cum) / (n * tot) - (n + 1) / n;
}
function _entropy(counts) {
  let tot = 0; for (const c of counts) tot += c; if (tot === 0) return 0;
  let h = 0; for (const c of counts) { if (c > 0) { const p = c / tot; h -= p * Math.log2(p); } }
  const hmax = Math.log2(counts.length || 1) || 1; return h / hmax;
}

/**
 * L9 relational/community waveform. Returns a 29-D Float64Array; a zero vector
 * when the input has no community structure above the degree null (self-gated).
 */
function toRelationalWaveform(input) {
  const out = new Float64Array(DIM_TARGET);
  if (typeof input !== 'string' || input.length < 8) return out;
  const g = _graph(input);
  if (!g) return out;
  const { N, adj, deg, m2 } = g;
  const E = m2 / 2;
  const label = _labelProp(g);
  const Q = _modularity(g, label);

  // community sizes
  const commSize = new Map();
  for (let a = 0; a < N; a++) commSize.set(label[a], (commSize.get(label[a]) || 0) + 1);
  const sizes = Array.from(commSize.values()).sort((a, b) => b - a);
  const nComm = sizes.length;

  // triangles / clustering (transitivity) via neighbour-set intersection
  let tri = 0, triads = 0;
  const nbrSet = adj.map((mp) => new Set(mp.keys()));
  for (let a = 0; a < N; a++) {
    const nb = Array.from(nbrSet[a]);
    const k = nb.length; triads += k * (k - 1) / 2;
    for (let i = 0; i < nb.length; i++) for (let j = i + 1; j < nb.length; j++) if (nbrSet[nb[i]].has(nb[j])) tri++;
  }
  const transitivity = triads > 0 ? tri / triads : 0; // note: tri counted 3×/2 vs triads convention → in [0,~1.5]; used as a feature, monotone

  // degree assortativity (Pearson of end-degrees over edges)
  let sPD = 0, sSum = 0, sSq = 0, wE = 0;
  for (let a = 0; a < N; a++) for (const [b, w] of adj[a]) if (a < b) { const da = deg[a], db = deg[b]; sPD += w * da * db; sSum += w * (da + db) / 2; sSq += w * (da * da + db * db) / 2; wE += w; }
  const meanD = wE ? sSum / wE : 0;
  const varD = wE ? sSq / wE - meanD * meanD : 0;
  const assort = (varD > 1e-9 && wE > 0) ? (sPD / wE - meanD * meanD) / varD : 0;

  // intra-community edge fraction
  let intraE = 0, totE = 0;
  for (let a = 0; a < N; a++) for (const [b, w] of adj[a]) if (a < b) { totE += w; if (label[a] === label[b]) intraE += w; }
  const intraFrac = totE ? intraE / totE : 0;

  // connected components (largest CC fraction) via BFS
  const seen = new Int8Array(N); let largestCC = 0, nCC = 0;
  for (let s = 0; s < N; s++) { if (seen[s]) continue; nCC++; let sz = 0; const st = [s]; seen[s] = 1; while (st.length) { const u = st.pop(); sz++; for (const [v] of adj[u]) if (!seen[v]) { seen[v] = 1; st.push(v); } } if (sz > largestCC) largestCC = sz; }

  const degArr = Array.from(deg);
  const Nz = N || 1;                          // N≥MIN_NODES here by the _graph guard; this only hardens
  const maxDeg = degArr.reduce((a, b) => Math.max(a, b), 0);
  const meanDeg = m2 / Nz;
  const deg1 = degArr.filter((d) => d <= 1).length;

  // ── raw feature block (community/identity axis) ──
  const raw = [
    Math.log1p(N),
    Math.log1p(E),
    (2 * E) / (N * (N - 1) || 1),          // density
    meanDeg,
    _gini(degArr),                          // degree inequality
    assort,                                 // degree assortativity
    transitivity,                           // triangle density
    Math.log1p(tri),
    Q,                                      // MODULARITY above degree-null (load-bearing)
    Math.max(0, Q),                         // rectified modularity
    nComm / Nz,                             // community fragmentation
    (sizes[0] || 0) / Nz,                   // largest community fraction
    (sizes[1] || 0) / Nz,                   // second community fraction
    _entropy(sizes),                        // community size entropy
    intraFrac,                              // intra-community edge fraction
    sizes.filter((s) => s === 1).length / Nz, // singleton fraction
    degArr.length ? deg1 / Nz : 0,          // leaf fraction
    _entropy(degArr),                       // degree entropy
    maxDeg / (meanDeg || 1),                // hub dominance
    nCC / Nz,                               // component fragmentation
    largestCC / Nz,                         // giant-component fraction
    Math.min(1, E / Nz),                    // edges-per-node (clamped)
    Q * intraFrac,                          // community coherence composite
    Q - transitivity * 0.0,                 // (kept as modularity echo)
    _entropy(Array.from(commSize.values())),
    (sizes[0] || 0) / (sizes[1] || 1),      // dominance ratio (log-safe below)
  ];
  // normalize the dominance ratio into a bounded feature
  raw[25] = Math.tanh(Math.log1p(raw[25]));

  // ── self-gating: gain from graph size × modularity-above-null contrast ──
  const sizeGate = Math.min(1, Math.max(0, (N - MIN_NODES) / 24));
  const modGate = Math.min(1, Math.max(0, (Q - 0.15) / 0.45)); // Q≲0.15 ≈ degree-null → gate off
  const gain = sizeGate * modGate;
  if (gain < 1e-6) return out;

  // mean-center + L2-normalize the fingerprint, scale by gain (L7/L8 convention)
  let mean = 0; for (let k = 0; k < raw.length; k++) mean += raw[k]; mean /= raw.length;
  let s = 0; const v = new Float64Array(raw.length);
  for (let k = 0; k < raw.length; k++) { v[k] = raw[k] - mean; s += v[k] * v[k]; }
  const norm = Math.sqrt(s); if (norm < 1e-9) return out;
  for (let k = 0; k < raw.length && k < DIM_TARGET; k++) out[k] = (v[k] / norm) * gain;
  return out;
}

/** The measured community gain of an input in [0,1] — how much relational structure it has above the degree null. */
function relationalGain(input) {
  if (typeof input !== 'string' || input.length < 8) return 0;
  const g = _graph(input); if (!g) return 0;
  const Q = _modularity(g, _labelProp(g));
  const sizeGate = Math.min(1, Math.max(0, (g.N - MIN_NODES) / 24));
  const modGate = Math.min(1, Math.max(0, (Q - 0.15) / 0.45));
  return sizeGate * modGate;
}

/** Raw modularity Q of the input's co-occurrence graph (ungated) — >0 means community above the degree null. */
function communityQ(input) {
  if (typeof input !== 'string' || input.length < 8) return 0;
  const g = _graph(input); if (!g) return 0;
  return _modularity(g, _labelProp(g));
}

module.exports = { DIM: DIM_TARGET, toRelationalWaveform, relationalGain, communityQ };
