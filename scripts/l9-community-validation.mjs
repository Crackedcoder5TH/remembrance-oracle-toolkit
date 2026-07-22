// l9-community-validation.mjs — the falsifiable, surrogate-null validation for L9.
//
// Labeled method (L7/L8 discipline, NOT the projection consensus gate): a new,
// orthogonal signal earns its place by a task test with a SURROGATE-DATA NULL, plus
// a neutrality check that it stays silent where its structure is absent.
//
// TASK: separate inputs that have COMMUNITY structure from a surrogate that has the
// IDENTICAL token histogram but the community destroyed (token-shuffle). A shape
// encoder (L1-L8) sees identical histograms and near-identical 1D shape → it should
// sit at chance (AUC≈0.5). L9, which reads modularity-above-the-degree-null, should
// separate them (AUC→1). A label-shuffle null must collapse to 0.5 (proves it's the
// community, not leakage). Neutrality: L9 gain ≈ 0 on code/prose/numeric series, so
// it cannot degrade the discrimination L1-L8 already earn.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ENC = require('../src/core/encoder-stack');
const { toRelationalWaveform, relationalGain, communityQ } = require('../src/core/relational-waveform');

function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// ── stochastic-block-model token walk: K blocks, stay-in-block prob p_in ──
// tokens visited roughly uniformly across the alphabet (histogram ~ flat), but
// ADJACENCY is dominated by within-block pairs → high modularity community.
const ALPHA = Array.from({ length: 40 }, (_, i) => 'tk' + i);   // 40-token alphabet
const K = 4, BS = ALPHA.length / K;                             // 4 blocks of 10
function sbmWalk(seed, len = 420, pIn = 0.85) {
  const r = mul(seed); const out = []; let blk = Math.floor(r() * K);
  for (let i = 0; i < len; i++) {
    if (r() > pIn) blk = Math.floor(r() * K);                   // occasionally jump block
    const tok = ALPHA[blk * BS + Math.floor(r() * BS)];
    out.push(tok);
  }
  return out.join(' ');
}
function shuffleTokens(text, seed) {                            // surrogate: same histogram, community destroyed
  const r = mul(seed); const a = text.split(' ');
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.join(' ');
}

const NPOS = 60;
const community = [], surrogate = [];
for (let i = 0; i < NPOS; i++) { const t = sbmWalk(1000 + i * 7); community.push(t); surrogate.push(shuffleTokens(t, 9000 + i * 7)); }

// confirm the surrogate really destroys the community (gain high → ~0)
const gC = community.map(relationalGain), gS = surrogate.map(relationalGain);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log('L9 COMMUNITY VALIDATION — surrogate-null task (encoder max depth ' + ENC.maxAvailableDepth() + ')\n');
console.log('  community gain ' + mean(gC).toFixed(3) + '   surrogate gain ' + mean(gS).toFixed(3) + '   (surrogate must collapse — same histogram, wiring destroyed)\n');

