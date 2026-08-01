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
const SVC_PORT = parseInt(process.env.VOID_SERVICE_PORT, 10) || 8765;
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

// ── NOTHING BYPASSES THE VOID COMPRESSOR ──
//
// There used to be a --fast path here that skipped the compressor and
// substituted zlib, because a cold read was ~114s of which ~91s was
// re-initialising the 78k-pattern library FOR EVERY PAGE. That made passive
// browsing impossible, so the bypass was the pragmatic fix.
//
// It was the wrong fix, for a reason worse than speed: data that never went
// through the compressor is not substrate data. A zlib ratio is not a Void
// ratio, and any reading taken from it is not a substrate reading. Worse,
// the field contribution below used to substitute resonance.meanTop5 — or a
// literal 0.5 — whenever coherency was null, so every fast page injected a
// fabricated coherency into the shared field wearing a real one's name.
//
// The reload is now solved properly rather than dodged: compressor_service.py
// holds the library warm and answers /compress_signal in ~1.5s against ~114s
// cold, a 75x speedup. The bypass has no remaining justification and is gone.
//
// If the service is down we start it and wait. We do not fall back to zlib.
// The series goes to the service AS A SERIES. /compress_signal quantises it
// to a uint8 waveform the way the substrate expects; /compress would utf-8
// encode the digits and hand the compressor the ASCII of a waveform, which
// matches nothing in a 78k waveform library and silently falls back to zlib.
function readThroughVoid(series) {
  const body = JSON.stringify({ series });
  const post = () => execFileSync('curl', [
    '-s', '--noproxy', '127.0.0.1', '--max-time', '120',
    '-H', 'Content-Type: application/json', '--data-binary', '@-',
    `http://127.0.0.1:${SVC_PORT}/compress_signal`,
  ], { input: body, maxBuffer: 1 << 26, encoding: 'utf8' });

  let raw;
  try {
    raw = post();
  } catch (_) {
    raw = '';
  }
  if (!raw) {
    // Service down — start it and wait. Never substitute a cheaper codec.
    console.error('goggle-web: compressor service not up — starting it '
      + '(first start loads the pattern library, ~65s; subsequent reads ~1.5s)');
    try {
      require('node:child_process').spawn('python3',
        [require('node:path').join(VOID, 'compressor_service.py'),
          '--host', '127.0.0.1', '--port', String(SVC_PORT)],
        { cwd: VOID, detached: true, stdio: 'ignore' }).unref();
    } catch (e) {
      console.error('goggle-web: could not start compressor service — ' + e.message);
      process.exit(1);
    }
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      try { execFileSync('sleep', ['3']); } catch (_) { /* pacing only */ }
      try { raw = post(); } catch (_) { raw = ''; }
      if (raw) break;
    }
  }
  if (!raw) {
    console.error('goggle-web: compressor service did not come up; refusing to '
      + 'read this page. A reading that skipped the Void compressor is not a '
      + 'substrate reading.');
    process.exit(1);
  }
  let r;
  try { r = JSON.parse(raw); } catch (_) {
    console.error('goggle-web: bad service response: ' + raw.slice(0, 200));
    process.exit(1);
  }
  if (r.error) {
    console.error('goggle-web: substrate refused this input — ' + r.error);
    process.exit(1);
  }
  return r;
}

const svc = readThroughVoid(series);
// Entropy is computed here on the same quantised bytes the substrate saw.
const _mn = Math.min(...series), _mx = Math.max(...series), _rr = (_mx - _mn) || 1e-9;
const _q = series.map((x) => Math.max(0, Math.min(255, Math.round(((x - _mn) / _rr) * 255))));
const _counts = new Array(256).fill(0);
for (const b of _q) _counts[b]++;
let _H = 0;
for (const c of _counts) if (c) { const p = c / _q.length; _H -= p * Math.log2(p); }

