#!/usr/bin/env node
'use strict';

/**
 * @oracle-infrastructure — read-only web reader for the goggles; fetches a
 * URL, reads it THROUGH the substrate, contributes the reading to the field.
 *
 * goggle-web — the goggles applied to data on the open web.
 *
 * Browsing was the last blind spot: the goggles fire on Edit/Write/Bash, so
 * a page fetched during research was never read, compressed, scored, or
 * witnessed — measured empirically (field updateCount unchanged across a
 * WebFetch). This closes it. The reading is the SAME instrument used on
 * files: canonical fractal encoding, the Void compressor's own
 * avg_coherence, Shannon entropy for the entropic axis, and a field
 * contribution so the substrate remembers what it saw.
 *
 * Usage:
 *   node scripts/goggle-web.js <url> [--window N] [--no-contribute] [--json]
 *   (via the one surface:  goggles --do browse <url>)
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const VOID = process.env.VOID_ROOT || path.resolve(__dirname, '..', '..', 'Void-Data-Compressor');
const argv = process.argv.slice(2);
const url = argv.find((a) => !a.startsWith('--'));
const asJson = argv.includes('--json');
const noContribute = argv.includes('--no-contribute');
const wIdx = argv.indexOf('--window');
const WIN = wIdx >= 0 ? Math.max(64, parseInt(argv[wIdx + 1], 10) || 512) : 512;

if (!url) {
  console.error('usage: goggle-web.js <url> [--window N] [--no-contribute] [--json]');
  process.exit(2);
}

// ── fetch (curl: follows redirects, honours the environment's proxy) ──
let body;
try {
  body = execFileSync('curl', ['-sS', '-L', '-m', '45', url], { maxBuffer: 1 << 28, encoding: 'utf8' });
} catch (e) {
  console.error('goggle-web: fetch failed — ' + (e.message || e));
  process.exit(1);
}
if (!body || body.length < 32) { console.error('goggle-web: empty/short response'); process.exit(1); }

// ── extract a signal: numeric series if the page has one, else the text ──
// STRICT: the WHOLE field must be a number. parseFloat is prefix-greedy —
// parseFloat('2015-09-08 11:39:00') === 2015, so a timestamp column reads as
// a constant series (entropy 0, coherency 1.0, ratio 36x — a spectacular
// false reading, caught on first run by the entropy tell). Also: a constant
// column is not a signal, so require real variance.
const STRICT_NUM = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
function numericSeries(text) {
  const lines = text.split('\n').slice(0, 20000);
  const cols = [];
  for (const ln of lines) {
    const parts = ln.split(/[,\t;]/);
    if (parts.length < 2) continue;
    for (let i = 0; i < parts.length; i++) {
      const f = parts[i].trim();
      if (!STRICT_NUM.test(f)) continue;
      const v = Number(f);
      if (Number.isFinite(v)) { (cols[i] = cols[i] || []).push(v); }
    }
  }
  let best = null;
  for (const c of cols) {
    if (!c || c.length < 64) continue;
    const mean = c.reduce((s, x) => s + x, 0) / c.length;
    const varc = c.reduce((s, x) => s + (x - mean) ** 2, 0) / c.length;
    if (varc <= 1e-12) continue;                    // constant column: not a signal
    if (!best || c.length > best.length) best = c;
  }
  if (best) return { kind: 'numeric-series', values: best };
  // JSON array of numbers?
  try {
    const j = JSON.parse(text);
    const flat = JSON.stringify(j).match(/-?\d+\.?\d*/g);
    if (flat && flat.length >= 64) return { kind: 'json-numbers', values: flat.map(Number).filter(Number.isFinite) };
  } catch (_) { /* not json */ }
  return { kind: 'text', values: null };
}

const sig = numericSeries(body);
const isText = sig.kind === 'text';
const series = isText
  ? Array.from(Buffer.from(body.slice(0, WIN * 4), 'utf8')).slice(0, WIN)
  : sig.values.slice(0, WIN);
if (series.length < 64) { console.error('goggle-web: not enough signal to read'); process.exit(1); }

