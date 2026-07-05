'use strict';
// Held-out validation of the field-gated composition vs baselines.
// v1 note: the field has no accumulated encoder:L* reliability yet, so
// the gate runs on salience + neutral reliability — the deterministic
// per-input half of the design. Reliability learning needs live usage.
const fs = require('fs');
const path = require('path');
const oracle = '/home/user/remembrance-oracle-toolkit';
const { composedAtDepth } = require(oracle + '/src/core/encoder-stack.js');
const { fieldGatedSimilarity } = require(oracle + '/src/core/field-gated-compose.js');

const ROOT = '/home/user';
const SLICE = 2800, CAP = 18;
function grabFiles(dir, exts, cap, domain) {
  const out = []; const stack = [dir];
  while (stack.length && out.length < cap) {
    const cur = stack.pop();
    let entries = []; try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      if (out.length >= cap) break;
      const p = path.join(cur, e.name);
      if (e.isDirectory()) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; stack.push(p); }
      else if (exts.some(x => e.name.endsWith(x))) {
        try { const t = fs.readFileSync(p, 'utf8').slice(0, SLICE);
          if (t.length > 400) out.push({ id: domain + '/' + e.name, domain, text: t });
        } catch (_) {}
      }
    }
  }
  return out;
}
function synthSeries(kind, seed, n = 220) {
  const v = [];
  for (let i = 0; i < n; i++) {
    let x;
    if (kind === 'osc') x = 50 + 20 * Math.sin(i / (2 + seed % 5)) + 5 * Math.sin(i / 1.7);
    else if (kind === 'acc') x = Math.pow(1.02 + (seed % 5) * 0.01, i);
    else x = (v[i - 1] ?? 100) + (((seed * 2654435761 + i * 40503) % 21) - 10) / 3;
    v.push(+x.toFixed(4));
  }
  return JSON.stringify(v).slice(0, SLICE);
}
const corpus = [];
corpus.push(...grabFiles(path.join(ROOT,'remembrance-oracle-toolkit','src'), ['.js'], CAP, 'js-code'));
corpus.push(...grabFiles(path.join(ROOT,'claw-code'), ['.rs'], CAP, 'rust-code'));
corpus.push(...grabFiles(path.join(ROOT,'claw-code'), ['.py'], CAP, 'py-code'));
corpus.push(...grabFiles(path.join(ROOT,'REMEMBRANCE-Interface','src'), ['.tsx','.ts'], CAP, 'ts-code'));
corpus.push(...grabFiles(path.join(ROOT,'Void-Data-Compressor'), ['.md'], CAP, 'prose-md'));
corpus.push(...grabFiles(path.join(ROOT,'remembrance-oracle-toolkit'), ['.json'], 12, 'json-data'));
for (let s = 0; s < 6; s++) corpus.push({ id:`ts-osc/${s}`, domain:'ts-osc', text: synthSeries('osc', s) });
for (let s = 0; s < 6; s++) corpus.push({ id:`ts-acc/${s}`, domain:'ts-acc', text: synthSeries('acc', s) });
for (let s = 0; s < 6; s++) corpus.push({ id:`ts-walk/${s}`, domain:'ts-walk', text: synthSeries('walk', s) });
const N = corpus.length;
const vecs = corpus.map(c => composedAtDepth(c.text, 5));

// Field states to test the gate under — explicit, so fully deterministic.
const FIELD_NEUTRAL = { coherence: 0.5, updateCount: 1, sources: {} };
const FIELD_CONFIDENT = { coherence: 0.9, updateCount: 1, sources: {} };
// A field that has "learned" the inverted-ladder lesson (simulating what
// contributeLayerAgreement would accumulate on a text-heavy workload):
const FIELD_LEARNED = { coherence: 0.7, updateCount: 100, sources: {
  'encoder:L1': { count: 50, lastCoherence: 0.85 },
  'encoder:L2': { count: 50, lastCoherence: 0.80 },
  'encoder:L3': { count: 50, lastCoherence: 0.25 },
  'encoder:L4': { count: 50, lastCoherence: 0.20 },
  'encoder:L5': { count: 50, lastCoherence: 0.55 },
} };

const K = 10;
function purity(simFn, indices) {
  let s = 0;
  for (const i of indices) {
    const scored = [];
    for (const j of indices) { if (j !== i) scored.push([j, simFn(i, j)]); }
    scored.sort((a, b) => b[1] - a[1]);
    let same = 0;
    for (const [j] of scored.slice(0, K)) if (corpus[j].domain === corpus[i].domain) same++;
    s += same / K;
  }
  return s / indices.length;
}
const test = corpus.map((_, i) => i).filter(i => i % 2 === 1);  // same held-out half as before

// Baseline: plain cosine over full 145-D (equal-weight concat).
function plainCos(i, j) {
  const a = vecs[i], b = vecs[j];
  let d = 0, na = 0, nb = 0;
  for (let k = 0; k < a.length; k++) { d += a[k]*b[k]; na += a[k]*a[k]; nb += b[k]*b[k]; }
  return d / Math.sqrt(na * nb);
}
const gated = st => (i, j) => fieldGatedSimilarity(vecs[i], vecs[j], { fieldState: st }).score;

console.log('held-out test half, kNN domain purity (K=10):');
console.log(`  equal-weight concat (static)        ${purity(plainCos, test).toFixed(3)}`);
console.log(`  field-gated · neutral field         ${purity(gated(FIELD_NEUTRAL), test).toFixed(3)}`);
console.log(`  field-gated · confident field       ${purity(gated(FIELD_CONFIDENT), test).toFixed(3)}`);
console.log(`  field-gated · learned reliabilities ${purity(gated(FIELD_LEARNED), test).toFixed(3)}`);
console.log(`  (prior static-learned grid weights:  0.468 · NCD reference: 0.545)`);
