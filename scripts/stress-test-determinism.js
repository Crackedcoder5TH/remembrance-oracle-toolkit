#!/usr/bin/env node
'use strict';

/**
 * stress-test-determinism.js — cross-implementation determinism gate.
 *
 * The spec (docs/FRACTAL_WAVEFORM_SPEC.md) requires:
 *   src/core/fractal-waveform.js  (oracle, internal)
 *   packages/field-tool/src/fractal-waveform.js  (published standalone)
 * to be two trusted reference implementations of the same algorithm,
 * producing byte-identical 29-D vectors for the same input.
 *
 * Source files may diverge cosmetically (comments, ordering); what
 * must NEVER diverge is the output. This script proves that with a
 * diverse adversarial corpus and exits non-zero on any drift, so it
 * can run as a one-line CI gate.
 *
 * Comparison is element-by-element exact equality on Float64Array
 * (no epsilon — the encoder is required to be deterministic, not
 * "close enough"). A single drifting dimension is a covenant break.
 *
 * Usage:  node scripts/stress-test-determinism.js [--count N]
 */

const { toFractalWaveform: oracleEncode, FRACTAL_DIM: ORACLE_DIM } =
  require('../src/core/fractal-waveform');
const { toFractalWaveform: fieldEncode, FRACTAL_DIM: FIELD_DIM } =
  require('../packages/field-tool/src/fractal-waveform');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf('--' + name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}
const COUNT = parseInt(arg('count', '2000'), 10);

// ── Adversarial corpus generators ────────────────────────────────

function genJS(seed) {
  return `function f_${seed}(x) {
  if (x > ${seed % 100}) return x * ${1 + seed % 7};
  return x.map(v => v + ${seed});
}`;
}

function genPython(seed) {
  return `def g_${seed}(items, t=${(seed % 9) / 10}):
    return [i for i in items if abs(i) > t * ${seed % 13 + 1}]`;
}

function genRust(seed) {
  return `pub fn h_${seed}(v: Vec<i32>) -> i32 {
    v.iter().filter(|&&x| x > ${seed}).sum()
}`;
}

function genTimeSeries(seed) {
  const vals = [];
  const n = 50 + (seed % 150);
  for (let i = 0; i < n; i++) {
    vals.push(+(50 + 20 * Math.sin((i + seed) / (2 + seed % 5))).toFixed(4));
  }
  return JSON.stringify(vals);
}

function genJSON(seed) {
  return JSON.stringify({
    id: seed,
    items: Array.from({ length: 5 + seed % 20 }, (_, i) => ({ k: i, v: (seed * i) % 1000 })),
    meta: { tag: `t${seed % 50}`, score: (seed % 100) / 100 },
  });
}

function genProse(seed) {
  const subjects = ['The river', 'A signal', 'The pattern', 'Coherency', 'The field'];
  const verbs = ['flows through', 'returns to', 'circulates within', 'remembers'];
  return `${subjects[seed % 5]} ${verbs[seed % 4]} the substrate ${seed} times.\nObserved: ${seed * 1.7} cycles.`;
}

function genEdgeCases() {
  // Hand-picked pathological inputs that are most likely to expose
  // floating-point or ordering drift between two implementations.
  return [
    ['empty', ''],
    ['single newline', '\n'],
    ['single space', ' '],
    ['single tab', '\t'],
    ['null byte', '\0'],
    ['high surrogate', '🌀'],
    ['mixed BOM', '﻿hello'],
    ['CRLF', 'line1\r\nline2\r\n'],
    ['only digits 1k', '0'.repeat(1000)],
    ['only braces', '{}{}{}{}{}{}{}{}{}{}{}{}'],
    ['only spaces 1k', ' '.repeat(1000)],
    ['only newlines 1k', '\n'.repeat(1000)],
    ['NaN literal', 'NaN'],
    ['negative zero', '-0'],
    ['scientific', '1e-300 1e300 1e-308'],
    ['unicode mix', 'café naïve résumé 北京 العربية'],
    ['emoji storm', '🌀'.repeat(500)],
    ['repeating prefix', 'abc'.repeat(500)],
    ['large numeric series', JSON.stringify(Array.from({ length: 500 }, (_, i) => Math.PI * i))],
  ];
}

// ── Comparison ───────────────────────────────────────────────────

/**
 * Strict equality on two Float64Arrays. Returns null if identical,
 * or { dim, oracle, field, diff } describing the first divergence.
 * No epsilon — the spec requires byte-identical output.
 */
