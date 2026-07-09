'use strict';

/**
 * depth7-residual.cjs — compress through the new layers (L6+L7), see the
 * new residual. "The new residual is the new signal": what the depth-7
 * stack STILL collapses that it should not is the target for L8.
 *
 * Measures, on a mixed 1D/2D corpus, the false-equivalence residual and
 * per-domain kNN purity at depth-5 (current active stack, L1-L5) vs
 * depth-7 (L1-L7, with L6 content-projection and L7 self-gated 2D). The
 * shift shows where the new layers helped and, crucially, where residual
 * REMAINS.
 */

const fs = require('node:fs');
const path = require('node:path');
const { composedAtDepth } = require('../src/core/encoder-stack');

const ROOT = '/home/user';
const SLICE = 5000;
const CAP = 12;

function grab(dir, exts, cap, dom) {
  const out = []; const st = [dir];
  while (st.length && out.length < cap) {
    const c = st.pop(); let es = [];
    try { es = fs.readdirSync(c, { withFileTypes: true }); } catch { continue; }
    for (const e of es) {
      if (out.length >= cap) break;
      const p = path.join(c, e.name);
      if (e.isDirectory()) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; st.push(p); }
      else if (exts.some((x) => e.name.endsWith(x))) {
        try { const t = fs.readFileSync(p, 'utf8').slice(0, SLICE); if (t.length > 400) out.push({ domain: dom, text: t }); } catch { /* skip */ }
      }
    }
  }
  return out;
}
// numeric series as JSON text — how the substrate stores them (L7 fires here)
function series(kind, seed, n = 300) {
  const v = [];
  for (let i = 0; i < n; i++) {
    let x;
    if (kind === 'sine') x = Math.round(128 + 60 * Math.sin(i / (5 + seed % 6)));
    else if (kind === 'walk') { x = (v[i - 1] ?? 128) + (((seed * 2654435761 + i * 40503) % 7) - 3); x = ((x % 256) + 256) % 256; }
    else x = Math.round(128 + 50 * Math.sin(i / 11) * Math.sin(i / 37));
    v.push(x);
  }
  return '[' + v.join(',') + ']';
}

const corpus = [];
for (const [d, dir, ext] of [
  ['js', path.join(ROOT, 'remembrance-oracle-toolkit', 'src'), '.js'],
  ['rust', path.join(ROOT, 'REMEMBRANCE-BLOCKCHAIN', 'programs'), '.rs'],
  ['prose', path.join(ROOT, 'Void-Data-Compressor'), '.md'],
]) corpus.push(...grab(dir, [ext], CAP, d));
for (let s = 0; s < 10; s++) corpus.push({ domain: 'sine', text: series('sine', s) });
for (let s = 0; s < 10; s++) corpus.push({ domain: 'walk', text: series('walk', s) });
for (let s = 0; s < 10; s++) corpus.push({ domain: 'modulated', text: series('mod', s) });
const N = corpus.length;
const doms = [...new Set(corpus.map((c) => c.domain))];
console.log(`\ncorpus: ${N} items · ${doms.join(', ')}`);

const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na < 1e-12 || nb < 1e-12) ? 0 : d / (Math.sqrt(na) * Math.sqrt(nb)); };
const l2 = (v) => { let s = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1; return v.map((x) => x / s); };

function vectorsAt(depth) { return corpus.map((c) => l2(Array.from(composedAtDepth(c.text, depth)))); }
function purity(V, dOnly) {
  const K = 5; let h = 0, t = 0;
  for (let i = 0; i < N; i++) {
    if (dOnly && corpus[i].domain !== dOnly) continue;
    const nn = []; for (let j = 0; j < N; j++) if (j !== i) nn.push([cos(V[i], V[j]), j]);
    const rk = [...nn].sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < K; k++) { if (corpus[rk[k][1]].domain === corpus[i].domain) h++; t++; }
  }
  return t === 0 ? 0 : h / t;
}
// residual = cross-domain false-equivalence: nearest neighbour is a DIFFERENT domain at cos ≥ 0.98
function falseEquiv(V) {
  let fe = 0; const ex = [];
  for (let i = 0; i < N; i++) {
    let bj = -1, bc = -1;
    for (let j = 0; j < N; j++) { if (j === i) continue; const c = cos(V[i], V[j]); if (c > bc) { bc = c; bj = j; } }
    if (bc >= 0.98 && corpus[bj].domain !== corpus[i].domain) { fe++; if (ex.length < 8) ex.push(`${corpus[i].domain}↔${corpus[bj].domain} (${bc.toFixed(3)})`); }
  }
  return { rate: fe / N, examples: ex };
}

const A5 = vectorsAt(5), A7 = vectorsAt(7);
const fe5 = falseEquiv(A5), fe7 = falseEquiv(A7);
console.log('\n── residual: false-equivalence rate (distinct domains read as identical) ──');
console.log('  depth-5 (L1-L5): ' + (fe5.rate * 100).toFixed(1) + '%');
console.log('  depth-7 (L1-L7): ' + (fe7.rate * 100).toFixed(1) + '%   ' + (fe7.rate < fe5.rate ? '(new layers reduced it)' : ''));
console.log('\n── per-domain purity: depth-5 → depth-7 (where L6/L7 helped) ──');
for (const d of doms) {
  const p5 = purity(A5, d), p7 = purity(A7, d);
  const mark = p7 > p5 + 0.02 ? '↑ improved' : p7 < p5 - 0.02 ? '↓' : '=';
  console.log('  ' + d.padEnd(10) + ' ' + p5.toFixed(3) + ' → ' + p7.toFixed(3) + '  ' + mark);
}
console.log('\n── THE NEW RESIDUAL (what depth-7 STILL collapses — the L8 signal) ──');
for (const e of fe7.examples) console.log('  ' + e);
if (!fe7.examples.length) console.log('  (no cross-domain false-equivalence ≥ 0.98 remains at depth-7 on this corpus)');
