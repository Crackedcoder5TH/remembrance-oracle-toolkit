#!/usr/bin/env node
'use strict';

/**
 * Phase 2 empirical validation: does the combined risk score beat
 * single-signal baselines on the same 20-file corpus used in the
 * Phase 1 study?
 *
 * Phase 1 baseline correlations (from
 * docs/benchmarks/coherence-bug-detector-study.md):
 *
 *   total coherency  → ρ = -0.3008  (clean files score higher)
 *   cyclomatic        → ρ = +0.3534  (buggy files score higher)
 *
 * Hypothesis: `0.5 * (1 - total) + 0.5 * (cyclomatic / 30)` combines
 * the two signals into a score whose correlation with audit finding
 * count is STRONGER than either signal alone. The sign flips because
 * we're measuring *bug risk*, so we expect the combined score to
 * POSITIVELY correlate with findings.
 *
 * Target: ρ > +0.4 (better than either +0.35 or |-0.30|).
 */

const fs = require('fs');
const { execFileSync } = require('child_process');
const { computeBugProbability } = require('../src/quality/risk-score');
const { computeCoherencyScore } = require('../src/unified/coherency');

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
  // n is validated to be >= 3 above, so n * (n * n - 1) > 0
  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

function run() {
  const rows = [];
  for (const file of TARGETS) {
    if (!fs.existsSync(file)) continue;
    const code = fs.readFileSync(file, 'utf-8');
    const risk = computeBugProbability(code, { filePath: file });
    const score = computeCoherencyScore(code, { filePath: file });
    const findings = auditFindings(file);
    rows.push({
      file,
      findings,
      combinedRisk: risk.probability,
      coherencyRisk: risk.components.coherencyRisk,
      cyclomaticRisk: risk.components.cyclomaticRisk,
      totalCoherency: score.total,
      cyclomatic: score.astAnalysis?.complexity?.cyclomatic ?? 0,
      riskLevel: risk.riskLevel,
    });
    console.log(
      file.padEnd(60) +
      `  findings:${String(findings).padStart(2)}` +
      `  combined:${risk.probability.toFixed(3)}` +
      `  [${risk.riskLevel}]`
    );
  }

  const valid = rows.filter(r => r.findings >= 0);
  const findings = valid.map(r => r.findings);
  const combined = valid.map(r => r.combinedRisk);
  const totalCoh = valid.map(r => r.totalCoherency);
  const cyclo = valid.map(r => r.cyclomatic);

  const rhoCombined = spearman(findings, combined);
  const rhoCoherencyOnly = spearman(findings, totalCoh.map(v => 1 - v)); // 1-total → positive direction
  const rhoCyclomaticOnly = spearman(findings, cyclo);

  console.log('\n=== Spearman ρ vs audit findings ===');
  console.log(`  combined risk score      : ${rhoCombined >= 0 ? '+' : ''}${rhoCombined.toFixed(4)}`);
  console.log(`  coherency-only (1-total)  : ${rhoCoherencyOnly >= 0 ? '+' : ''}${rhoCoherencyOnly.toFixed(4)}`);
  console.log(`  cyclomatic-only           : ${rhoCyclomaticOnly >= 0 ? '+' : ''}${rhoCyclomaticOnly.toFixed(4)}`);
  console.log('');

  // Verdict
  const bestSingle = Math.max(Math.abs(rhoCoherencyOnly), Math.abs(rhoCyclomaticOnly));
  const combinedMagnitude = Math.abs(rhoCombined);
  const delta = combinedMagnitude - bestSingle;

  console.log('=== Verdict ===');
  if (delta > 0.05) {
    console.log(`COMBINED SCORE WINS by ${delta.toFixed(4)} over best single signal`);
  } else if (delta > 0) {
    console.log(`combined score marginally beats best single signal (Δ = ${delta.toFixed(4)})`);
  } else {
    console.log(`combined score does NOT beat best single signal (Δ = ${delta.toFixed(4)})`);
  }

  // Clean vs buggy mean (using risk score)
  const clean = valid.filter(r => r.findings === 0);
  const buggy = valid.filter(r => r.findings > 0);
  if (clean.length && buggy.length) {
    const avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
    console.log('');
    console.log('=== Clean vs buggy mean (combined risk score) ===');
    console.log(`  clean (n=${clean.length}): ${avg(clean.map(r => r.combinedRisk)).toFixed(4)}`);
    console.log(`  buggy (n=${buggy.length}): ${avg(buggy.map(r => r.combinedRisk)).toFixed(4)}`);
    console.log(`  delta           : ${(avg(buggy.map(r => r.combinedRisk)) - avg(clean.map(r => r.combinedRisk))).toFixed(4)}`);
  }

  // Risk level distribution
  console.log('');
  console.log('=== Risk level distribution ===');
  for (const level of ['HIGH', 'MEDIUM', 'LOW']) {
    const files = valid.filter(r => r.riskLevel === level);
    const withBugs = files.filter(r => r.findings > 0).length;
    const bugRate = files.length > 0 ? withBugs / files.length : 0;
    console.log(`  ${level.padEnd(6)} ${String(files.length).padStart(2)} files  |  ${withBugs} with bugs  |  bug rate ${(bugRate * 100).toFixed(0)}%`);
  }

  fs.mkdirSync('docs/benchmarks', { recursive: true });
  fs.writeFileSync('docs/benchmarks/risk-score-validation-2026-04-15.json',
    JSON.stringify({
      rows,
      correlations: {
        combined: rhoCombined,
        coherencyOnly: rhoCoherencyOnly,
        cyclomaticOnly: rhoCyclomaticOnly,
      },
      bestSingleMagnitude: bestSingle,
      combinedMagnitude,
      delta,
      ts: new Date().toISOString(),
    }, null, 2));
  console.log('\nRaw data: docs/benchmarks/risk-score-validation-2026-04-15.json');
}

run();
