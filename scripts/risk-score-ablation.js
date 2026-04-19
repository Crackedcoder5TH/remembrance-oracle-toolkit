#!/usr/bin/env node
'use strict';

/**
 * Phase 2 ablation: test several variants of the combined risk score
 * to find the one with the best Spearman correlation against audit
 * findings. The naive 0.5/0.5 baseline from risk-score-validation.js
 * gave ρ = +0.27, which is WORSE than either single signal alone
 * (cyclomatic: +0.35, coherency: +0.30). The hypothesis: raw
 * cyclomatic is size-biased.
 *
 * Variants tested:
 *   A. raw coherency + raw cyclomatic/30       [baseline, known bad]
 *   B. raw coherency + cyclomatic density (cyc/lines)
 *   C. coherency * cyclomatic density (multiplicative)
 *   D. cyclomatic density alone (no coherency)
 *   E. raw coherency alone
 *   F. max(coherency, cycDensity) — take the worse signal
 *
 * This is a 20-sample dataset so any result must be treated as a
 * hypothesis, not a truth. The goal is to find the variant that beats
 * the +0.35 single-signal baseline, then retrain it with more data.
 */

const fs = require('fs');
const { execFileSync } = require('child_process');
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
  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

function clamp01(x) { return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0)); }

function run() {
  const rows = [];
  for (const file of TARGETS) {
    if (!fs.existsSync(file)) continue;
    const code = fs.readFileSync(file, 'utf-8');
    const score = computeCoherencyScore(code, { filePath: file });
    const findings = auditFindings(file);
    const total = score.total || 0;
    const cyclomatic = score.astAnalysis?.complexity?.cyclomatic ?? 0;
    const rawLines = score.astAnalysis?.complexity?.lines ?? code.split('\n').length;
    const lines = rawLines > 0 ? rawLines : 1;
    // Cyclomatic density = branches per line. Typical values are
    // 0.02 (simple file) to 0.20 (high-complexity). Scale by 5 so
    // a density of 0.2 maps to 1.0 and the typical range 0.02-0.20
    // maps to 0.10-1.0, which is an unsaturated signal.
    const cycDensity = clamp01((cyclomatic / lines) * 5);

    const coherencyRisk = clamp01(1 - total);
    const cyclomaticRisk = clamp01(cyclomatic / 30);

    rows.push({
      file, findings, total, cyclomatic, lines, cycDensity,
      coherencyRisk, cyclomaticRisk,
      // Variants
      A: 0.5 * coherencyRisk + 0.5 * cyclomaticRisk,
      B: 0.5 * coherencyRisk + 0.5 * cycDensity,
      C: coherencyRisk * cycDensity,
      D: cycDensity,
      E: coherencyRisk,
      F: Math.max(coherencyRisk, cycDensity),
      G: cyclomatic, // raw cyclomatic (Phase 1 reported +0.35)
      H: 0.3 * coherencyRisk + 0.7 * cyclomaticRisk, // weighted toward the stronger signal
    });
  }

  const valid = rows.filter(r => r.findings >= 0);
  const findings = valid.map(r => r.findings);

  console.log('\n=== Per-file ===');
  console.log('file'.padEnd(60) + '  findings  A     B     C     D     E     F');
  for (const r of valid) {
    console.log(
      r.file.padEnd(60) +
      `  ${String(r.findings).padStart(2)}       ` +
      `${r.A.toFixed(2)}  ${r.B.toFixed(2)}  ${r.C.toFixed(2)}  ${r.D.toFixed(2)}  ${r.E.toFixed(2)}  ${r.F.toFixed(2)}`
    );
  }

  const variants = {
    A: 'raw coherencyRisk + raw cyclomaticRisk/30',
    B: 'raw coherencyRisk + cyclomaticDensity',
    C: 'coherencyRisk * cyclomaticDensity (multiplicative)',
    D: 'cyclomatic density alone',
    E: 'coherency risk alone',
    F: 'max(coherencyRisk, cyclomaticDensity)',
    G: 'raw cyclomatic count (unnormalized)',
    H: '0.3 * coherencyRisk + 0.7 * cyclomaticRisk',
  };

  console.log('\n=== Spearman ρ vs audit findings ===');
  const results = {};
  for (const [key, label] of Object.entries(variants)) {
    const xs = valid.map(r => r[key]);
    const rho = spearman(findings, xs);
    results[key] = { rho, label };
    const sign = rho >= 0 ? '+' : '';
    console.log(`  ${key}  ${sign}${rho.toFixed(4)}  ${label}`);
  }

  const best = Object.entries(results).sort((a, b) => Math.abs(b[1].rho) - Math.abs(a[1].rho))[0];
  console.log(`\nBest variant: ${best[0]} (${best[1].label}) with ρ = ${best[1].rho >= 0 ? '+' : ''}${best[1].rho.toFixed(4)}`);

  fs.mkdirSync('docs/benchmarks', { recursive: true });
  fs.writeFileSync('docs/benchmarks/risk-score-ablation-2026-04-15.json',
    JSON.stringify({ rows, results, ts: new Date().toISOString() }, null, 2));
  console.log('\nRaw data: docs/benchmarks/risk-score-ablation-2026-04-15.json');
}

run();
