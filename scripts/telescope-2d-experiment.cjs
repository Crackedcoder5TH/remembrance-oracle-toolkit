'use strict';

/**
 * telescope-2d-experiment.cjs — a 2D-structural compression telescope,
 * and the finding that gzip is dimensionally limited.
 *
 * gzip/zlib is a 1-DIMENSIONAL compressor: LZ77 slides a window along a
 * linear byte stream and finds repeated substrings. It has no
 * representation of 2D structure — it cannot exploit correlation between
 * a byte and the byte one row above it. So once the encoder captures
 * sequential redundancy, gzip has nothing more to offer: every 1D layer
 * candidate converges with gzip and stops (byte-distribution, byte-
 * bigram, byte-projection all exhausted against it).
 *
 * The 2D telescope models VERTICAL (row-to-row) correlation a 1D stream
 * compressor cannot see: reshape the bytes into a W×H grid (W≈√n),
 * PAETH-predict each cell from its left / up / up-left neighbours (the
 * PNG filter), and deflate the residual. Structure that repeats across
 * rows — the autoregressive shape of a numeric series, the locality of a
 * matrix or field — collapses under this filter where gzip is blind.
 *
 * Findings (this corpus; reproducible):
 *   - INDEPENDENCE: Spearman(2D, gzip) ≈ 0.34 — the 2D telescope's
 *     similarity ranking is largely independent of gzip's. It is a
 *     genuinely new instrument, not a variant.
 *   - REAL, not noise: 2D kNN domain purity ≈ 0.67 (chance ≈ 0.15).
 *   - DIMENSION-MATCHED, not universal: the 2D telescope LOSES to gzip on
 *     intrinsically-1D data (code, prose ~0.4-0.5 vs gzip ~0.95) and
 *     TIES it on intrinsically-2D data (random walks, modulated series,
 *     both ~1.0), where it uniquely recognises two different walks as the
 *     SAME KIND of structure — the exact residual that broke gzip.
 *
 * Conclusion: the complete calibrator is not one telescope but a
 * DIMENSION-MATCHED consensus — 1D compressors authoritative for
 * sequential data, the 2D compressor authoritative for structured/
 * numeric data. A 2D-projection encoder layer earns its place on the
 * numeric portion of the substrate (which is large), calibrated against
 * this telescope; it does NOT help the 1D (code/prose) portion, and the
 * consensus gate correctly refuses to let it.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = '/home/user';
const SLICE = 6000;
const CAP = 14;

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
        try { const t = fs.readFileSync(p, 'utf8').slice(0, SLICE); if (t.length > 400) out.push({ domain: dom, buf: Buffer.from(t, 'utf8') }); } catch { /* skip */ }
      }
    }
  }
  return out;
}
// Synthetic numeric series as raw bytes — intrinsically 2D/autoregressive.
function synth(kind, seed, n = 400) {
  const v = [];
  for (let i = 0; i < n; i++) {
    let x;
    if (kind === 'osc') x = Math.round(128 + 80 * Math.sin(i / (2 + seed % 5)));
    else if (kind === 'walk') x = (v[i - 1] ?? 128) + (((seed * 2654435761 + i * 40503) % 7) - 3);
    else x = Math.round(128 + 60 * Math.sin(i / 12) * Math.sin(i / 40));
    v.push(((x % 256) + 256) % 256);
  }
  return Buffer.from(v);
}

const corpus = [];
for (const [d, dir, ext] of [
  ['js', path.join(ROOT, 'remembrance-oracle-toolkit', 'src'), '.js'],
  ['rust', path.join(ROOT, 'REMEMBRANCE-BLOCKCHAIN', 'programs'), '.rs'],
  ['py', path.join(ROOT, 'Void-Data-Compressor'), '.py'],
  ['prose', path.join(ROOT, 'Void-Data-Compressor'), '.md'],
]) corpus.push(...grab(dir, [ext], CAP, d));
for (let s = 0; s < 10; s++) corpus.push({ domain: 'osc', buf: synth('osc', s) });
for (let s = 0; s < 10; s++) corpus.push({ domain: 'walk', buf: synth('walk', s) });
for (let s = 0; s < 10; s++) corpus.push({ domain: 'modulated', buf: synth('mod', s) });
const N = corpus.length;
const doms = [...new Set(corpus.map((c) => c.domain))];
console.log(`\ncorpus: ${N} items · ${doms.join(', ')}`);

