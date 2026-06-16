#!/usr/bin/env node
'use strict';

/**
 * stress-test-classifier.js — six-axis stress harness for the
 * extraction/abundance classifier. Prints a structured report;
 * exits non-zero if any axis fails its gate.
 *
 * Axes:
 *   1. Adversarial robustness  — pathological inputs must not crash
 *   2. Determinism             — same input → identical signature
 *   3. Discrimination          — known-extractive vs known-abundant
 *   4. Stability               — small edits must not flip verdicts
 *   5. Lexicon resistance      — vocabulary cannot override geometry
 *   6. Performance             — scaling profile across input sizes
 *
 * Usage:  node scripts/stress-test-classifier.js
 */

const { classifyAlignment, classifySignature } = require('../src/core/abundance-classifier');
const { composedAtDepth } = require('../src/core/encoder-stack');

const results = [];
let failures = 0;

function record(axis, name, pass, detail) {
  results.push({ axis, name, pass, detail });
  if (!pass) failures++;
}

// ── Synthetic series generators ──────────────────────────────────

function compoundingHoard(n = 200, rate = 1.06) {
  const v = []; let x = 1;
  for (let i = 0; i < n; i++) { x *= rate; v.push(+x.toFixed(4)); }
  return JSON.stringify(v);
}

function depletingReserve(n = 200) {
  const v = []; let x = 1000;
  for (let i = 0; i < n; i++) { x *= 0.97; v.push(+x.toFixed(4)); }
  return JSON.stringify(v);
}

function pumpAndDump(n = 200) {
  const v = [];
  for (let i = 0; i < n; i++) {
    const phase = i / n;
    const x = phase < 0.6 ? 10 + i * 0.5 : 130 - (i - 120) * 1.4;
    v.push(+Math.max(0, x).toFixed(4));
  }
  return JSON.stringify(v);
}

function monopolyShare(n = 200) {
  const v = [];
  for (let i = 0; i < n; i++) {
    v.push(+(100 / (1 + Math.exp(-(i - 100) / 18))).toFixed(4));
  }
  return JSON.stringify(v);
}

function paretoTail(n = 200) {
  const v = [];
  for (let i = 0; i < n; i++) {
    v.push(+(Math.pow(1 - i / n, -1.16)).toFixed(4));
  }
  return JSON.stringify(v.sort((a, b) => b - a));
}

function heartbeat(n = 200) {
  const v = [];
  for (let i = 0; i < n; i++) {
    v.push(+(72 + 4 * Math.sin(i / 4) + 1.5 * Math.sin(i / 1.3)).toFixed(4));
  }
  return JSON.stringify(v);
}

function riverFlow(n = 200) {
  const v = [];
  for (let i = 0; i < n; i++) {
    const seasonal = 50 + 30 * Math.sin(i / 30);
    const daily = 5 * Math.sin(i / 2.5);
    v.push(+(seasonal + daily).toFixed(4));
  }
  return JSON.stringify(v);
}

function ecologicalCycle(n = 200) {
  const v = []; let prey = 50, pred = 20;
  for (let i = 0; i < n; i++) {
    const dp = 0.1 * prey - 0.02 * prey * pred;
    const dq = 0.01 * prey * pred - 0.1 * pred;
    prey = Math.max(1, prey + dp);
    pred = Math.max(1, pred + dq);
    v.push(+prey.toFixed(4));
  }
  return JSON.stringify(v);
}

function balancedLedger(n = 200) {
  const v = []; let bal = 1000;
  for (let i = 0; i < n; i++) {
    const flow = (Math.sin(i / 3) + Math.sin(i / 1.7)) * 50;
    bal += flow;
    v.push(+bal.toFixed(4));
  }
  return JSON.stringify(v);
}

function commitCadence(n = 200) {
  const v = [];
  for (let i = 0; i < n; i++) {
    const weekday = i % 7 < 5 ? 1 : 0;
    const intensity = weekday * (3 + 2 * Math.sin(i / 14)) + Math.random() * 0.001;
    v.push(+intensity.toFixed(4));
  }
  return JSON.stringify(v);
}

