#!/usr/bin/env node
'use strict';

/**
 * audit-reading-validity.js — does a reading measure the ARTIFACT, or your
 * encoding of it?
 *
 * The generic failure this catches: a function takes an array of numbers,
 * computes a statistic, and returns something in [0,1] that looks like a
 * measurement. It type-checks, it varies a little, it lands in a plausible
 * range — and it is about the representation rather than the thing.
 *
 * The substrate's ingest coherency was exactly this for its whole history.
 * seriesCoherence was applied to the 29-slot fractal vector, whose slots are
 * NAMED HETEROGENEOUS FEATURES (charge, valence, mass, spin, … structurality)
 * in whatever order the encoder lists them, with slot 7 a constant. It read
 * ~0.19-0.23 — the right magnitude, by coincidence — while correlating
 * r = -0.025 with the Void compressor on the same files.
 *
 * TWO TESTS, both cheap, both decisive:
 *
 *   1. PERMUTATION. Shuffle the input axis with ONE fixed permutation applied
 *      identically to every artifact, then ask whether the reading responded
 *      the way that axis's MEANING demands. Which way that is depends on the
 *      axis, and getting this backwards is easy:
 *
 *        axis: 'arbitrary'  — feature slots, whose order is an authoring
 *          choice (the 29-D fractal vector: charge, valence, mass, …).
 *          Permuting is a RELABELING. The reading must NOT move. If it does,
 *          it is measuring your encoding.
 *
 *        axis: 'ordered'    — samples in sequence, where order IS content
 *          (bytes, a waveform, a time series). Permuting DESTROYS real
 *          structure. The reading SHOULD move. If it does not, the reading
 *          is ignoring the very structure it claims to measure.
 *
 *      An earlier version of this script tested only the first case and so
 *      reported a correctly-behaving series statistic on real bytes as a
 *      defect. One direction of evidence is not the test; the axis is.
 *
 *   2. ANCHOR. Correlate the reading against the Void compressor's coherency
 *      on the same artifacts. The compressor is the only producer of
 *      coherency, so this says whether the reading tracks the one true source
 *      or something unrelated to it.
 *
 * Neither test needs to know what the reading means. That is the point — they
 * work on any candidate, including ones nobody has thought to doubt.
 *
 * Usage:
 *   node scripts/audit-reading-validity.js                   # audit the built-ins
 *   node scripts/audit-reading-validity.js --files <n>       # sample size (default 40)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SL = require('../src/core/substrate-ledger');
const { toFractalWaveform } = require('../src/core/fractal-waveform');
const voidService = require('../src/core/void-service');

const argv = process.argv.slice(2);
const argN = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? (parseInt(argv[i + 1], 10) || d) : d; };
const N_FILES = argN('--files', 40);

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
function pearson(A, B) {
  const ma = mean(A), mb = mean(B);
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < A.length; i++) { n += (A[i] - ma) * (B[i] - mb); da += (A[i] - ma) ** 2; db += (B[i] - mb) ** 2; }
  return (da > 1e-12 && db > 1e-12) ? n / Math.sqrt(da * db) : 0;
}

// A fixed permutation — the same relabeling for every artifact, so any change
// it causes is a property of the reading, not of the data.
function fixedPermutation(len, seed = 20260802) {
  const p = Array.from({ length: len }, (_, i) => i);
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = len - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}

/**
 * Candidate readings to audit. Each declares how to turn a file into its
 * input vector, and how to read that vector. Add to this list rather than
 * writing a new script — the whole value is that it is one standing check.
 */
const CANDIDATES = [
  {
    name: 'seriesCoherence(fractal vector)',
    note: 'the historical ingest reading — expected to FAIL both tests',
    axis: 'arbitrary',          // 29 named feature slots; order is authoring
    vector: (content) => Array.from(toFractalWaveform(content)),
    read: (vec) => SL.seriesCoherence(vec),
  },
  {
    name: 'seriesCoherence(file bytes)',
    note: 'same function, pointed at an actual signal',
    axis: 'ordered',            // bytes in sequence; order is content
    vector: (content) => Array.from(Buffer.from(content, 'utf8').slice(0, 4096)),
    read: (vec) => SL.seriesCoherence(vec),
  },
];

function collectFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectFiles(p, out);
    else if (/\.(js|py)$/.test(e.name)) out.push(p);
  }
  return out;
}

function main() {
  const all = collectFiles(path.join(ROOT, 'src'));
  const step = Math.max(1, Math.floor(all.length / N_FILES));
  const files = [];
  for (let i = 0; i < all.length && files.length < N_FILES; i += step) files.push(all[i]);

  const contents = [];
  for (const f of files) {
    try {
      const c = fs.readFileSync(f, 'utf8');
      if (c.length >= 200) contents.push({ f, c });
    } catch (_) { /* skip */ }
  }
  console.log(`auditing ${contents.length} files\n`);

  // The anchor: the one true coherency, from the one producer.
  process.stdout.write('reading the anchor (Void compressor)… ');
  const anchor = [];
  for (const { c } of contents) anchor.push(voidService.coherencyOf(c, { quiet: true }));
  const anchorOk = anchor.filter((x) => typeof x === 'number').length;
  console.log(`${anchorOk}/${contents.length} read`);
  if (anchorOk < contents.length / 2) {
    console.log('  ⚠ too few anchor readings — the ANCHOR test will be skipped.');
    console.log('    (the Void compressor is the only producer of coherency; without it');
    console.log('     there is nothing to compare a candidate against)');
  }
  console.log('');

  let anyFail = false;
  for (const cand of CANDIDATES) {
    const vecs = contents.map(({ c }) => cand.vector(c));
    const len = vecs[0].length;
    const perm = fixedPermutation(len);

    const base = vecs.map((v) => cand.read(v));
    const permd = vecs.map((v) => cand.read(perm.map((i) => v[i])));

    const spread = sd(base);
    const shift = mean(base.map((x, i) => Math.abs(x - permd[i])));
    const rPerm = pearson(base, permd);

    const pairs = base.map((x, i) => [x, anchor[i]]).filter(([, a]) => typeof a === 'number');
    const rAnchor = pairs.length >= 8
      ? pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]))
      : NaN;

    // Which way the reading SHOULD respond depends on what the axis means.
    const arbitrary = cand.axis !== 'ordered';
    const permOk = arbitrary
      // Relabeling must not move it, and before/after must stay correlated.
      ? (shift < spread * 0.5 && rPerm > 0.8)
      // Destroying real order MUST move it — otherwise the reading is not
      // using the sequence it claims to read.
      : (shift > spread);
    // It passes ANCHOR if it tracks the one true coherency at all.
    const anchorOkTest = Number.isNaN(rAnchor) ? null : Math.abs(rAnchor) > 0.3;

    console.log(`── ${cand.name}`);
    if (cand.note) console.log(`   ${cand.note}`);
    console.log(`   reading         mean ${mean(base).toFixed(4)}  sd ${spread.toFixed(4)}  (input width ${len})`);
    console.log(`   PERMUTATION     axis=${arbitrary ? 'arbitrary (relabeling)' : 'ordered (order is content)'}`);
    console.log(`                   mean shift ${shift.toFixed(4)} vs spread ${spread.toFixed(4)}  ·  r = ${rPerm.toFixed(4)}`);
    console.log(`                   ${permOk
      ? (arbitrary ? '✓ survives relabeling' : '✓ responds to order, as a sequence reading must')
      : (arbitrary ? '✗ MEASURES THE ORDERING, not the artifact'
                   : '✗ IGNORES ORDER — not actually reading the sequence')}`);
    if (anchorOkTest === null) {
      console.log('   ANCHOR          skipped (no anchor readings)');
    } else {
      console.log(`   ANCHOR          r = ${rAnchor.toFixed(4)} vs the Void compressor`);
      console.log(`                   ${anchorOkTest ? '✓ tracks the true coherency' : '✗ UNRELATED to the true coherency'}`);
    }
    console.log('');
    if (!permOk || anchorOkTest === false) anyFail = true;
  }

  console.log('A candidate that fails PERMUTATION is reading your encoding.');
  console.log('A candidate that fails ANCHOR is not reading coherency at all —');
  console.log('whatever it measures, it must not be contributed under that name.');
  process.exit(anyFail ? 1 : 0);
}

main();