function compareVectors(a, b) {
  if (a.length !== b.length) {
    return { dim: -1, kind: 'length', oracle: a.length, field: b.length };
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return { dim: i, kind: 'value', oracle: a[i], field: b[i], diff: a[i] - b[i] };
    }
  }
  return null;
}

// ── Run ──────────────────────────────────────────────────────────

function main() {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  CROSS-IMPLEMENTATION DETERMINISM GATE');
  console.log('  oracle/src/core/fractal-waveform.js  ↔  packages/field-tool/...');
  console.log('══════════════════════════════════════════════════════════════════\n');

  // Sanity: dimension agreement
  console.log(`  FRACTAL_DIM   oracle=${ORACLE_DIM}  field=${FIELD_DIM}`);
  if (ORACLE_DIM !== FIELD_DIM) {
    console.error(`\n✗ FATAL: FRACTAL_DIM mismatch (${ORACLE_DIM} vs ${FIELD_DIM})`);
    process.exit(2);
  }

  const mismatches = [];
  let probed = 0;

  // ── Phase 1: hand-picked edge cases ───────────────────────────
  console.log(`\n  ▸ Phase 1: ${genEdgeCases().length} adversarial edge cases`);
  for (const [name, input] of genEdgeCases()) {
    const o = oracleEncode(input);
    const f = fieldEncode(input);
    const diff = compareVectors(o, f);
    probed++;
    if (diff) mismatches.push({ source: 'edge', name, input: input.slice(0, 60), diff });
  }
  console.log(`    ${probed} compared · ${mismatches.length} mismatched`);

  // ── Phase 2: generated corpus across six generators ───────────
  const generators = [
    ['js', genJS], ['py', genPython], ['rs', genRust],
    ['ts', genTimeSeries], ['json', genJSON], ['prose', genProse],
  ];
  const perGen = Math.ceil(COUNT / generators.length);
  console.log(`\n  ▸ Phase 2: ${perGen * generators.length} generated inputs (${perGen} per generator)`);

  const start = process.hrtime.bigint();
  for (const [tag, gen] of generators) {
    for (let s = 0; s < perGen; s++) {
      const input = gen(s);
      const o = oracleEncode(input);
      const f = fieldEncode(input);
      const diff = compareVectors(o, f);
      probed++;
      if (diff) {
        mismatches.push({ source: tag, name: `${tag}/${s}`, input: input.slice(0, 60), diff });
        // Cap stored mismatches but keep counting via probed.
        if (mismatches.length > 20) break;
      }
    }
    if (mismatches.length > 20) break;
  }
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  const ratePerSec = (probed * 2) / (elapsedMs / 1000); // ×2 because we encode in both

  // ── Phase 3: determinism within each implementation ───────────
  // Re-encode the same input 100 times in each implementation and
  // verify each implementation is internally deterministic too.
  console.log(`\n  ▸ Phase 3: internal determinism — 100 re-encodes per implementation`);
  const probe = genJS(42) + genTimeSeries(7) + genProse(99);
  const oRef = oracleEncode(probe);
  const fRef = fieldEncode(probe);
  let internalDrift = 0;
  for (let i = 0; i < 100; i++) {
    if (compareVectors(oracleEncode(probe), oRef)) internalDrift++;
    if (compareVectors(fieldEncode(probe), fRef)) internalDrift++;
  }
  console.log(`    ${internalDrift === 0 ? '✓ no internal drift in either implementation' : '✗ INTERNAL DRIFT: ' + internalDrift + ' re-encodes diverged'}`);

  // ── Report ────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  REPORT');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`\n  inputs compared    ${probed}`);
  console.log(`  encode rate        ${ratePerSec.toFixed(0)} encodings/sec (combined)`);
  console.log(`  mismatches found   ${mismatches.length}`);
  console.log(`  internal drift     ${internalDrift}`);

  if (mismatches.length === 0 && internalDrift === 0) {
    console.log('\n  ✓ GATE PASSES — both implementations produce byte-identical');
    console.log('    vectors for every probed input. Spec covenant intact.\n');
    process.exit(0);
  }

  console.log('\n  ✗ GATE FAILS — implementations have diverged.');
  console.log('\n  First mismatches:');
  for (const m of mismatches.slice(0, 10)) {
    console.log(`    ${m.source.padEnd(6)} ${m.name.padEnd(20)} dim=${m.diff.dim}`);
    console.log(`      oracle=${m.diff.oracle}  field=${m.diff.field}  Δ=${m.diff.diff}`);
    console.log(`      input: ${JSON.stringify(m.input)}`);
  }
  console.log('');
  process.exit(2);
}

main();