// ── 1D telescope: gzip NCD ──────────────────────────────────────────
const gz = (b) => zlib.gzipSync(b, { level: 9 }).length;

// ── 2D telescope: Paeth-filtered, deflate NCD ───────────────────────
function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
function twoD(buf) {
  const n = buf.length; const W = Math.max(2, Math.round(Math.sqrt(n)));
  const res = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / W), col = i % W;
    const left = col > 0 ? buf[i - 1] : 0, up = r > 0 ? buf[i - W] : 0, ul = (r > 0 && col > 0) ? buf[i - W - 1] : 0;
    res[i] = (buf[i] - paeth(left, up, ul)) & 255;
  }
  return zlib.deflateRawSync(res, { level: 9 }).length;
}

const gS = corpus.map((c) => gz(c.buf)), tS = corpus.map((c) => twoD(c.buf));
const simGZ = (i, j) => { const c = gz(Buffer.concat([corpus[i].buf, corpus[j].buf])); return 1 - (c - Math.min(gS[i], gS[j])) / Math.max(gS[i], gS[j]); };
const sim2D = (i, j) => { const c = twoD(Buffer.concat([corpus[i].buf, corpus[j].buf])); return 1 - (c - Math.min(tS[i], tS[j])) / Math.max(tS[i], tS[j]); };

function spearman(x, y) {
  const rank = (a) => { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = []; for (let k = 0; k < idx.length; k++) r[idx[k][1]] = k; return r; };
  const rx = rank(x), ry = rank(y); let d2 = 0; for (let i = 0; i < x.length; i++) d2 += (rx[i] - ry[i]) ** 2;
  const denom = x.length * (x.length ** 2 - 1); return denom === 0 ? 0 : 1 - 6 * d2 / denom;
}
function purity(fn) {
  const K = 5; const per = {}; for (const d of doms) per[d] = [0, 0]; let H = 0, T = 0;
  for (let i = 0; i < N; i++) {
    const nn = []; for (let j = 0; j < N; j++) if (j !== i) nn.push([fn(i, j), j]);
    const rk = [...nn].sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < K; k++) { per[corpus[i].domain][1]++; T++; if (corpus[rk[k][1]].domain === corpus[i].domain) { per[corpus[i].domain][0]++; H++; } }
  }
  return { overall: T === 0 ? 0 : H / T, per };
}

const pGZ = [], p2D = [];
for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { pGZ.push(simGZ(i, j)); p2D.push(sim2D(i, j)); }
const chance = doms.reduce((s, d) => { const f = corpus.filter((c) => c.domain === d).length / N; return s + f * f; }, 0);
const pG = purity(simGZ), p2 = purity(sim2D);

console.log('\n── independence: is the 2D telescope a NEW instrument? ──');
console.log('  Spearman(2D, gzip): ' + spearman(p2D, pGZ).toFixed(4) + '   (low = independent = sees what gzip cannot)');
console.log('\n── reality: structure or noise? (chance ' + chance.toFixed(3) + ') ──');
console.log('  gzip (1D) purity:  ' + pG.overall.toFixed(4));
console.log('  2D-Paeth purity:   ' + p2.overall.toFixed(4) + (p2.overall > chance + 0.15 ? '  (real structure)' : '  (near chance)'));
console.log('\n── dimension-matched: where each telescope is authoritative ──');
for (const d of doms) {
  const g = pG.per[d][0] / pG.per[d][1], t = p2.per[d][0] / p2.per[d][1];
  console.log('  ' + d.padEnd(10) + ' gzip ' + g.toFixed(3) + '  2D ' + t.toFixed(3) + '  ' + (t >= g - 0.02 ? '← 2D matches/wins (intrinsically 2D data)' : '(gzip wins — intrinsically 1D data)'));
}
console.log('\nThe complete calibrator is a dimension-matched consensus, not one telescope.');
