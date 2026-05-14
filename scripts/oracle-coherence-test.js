#!/usr/bin/env node
'use strict';

/**
 * Final coherence test: Oracle's own multi-dimensional coherency
 * scoring vs audit finding count.
 *
 * Phase 1-3 tested coherence measured at the BYTE-WAVEFORM level
 * (Void compression, sliding-window compression, per-pattern Pearson
 * on raw bytes). None correlated with bug count, because byte-level
 * similarity captures surface syntax, not semantics.
 *
 * Oracle's `computeCoherencyScore` operates in SEMANTIC space: it
 * parses the file, scores it across syntax validity, readability,
 * security (taint analysis), testProof, and historical reliability,
 * then returns a weighted total. If bugs really are coherence breaks,
 * they should show up in *this* measurement, not in Void's waveform
 * space.
 */

const fs = require('fs');
const { execFileSync } = require('child_process');
const { computeCoherencyScore } = require('../src/unified/coherency');

function auditFindings(file) {
  try {
    const out = execFileSync('node', ['src/cli.js', 'audit', 'check', '--file', file, '--json'],
      { encoding: 'utf-8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
    const r = JSON.parse(out);
    if (typeof r.totalFindings === 'number') return r.totalFindings;
    if (Array.isArray(r.files)) return r.files.reduce((n, f) => n + (f.findings?.length || 0), 0);
    return 0;
  } catch { return -1; }
}

function spearman(xs, ys) {
  const n = xs.length;
  if (n < 3) return 0;
  const rank = (arr) => {
    const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n);
    for (let k = 0; k < n; k++) r[idx[k][1]] = k + 1;
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  let sumD2 = 0;
  for (let i = 0; i < n; i++) sumD2 += (rx[i] - ry[i]) ** 2;
  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

const TARGETS = [
  'seeds/code/async-mutex.js',
  'seeds/code/priority-queue.js',
  'seeds/code/circuit-breaker.js',
  'seeds/code/promise-pool.js',
  'seeds/code/state-machine.js',
  'src/core/events.js',
  'src/core/preflight.js',
  'src/core/resilience.js',
  'src/core/reactions.js',
  'src/core/compliance.js',
  'src/core/ecosystem.js',
  'src/core/covenant.js',
  'src/core/storage.js',
  'src/patterns/library.js',
  'src/cli/commands/library.js',
  'dashboard/public/app.js',
  'seeds/code/bloom-filter.js',
  '.remembrance/debug-fixes/debug-fix-negotiation-sort-mutation.js',
  'digital-cathedral/patterns/batch4/sorted-array.js',
  'digital-cathedral/tests/lead-distribution.test.js',
];

function run() {
  const rows = [];
  for (const file of TARGETS) {
    if (!fs.existsSync(file)) continue;
    const code = fs.readFileSync(file, 'utf-8');
    let score;
    try {
      score = computeCoherencyScore(code, { filePath: file });
    } catch (e) { continue; }
    const findings = auditFindings(file);
    rows.push({
      file, findings,
      total: score.total,
      syntaxValid: score.breakdown?.syntaxValid,
      completeness: score.breakdown?.completeness,
      consistency: score.breakdown?.consistency,
      testProof: score.breakdown?.testProof,
      reliability: score.breakdown?.historicalReliability,
      fractalAlignment: score.breakdown?.fractalAlignment,
      cyclomatic: score.astAnalysis?.complexity?.cyclomatic,
      maxDepth: score.astAnalysis?.complexity?.maxDepth,
    });
    console.log(
      file.padEnd(60) +
      `  findings: ${String(findings).padStart(2)}` +
      `  total: ${score.total.toFixed(3)}` +
      `  fractal: ${(score.breakdown?.fractalAlignment ?? 0).toFixed(2)}` +
      `  cyc: ${String(score.astAnalysis?.complexity?.cyclomatic ?? 0).padStart(3)}`
    );
  }

  const valid = rows.filter(r => r.findings >= 0);
  const findings = valid.map(r => r.findings);

  console.log('\n=== Correlations (Spearman ρ vs audit findings) ===');
  const dims = ['total', 'syntaxValid', 'completeness', 'consistency', 'testProof',
    'reliability', 'fractalAlignment', 'cyclomatic', 'maxDepth'];
  const results = {};
  for (const d of dims) {
    const vals = valid.map(r => r[d] ?? 0);
    const rho = spearman(findings, vals);
    results[d] = rho;
    const interp =
      rho < -0.5 ? 'STRONG negative — hypothesis CONFIRMED' :
      rho < -0.3 ? 'moderate negative' :
      rho < -0.1 ? 'weak negative' :
      rho > 0.1 ? 'positive (wrong direction)' :
      'near zero';
    console.log(`  ${d.padEnd(18)} ρ = ${rho.toFixed(4)}   ${interp}`);
  }

  const clean = valid.filter(r => r.findings === 0);
  const buggy = valid.filter(r => r.findings > 0);
  if (clean.length && buggy.length) {
    const avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
    console.log('\n=== Clean vs buggy means (total coherency) ===');
    console.log(`  clean (n=${clean.length}): ${avg(clean.map(r => r.total)).toFixed(4)}`);
    console.log(`  buggy (n=${buggy.length}): ${avg(buggy.map(r => r.total)).toFixed(4)}`);
    console.log(`  delta           : ${(avg(buggy.map(r => r.total)) - avg(clean.map(r => r.total))).toFixed(4)}`);

    console.log('\n=== Clean vs buggy means (security dimension alone) ===');
    console.log(`  clean: ${avg(clean.map(r => r.security ?? 0)).toFixed(4)}`);
    console.log(`  buggy: ${avg(buggy.map(r => r.security ?? 0)).toFixed(4)}`);
    console.log(`  delta: ${(avg(buggy.map(r => r.security ?? 0)) - avg(clean.map(r => r.security ?? 0))).toFixed(4)}`);
  }

  fs.mkdirSync('docs/benchmarks', { recursive: true });
  fs.writeFileSync('docs/benchmarks/oracle-coherence-test-2026-04-15.json',
    JSON.stringify({ rows, correlations: results, ts: new Date().toISOString() }, null, 2));
  console.log('\nRaw data: docs/benchmarks/oracle-coherence-test-2026-04-15.json');
}

run();