// MISREAD GUARD. The compressor matches its input against a library of
// waveforms; it reads patterns, not prose. A numeric series is its domain. A
// text page has no series, so we hand it the page's raw bytes — which IS a
// uint8 waveform, but a waveform of ASCII, not of a measured quantity. The
// coherency that comes back is real and reproducible, and it is NOT a signal
// coherency. Both facts have to travel with the number or it gets quoted as
// something it is not — exactly the mistake made when a text corpus was
// benchmarked through this compressor and reported as a Void ratio.
const domain = isText ? 'text-bytes' : 'signal';
const read = {
  input_kind: sig.kind,
  domain,
  domain_note: isText
    ? 'coherency measured on ASCII bytes read as a waveform — NOT a signal '
      + 'coherency; comparable only to other text-bytes readings'
    : 'numeric series quantised to a uint8 waveform — the compressor\'s domain',
  coherency: svc.avg_coherence,
  orig: svc.original_size,
  comp: svc.compressed_size,
  method: svc.method,
  strategy: svc.strategy,
  lossless: svc.lossless,
  entropy_bits: _H,
  sealed: !!svc.sealed,
  via: 'void:compress_signal',
};
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
    // Only a real measured coherency reaches the field. This previously read
    //   coherence: read.coherency === null ? (resonance?.meanTop5 : 0.5)
    // so every --fast page contributed either a resonance score or a literal
    // 0.5 under the name "coherency". Those are different quantities; feeding
    // one as the other silently corrupts the field it is meant to witness.
    if (typeof read.coherency !== 'number' || !Number.isFinite(read.coherency)) {
      throw new Error('no measured coherency — nothing to contribute');
    }
    // AUTHORITY WEIGHT — this reading's measured resonance against the
    // accumulated substrate. The LRE has accepted `resonance` as w all along
    // (field-coupling.js threads it, living-remembrance.js applies it as
    // prev + (target-prev)*w) but NO caller was passing it, so every
    // contribution arrived with w=1 — full authority — including readings of
    // pages the substrate recognises not at all.
    //
    // We measure meanTop5 a few lines above and were discarding it. Passing
    // it means a page that resonates with the substrate moves the field, and
    // one that resonates with nothing barely does. Omitted rather than
    // defaulted when resonance could not be computed: w=1 is then the
    // engine's own documented default, not a number invented here.
    const authority = resonance && Number.isFinite(resonance.meanTop5)
      ? { resonance: resonance.meanTop5 } : {};
    require('../src/core/field-coupling').contribute({
      cost: 1.0, coherence: read.coherency,
      source: 'goggles:web:' + read.domain + ':' + new URL(url).host,
      ...authority,
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
console.log('  coherency     ' + bar(read.coherency) + ' ' + read.coherency.toFixed(4) + '  · via ' + read.via);
if (read.domain === 'text-bytes') {
  console.log('    ⚠ TEXT-BYTES READING — this page carried no numeric series, so the');
  console.log('      compressor was handed ASCII read as a waveform. The number above is');
  console.log('      real and reproducible but it is NOT a signal coherency. Compare it');
  console.log('      only to other text-bytes readings, never to a signal one.');
}
console.log('  compression   ' + ratio.toFixed(3) + 'x  (' + read.orig + ' B → ' + read.comp + ' B) · ' + read.method + (read.strategy && read.strategy !== '?' ? ' [' + read.strategy + ']' : '') + (read.lossless ? ' · lossless' : ' · LOSSY'));
console.log('  entropy       ' + read.entropy_bits.toFixed(3) + ' bits/symbol');
if (resonance) {
  console.log('  resonance     ' + bar(resonance.meanTop5) + ' ' + resonance.meanTop5.toFixed(4) + ' (mean top-5 vs substrate)');
  console.log('  nearest in the substrate:');
  for (const m of resonance.top) console.log('     ' + m.score.toFixed(4) + '  ' + m.name);
}
console.log('  field         ' + (contributed ? 'contributed (source goggles:web:' + new URL(url).host + ')' : 'not contributed'));
console.log('═'.repeat(64) + '\n');