// ── read THROUGH the substrate (Void compressor: coherency + ratio) ──
const py = `
import sys, json, contextlib, io
import numpy as np
sys.path.insert(0, ${JSON.stringify(VOID)})
req = json.load(sys.stdin)
v = np.asarray(req['series'], float)
mn, mx = v.min(), v.max()
b = np.clip(np.round((v - mn) / ((mx - mn) or 1e-9) * 255), 0, 255).astype(np.uint8)
c = np.bincount(b, minlength=256).astype(float)
p = c[c > 0] / c.sum()
H = float(-(p * np.log2(p)).sum())
with contextlib.redirect_stdout(io.StringIO()):
    from void_compressor_v5 import AdaptiveVoidCompressor
    comp = AdaptiveVoidCompressor(enable_learning=False)
    r = comp.compress(b.tobytes())
json.dump({'coherency': float(r['avg_coherence']), 'orig': int(r['original_size']),
           'comp': int(r['compressed_size']), 'method': str(r['method']),
           'entropy_bits': H, 'sealed': bool(r.get('void_seal'))}, sys.stdout)
`;
let read;
try {
  read = JSON.parse(execFileSync('python3', ['-c', py], {
    input: JSON.stringify({ series }), maxBuffer: 1 << 26, encoding: 'utf8',
  }));
} catch (e) {
  console.error('goggle-web: substrate read failed — ' + (e.stderr || e.message || e));
  process.exit(1);
}
const ratio = read.orig / read.comp;

// ── canonical encoder signature + nearest substrate neighbours ──
let resonance = null;
try {
  const { composedAtDepth, composedCosine } = require('../src/core/encoder-stack');
  const { VoidLibrary } = require('../src/core/void-library');
  const q = composedAtDepth(JSON.stringify(series.map((x) => +Number(x).toFixed(6))), 8);
  const lib = new VoidLibrary();
  if (lib.size() > 0 && lib._composed) {
    const scored = [];
    for (const [name, vec] of lib._composed) {
      if (vec.length !== q.length) continue;
      scored.push([composedCosine(q, vec), name]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    resonance = { top: scored.slice(0, 5).map(([s, n]) => ({ score: s, name: n })),
                  meanTop5: scored.slice(0, 5).reduce((s, x) => s + x[0], 0) / Math.max(1, Math.min(5, scored.length)) };
  }
} catch (_) { /* resonance optional */ }

// ── contribute to the field: the substrate REMEMBERS what it browsed ──
let contributed = false;
if (!noContribute) {
  try {
    require('../src/core/field-coupling').contribute({
      cost: 1.0, coherence: read.coherency,
      source: 'goggles:web:' + new URL(url).host,
    });
    contributed = true;
  } catch (_) { /* field optional */ }
}

const out = { url, signal: sig.kind, samples: series.length, ...read, ratio, resonance, contributed };
if (asJson) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }

const bar = (x, w = 22) => '█'.repeat(Math.max(0, Math.min(w, Math.round((x || 0) * w)))) + '·'.repeat(w - Math.max(0, Math.min(w, Math.round((x || 0) * w))));
console.log('\n' + '═'.repeat(64));
console.log('  GOGGLES · WEB   ' + url.slice(0, 44));
console.log('═'.repeat(64));
console.log('  signal        ' + sig.kind + ' · ' + series.length + ' samples');
console.log('  coherency     ' + bar(read.coherency) + ' ' + read.coherency.toFixed(4));
console.log('  compression   ' + ratio.toFixed(3) + 'x  (' + read.orig + ' B → ' + read.comp + ' B) · ' + read.method);
console.log('  entropy       ' + read.entropy_bits.toFixed(3) + ' bits/symbol');
if (resonance) {
  console.log('  resonance     ' + bar(resonance.meanTop5) + ' ' + resonance.meanTop5.toFixed(4) + ' (mean top-5 vs substrate)');
  console.log('  nearest in the substrate:');
  for (const m of resonance.top) console.log('     ' + m.score.toFixed(4) + '  ' + m.name);
}
console.log('  field         ' + (contributed ? 'contributed (source goggles:web:' + new URL(url).host + ')' : 'not contributed'));
console.log('═'.repeat(64) + '\n');