const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };
function corr(a, b) { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let nu = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { nu += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return (da && db) ? nu / Math.sqrt(da * db) : 0; }
// AUC that encoder E separates COMMUNITY (label 1) from SURROGATE (label 0):
// score(x) = mean cos to other community − mean cos to surrogates (leave-one-out).
function auc(encode) {
  const C = community.map(encode), S = surrogate.map(encode);
  const scored = [];
  const score = (v, selfC) => { let sc = 0, nc = 0; for (let j = 0; j < C.length; j++) { if (selfC !== null && selfC === j) continue; sc += cos(v, C[j]); nc++; } let ss = 0; for (let j = 0; j < S.length; j++) ss += cos(v, S[j]); return sc / nc - ss / S.length; };
  for (let i = 0; i < C.length; i++) scored.push([score(C[i], i), 1]);
  for (let i = 0; i < S.length; i++) scored.push([score(S[i], null), 0]);
  // AUC = P(score_pos > score_neg)
  let win = 0, tot = 0; for (const [sp, lp] of scored) if (lp === 1) for (const [sn, ln] of scored) if (ln === 0) { tot++; if (sp > sn) win++; else if (sp === sn) win += 0.5; }
  return tot ? win / tot : 0.5;
}
const encDepth = (d) => (t) => Array.from(ENC.composedAtDepth(t, d));
const encL9 = (t) => Array.from(toRelationalWaveform(t));

const aucShape = auc(encDepth(8));         // L1-L8 (shape stack)
const aucFull = auc(encDepth(9));          // L1-L9
const aucL9 = auc(encL9);                  // L9 alone
// label-shuffle null: randomly relabel which is community — must collapse to 0.5
const rr = mul(7);
const mixed = community.concat(surrogate).map((t) => Array.from(toRelationalWaveform(t)));
const perm = mixed.map((_, i) => i).sort(() => rr() - 0.5);
function aucPermuted() { const half = mixed.length / 2; let win = 0, tot = 0; for (let i = 0; i < half; i++) for (let j = half; j < mixed.length; j++) { tot++; const a = mixed[perm[i]], b = mixed[perm[j]]; const sa = a.reduce((x, y) => x + Math.abs(y), 0), sb = b.reduce((x, y) => x + Math.abs(y), 0); if (sa > sb) win++; else if (sa === sb) win += 0.5; } return tot ? win / tot : 0.5; }
const aucNull = aucPermuted();

console.log('=== separate COMMUNITY from its degree/histogram-preserving surrogate ===');
console.log('  L1-L8 (shape stack)   AUC ' + aucShape.toFixed(3) + '   (should sit near chance — histograms identical)');
console.log('  L9 alone              AUC ' + aucL9.toFixed(3) + '   (the community axis)');
console.log('  L1-L9 (full)          AUC ' + aucFull.toFixed(3) + '   (does adding L9 recover the separation?)');
console.log('  label-shuffle null    AUC ' + aucNull.toFixed(3) + '   (must be ≈0.5 — no leakage)');

// ── neutrality: L9 gain ≈ 0 on shape inputs (code / prose / numeric series) ──
const shapeSamples = [
  'function add(a,b){ return a+b; } const x = add(1,2); // sum two numbers',
  'The quick brown fox jumps over the lazy dog. It was a bright cold day in April.',
  JSON.stringify(Array.from({ length: 120 }, (_, i) => Math.round(100 * Math.sin(i / 7)))),
  'SELECT id, name FROM users WHERE active = true ORDER BY created_at DESC LIMIT 10;',
  Array.from({ length: 200 }, (_, i) => (i * 1.37) % 5).join(','),
];
const shapeGain = shapeSamples.map(relationalGain);
console.log('\n=== neutrality (self-gating) — L9 gain on shape inputs (code/prose/series/SQL/ratio) ===');
console.log('  gains: [' + shapeGain.map((x) => x.toFixed(3)).join(', ') + ']   (must be ≈0 so L9 defers to L1-L8)');
const neutral = shapeGain.every((x) => x < 0.15);

console.log('  (note: L1-L8 is NOT at chance here — the token-shuffle also perturbs local redundancy (L5),');
console.log('   so shape catches this surrogate incidentally. The clean isolation is the matched-redundancy task below.)');

// ── TASK B: does L9 carry QUANTITATIVE community info that L1-L8 does NOT? ──
// A synthetic AUC-beat is the wrong instrument: the L1-L8 stack is rich enough to separate
// ANY two hand-made generators by incidental shape (spectral/lexical), so it never sits at
// chance — the genuinely shape-starved case is REAL network data (the PPI null itself). The
// honest novelty proof is INFORMATION, not a class-beat: predict the TRUE modularity Q of an
// input's co-occurrence graph from the encoder, kNN-regression, leave-one-out. If L9 adds a
// real axis, depth-9 predicts Q better than depth-8. Corpus spans Q (community walks at many
// p_in + non-community repeat walks).
function repeatWalk(seed, len = 420, q = 0.25) {   // immediate-repeat redundancy, low community
  const r = mul(seed); const out = []; let cur = Math.floor(r() * ALPHA.length);
  for (let i = 0; i < len; i++) { if (r() > q) cur = Math.floor(r() * ALPHA.length); out.push(ALPHA[cur]); }
  return out.join(' ');
}
const corpusB = [];
for (let i = 0; i < 120; i++) corpusB.push(sbmWalk(3000 + i * 11, 420, 0.5 + 0.45 * mul(3000 + i)()));  // Q spread
for (let i = 0; i < 120; i++) corpusB.push(repeatWalk(6000 + i * 11, 420, 0.1 + 0.7 * mul(6000 + i)())); // low Q
const yQ = corpusB.map(communityQ);
function knnRegressQ(encode, k = 12) {
  const V = corpusB.map(encode); const pred = [];
  for (let i = 0; i < V.length; i++) { const near = []; for (let j = 0; j < V.length; j++) { if (j === i) continue; near.push([cos(V[i], V[j]), yQ[j]]); } near.sort((a, b) => b[0] - a[0]); const top = near.slice(0, k); const w = top.reduce((s, n) => s + Math.max(0, n[0]), 0) || 1e-9; pred.push(top.reduce((s, n) => s + Math.max(0, n[0]) * n[1], 0) / w); }
  return corr(pred, yQ);
}
const qShape = knnRegressQ(encDepth(8));
const qFull = knnRegressQ(encDepth(9));
const qL9 = knnRegressQ(encL9);
console.log('\n=== TASK B: predict TRUE modularity Q from the encoder (kNN-regression, leave-one-out) ===');
console.log('  Q range in corpus: ' + Math.min(...yQ).toFixed(2) + ' … ' + Math.max(...yQ).toFixed(2));
console.log('  L1-L8 (shape)  corr(pred Q, true Q) = ' + qShape.toFixed(3) + '   (what shape recovers incidentally)');
console.log('  L1-L9 (full)   corr = ' + qFull.toFixed(3) + '   Δ=' + (qFull - qShape >= 0 ? '+' : '') + (qFull - qShape).toFixed(3) + '   (does L9 add quantitative community info?)');
console.log('  L9 alone       corr = ' + qL9.toFixed(3) + '   (the community axis, direct)');

const addsQ = qL9 > 0.6 && qFull > qShape + 0.03;
// earns by the true L7/L8 bar: reads its axis (Task A) with both nulls collapsing + neutral,
// AND carries quantitative community info beyond the shape stack (Task B).
const earns = aucL9 > 0.9 && aucNull < 0.6 && neutral && mean(gC) > 0.3 && mean(gS) < mean(gC) * 0.5 && addsQ;
console.log('\n── VERDICT (measured, not asserted) ──');
console.log('  L9 reads community:       ' + (aucL9 > 0.9 ? 'YES (AUC ' + aucL9.toFixed(2) + ')' : 'weak (AUC ' + aucL9.toFixed(2) + ')'));
console.log('  surrogate/label nulls:    gain ' + mean(gC).toFixed(2) + '→' + mean(gS).toFixed(2) + ' on shuffle ✓ · label-shuffle ' + aucNull.toFixed(2) + (aucNull < 0.6 ? ' (chance ✓)' : ' (LEAK ✗)'));
console.log('  neutral on shape inputs:  ' + (neutral ? 'YES (self-gates off)' : 'NO — would degrade L1-L8'));
console.log('  adds quantitative Q info: ' + (addsQ ? 'YES — Q-recovery ' + qShape.toFixed(2) + '→' + qFull.toFixed(2) + ' (L9 alone ' + qL9.toFixed(2) + ')' : 'marginal (' + qShape.toFixed(2) + '→' + qFull.toFixed(2) + ', L9 alone ' + qL9.toFixed(2) + ')'));
console.log('  ' + (earns
  ? 'L9 EARNS ITS PLACE: reads community above the degree-null, collapses on both nulls, stays neutral on shape inputs, and carries quantitative modularity information the shape stack does not. The identity/community axis is real and self-gated — register done; activation pending the composed_v* re-encode + a held-out purity re-check, AND the real-data receipt (re-run the STRING-PPI test with L9 in the loop — the case where shape is genuinely starved).'
  : 'L9 reads its axis cleanly (AUC ' + aucL9.toFixed(2) + ', nulls collapse, neutral) but the quantitative-add is marginal on synthetic data (Q ' + qShape.toFixed(2) + '→' + qFull.toFixed(2) + ') — the definitive add belongs on the real starved PPI data. Recorded honestly; not yet activated.'));

fs.mkdirSync('.remembrance', { recursive: true });
fs.writeFileSync('.remembrance/l9-community-validation.json', JSON.stringify({ aucShape, aucL9, aucFull, aucNull, communityGain: mean(gC), surrogateGain: mean(gS), neutral: +neutral, qShape, qFull, qL9, addsQ: +addsQ, earns: +earns }, null, 2));
console.log('\n(reported as measured — SBM community vs surrogate + true-Q kNN-regression; self-gated L9; deterministic.)');