// ── Axis 1: adversarial robustness ───────────────────────────────

function axisAdversarial() {
  const cases = [
    ['empty string', ''],
    ['single char', 'x'],
    ['all whitespace', '   \n\t\r   '],
    ['only digits', '0'.repeat(500)],
    ['unicode chaos', '🌀'.repeat(200) + 'mañana' + '日本語'.repeat(50)],
    ['very long line', 'a'.repeat(50000)],
    ['malformed JSON', '{"foo": [1, 2, '],
    ['code injection', '${require("fs").readFileSync("/etc/passwd")}'],
    ['only newlines', '\n'.repeat(1000)],
    ['null bytes', 'a\0b\0c\0d\0e\0'.repeat(100)],
    ['huge random', Array.from({ length: 5000 }, () => Math.random().toString(36).slice(2, 7)).join(' ')],
  ];
  for (const [name, input] of cases) {
    try {
      const r = classifyAlignment(input);
      const sane = Number.isFinite(r.extraction) && Number.isFinite(r.abundance)
        && r.extraction >= 0 && r.extraction <= 1
        && r.abundance >= 0 && r.abundance <= 1
        && r.alignment >= -1 && r.alignment <= 1;
      record('adversarial', name, sane,
        `label=${r.label} alignment=${r.alignment.toFixed(3)} conf=${r.confidence.toFixed(3)}`);
    } catch (e) {
      record('adversarial', name, false, `THREW: ${e.message}`);
    }
  }
}

// ── Axis 2: determinism ──────────────────────────────────────────

function axisDeterminism() {
  const inputs = [compoundingHoard(), heartbeat(), 'const x = 1;', paretoTail()];
  for (const input of inputs) {
    const a = classifyAlignment(input);
    let identical = true;
    for (let i = 0; i < 50; i++) {
      const b = classifyAlignment(input);
      if (a.alignment !== b.alignment || a.extraction !== b.extraction || a.abundance !== b.abundance) {
        identical = false; break;
      }
    }
    record('determinism', input.slice(0, 30) + '...', identical,
      identical ? `50 runs identical (alignment=${a.alignment.toFixed(4)})` : 'DRIFT detected');
  }
}

// ── Axis 3: discrimination ───────────────────────────────────────

function axisDiscrimination() {
  const extractive = [
    ['compounding hoard', compoundingHoard()],
    ['depleting reserve', depletingReserve()],
    ['pump-and-dump', pumpAndDump()],
    ['monopoly capture', monopolyShare()],
    ['pareto tail', paretoTail()],
  ];
  const abundant = [
    ['heartbeat', heartbeat()],
    ['river flow', riverFlow()],
    ['lotka-volterra cycle', ecologicalCycle()],
    ['balanced ledger', balancedLedger()],
    ['commit cadence', commitCadence()],
  ];

  let exMean = 0, abMean = 0;
  const exScores = [], abScores = [];

  for (const [name, input] of extractive) {
    const r = classifyAlignment(input);
    exScores.push({ name, alignment: r.alignment, label: r.label });
    exMean += r.alignment;
    record('discrimination', `[ex] ${name}`, r.alignment < 0,
      `alignment=${r.alignment.toFixed(3)} label=${r.label}`);
  }
  for (const [name, input] of abundant) {
    const r = classifyAlignment(input);
    abScores.push({ name, alignment: r.alignment, label: r.label });
    abMean += r.alignment;
    record('discrimination', `[ab] ${name}`, r.alignment > 0,
      `alignment=${r.alignment.toFixed(3)} label=${r.label}`);
  }
  exMean /= extractive.length;
  abMean /= abundant.length;
  const separation = abMean - exMean;
  record('discrimination', '== pole separation ==', separation > 0.10,
    `extractive mean=${exMean.toFixed(3)}  abundant mean=${abMean.toFixed(3)}  separation=${separation.toFixed(3)}`);
}

// ── Axis 4: stability under perturbation ─────────────────────────

