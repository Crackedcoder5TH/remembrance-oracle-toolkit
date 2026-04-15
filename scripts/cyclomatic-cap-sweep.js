#!/usr/bin/env node
'use strict';

/**
 * Sweep the CYCLOMATIC_CAP constant and measure how Spearman ρ
 * against audit findings changes. The v1 shipped with cap=30 (derived
 * from McCabe's per-function ≤10 guideline × 3), but the risk scorer
 * operates at FILE level, where typical well-structured implementation
 * files have cyclomatic 20-60 without being buggy. If the correlation
 * still holds at cap=50 or 80, that's the right file-level threshold.
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

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function run() {
  const rows = [];
  for (const file of TARGETS) {
    if (!fs.existsSync(file)) continue;
    const code = fs.readFileSync(file, 'utf-8');
    const score = computeCoherencyScore(code, { filePath: file });
    const findings = auditFindings(file);
    const cyclomatic = score.astAnalysis?.complexity?.cyclomatic ?? 0;
    rows.push({ file, findings, cyclomatic });
  }

  const valid = rows.filter(r => r.findings >= 0);
  const findings = valid.map(r => r.findings);

  const caps = [20, 30, 40, 50, 60, 80, 100, 150];
  console.log('cap   ρ       HIGH files (cyc ≥ 0.6*cap)   MEDIUM files');
  for (const cap of caps) {
    const risks = valid.map(r => clamp01(r.cyclomatic / cap));
    const rho = spearman(findings, risks);
    const highCount = risks.filter(r => r >= 0.6).length;
    const mediumCount = risks.filter(r => r >= 0.3 && r < 0.6).length;
    const sign = rho >= 0 ? '+' : '';
    console.log(`${String(cap).padStart(4)}  ${sign}${rho.toFixed(4)}  ${String(highCount).padStart(4)}                         ${String(mediumCount).padStart(4)}`);
  }

  // Also report raw per-file data for manual inspection
  console.log('\nPer-file cyclomatic values:');
  const sorted = valid.slice().sort((a, b) => b.cyclomatic - a.cyclomatic);
  for (const r of sorted) {
    console.log(`  ${String(r.cyclomatic).padStart(4)}  findings:${String(r.findings).padStart(2)}  ${r.file}`);
  }
}

run();