function axisStability() {
  const baselines = [
    ['compounding hoard', compoundingHoard()],
    ['heartbeat', heartbeat()],
    ['river flow', riverFlow()],
  ];
  for (const [name, base] of baselines) {
    const r0 = classifyAlignment(base);
    const perturbations = [
      ['append space', base + ' '],
      ['trim 1%', base.slice(0, Math.floor(base.length * 0.99))],
      ['duplicate', base + base.slice(0, 50)],
    ];
    let maxDrift = 0, labelFlips = 0;
    for (const [_, p] of perturbations) {
      const r1 = classifyAlignment(p);
      const drift = Math.abs(r1.alignment - r0.alignment);
      if (drift > maxDrift) maxDrift = drift;
      if (r1.label !== r0.label) labelFlips++;
    }
    record('stability', name, maxDrift < 0.10 && labelFlips === 0,
      `max alignment drift=${maxDrift.toFixed(3)} label flips=${labelFlips}/${perturbations.length}`);
  }
}

// ── Axis 5: lexicon resistance ───────────────────────────────────

function axisLexiconResistance() {
  const cases = [
    ['extractive series, abundance words', compoundingHoard(),
      'share gift regenerate commons abundance flourish steward replenish circulate '],
    ['abundance series, extractive words', heartbeat(),
      'extract hoard drain deplete scarce siphon monopolize exploit gatekeep '],
    ['pump-and-dump, ReFi vocabulary', pumpAndDump(),
      'regenerate sustainable commons share gift '],
  ];
  for (const [name, series, dressing] of cases) {
    const plain = classifyAlignment(series);
    const dressed = classifyAlignment(dressing.repeat(3) + series);
    const drift = Math.abs(dressed.alignment - plain.alignment);
    const geometryWins = plain.label === dressed.label;
    record('lexicon resistance', name, drift <= 0.15 && geometryWins,
      `drift=${drift.toFixed(3)} plain=${plain.label} dressed=${dressed.label}`);
  }
}

// ── Axis 6: performance ──────────────────────────────────────────

function axisPerformance() {
  const sizes = [
    ['1 KB', 1024],
    ['10 KB', 10 * 1024],
    ['100 KB', 100 * 1024],
    ['1 MB', 1024 * 1024],
  ];
  for (const [label, bytes] of sizes) {
    const sample = JSON.stringify(
      Array.from({ length: Math.max(50, Math.floor(bytes / 8)) }, (_, i) =>
        +(50 + 20 * Math.sin(i / 3) + 5 * Math.sin(i / 1.7)).toFixed(4))
    ).slice(0, bytes);
    const start = process.hrtime.bigint();
    classifyAlignment(sample);
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    const ratePerSec = 1000 / elapsed;
    record('performance', label, elapsed < 5000,
      `${elapsed.toFixed(1)} ms  (${ratePerSec.toFixed(1)} classifications/sec)`);
  }
}

// ── Report ───────────────────────────────────────────────────────

function printReport() {
  const byAxis = {};
  for (const r of results) {
    if (!byAxis[r.axis]) byAxis[r.axis] = [];
    byAxis[r.axis].push(r);
  }

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  ABUNDANCE CLASSIFIER — STRESS TEST REPORT');
  console.log('══════════════════════════════════════════════════════════════════\n');

  for (const [axis, rows] of Object.entries(byAxis)) {
    const passed = rows.filter(r => r.pass).length;
    const status = passed === rows.length ? '✓' : '✗';
    console.log(`  ${status}  ${axis.toUpperCase().padEnd(22)} ${passed}/${rows.length} passed`);
    console.log('  ' + '─'.repeat(64));
    for (const r of rows) {
      const mark = r.pass ? '·' : '!';
      console.log(`    ${mark} ${r.name.padEnd(36)} ${r.detail}`);
    }
    console.log('');
  }

  const total = results.length;
  const passed = total - failures;
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`  TOTAL: ${passed}/${total} passed  (${failures} failure${failures === 1 ? '' : 's'})`);
  console.log('══════════════════════════════════════════════════════════════════\n');
}

// ── Run ──────────────────────────────────────────────────────────

axisAdversarial();
axisDeterminism();
axisDiscrimination();
axisStability();
axisLexiconResistance();
axisPerformance();
printReport();

process.exit(failures > 0 ? 1 : 0);
