#!/usr/bin/env node
'use strict';

/**
 * Phase 1 — Empirical validation of "coherence as bug signal"
 *
 * Hypothesis: files that the Oracle audit backend flags as buggy
 * should have LOWER Void coherency than files with zero audit
 * findings. If the correlation holds, Void coherency is a valid
 * proxy for bug probability.
 *
 * Method:
 *   1. Pick ~20 representative src files spanning audit finding
 *      counts from 0 to 8+.
 *   2. For each file:
 *        a. Run `oracle audit check --file <f>` and count findings.
 *        b. Send file content to Void's /coherence endpoint.
 *   3. Compute Spearman correlation between audit findings and
 *      Void coherency.
 *   4. Plot (ascii-table) and report correlation coefficient.
 *
 * Null hypothesis: corr ≈ 0 (Void coherency is unrelated to audit findings)
 * Alt hypothesis: corr < -0.3 (low coherency → high findings)
 */

const fs = require('fs');
const http = require('http');
const { execFileSync } = require('child_process');
const path = require('path');

const VOID_KEY = process.env.VOID_API_KEY;
if (!VOID_KEY) { console.error('VOID_API_KEY required'); process.exit(1); }

// Pre-selected set spanning low-findings to high-findings:
const FILES = [
  // Known clean/proven patterns
  'seeds/code/async-mutex.js',
  'seeds/code/priority-queue.js',
  'seeds/code/circuit-breaker.js',
  'seeds/code/promise-pool.js',
  'seeds/code/state-machine.js',
  // Core utilities
  'src/core/events.js',
  'src/core/preflight.js',
  'src/core/resilience.js',
  'src/core/reactions.js',
  'src/core/compliance.js',
  // Larger implementation files
  'src/core/ecosystem.js',
  'src/core/covenant.js',
  'src/core/storage.js',
  'src/patterns/library.js',
  'src/cli/commands/library.js',
  // Known-flagged worst files (from `oracle audit summary`)
  'dashboard/public/app.js',
  'seeds/code/bloom-filter.js',
  '.remembrance/debug-fixes/debug-fix-negotiation-sort-mutation.js',
  'digital-cathedral/patterns/batch4/sorted-array.js',
  'digital-cathedral/tests/lead-distribution.test.js',
];

function postJSON(path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      host: 'localhost', port: 8080, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-API-Key': VOID_KEY,
      },
      timeout: 180000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

function auditFindings(file) {
  try {
    const out = execFileSync('node', ['src/cli.js', 'audit', 'check', '--file', file, '--json'],
      { encoding: 'utf-8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
    const result = JSON.parse(out);
    if (typeof result.totalFindings === 'number') return result.totalFindings;
    if (Array.isArray(result.files)) {
      return result.files.reduce((n, f) => n + (f.findings?.length || 0), 0);
    }
    if (Array.isArray(result)) return result.length;
    return 0;
  } catch (e) {
    return -1;
  }
}

// Spearman rank correlation (no dependencies)
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

async function run() {
  const rows = [];
  for (const file of FILES) {
    if (!fs.existsSync(file)) {
      console.log(`MISSING: ${file}`);
      continue;
    }
    const code = fs.readFileSync(file, 'utf-8');
    let voidScore = null;
    try {
      const r = await postJSON('/coherence', { text: code });
      voidScore = r.coherence;
    } catch (e) { voidScore = null; }
    const findings = auditFindings(file);
    rows.push({ file, findings, voidCoherence: voidScore, size: code.length });
    console.log(
      file.padEnd(60) +
      `  findings: ${String(findings).padStart(2)}` +
      `  void: ${String(voidScore).padStart(6)}` +
      `  size: ${code.length}B`
    );
  }

  const valid = rows.filter(r => typeof r.voidCoherence === 'number' && r.findings >= 0);
  const findings = valid.map(r => r.findings);
  const coh = valid.map(r => r.voidCoherence);
  const rho = spearman(findings, coh);

  console.log('\n=== Correlation ===');
  console.log(`samples          : ${valid.length}/${FILES.length}`);
  console.log(`Spearman ρ       : ${rho.toFixed(4)}`);
  console.log(`interpretation   : ${
    rho < -0.5 ? 'STRONG negative — hypothesis CONFIRMED (low coherency ↔ high findings)' :
    rho < -0.3 ? 'moderate negative — hypothesis supported' :
    rho < -0.1 ? 'weak negative — hypothesis weakly supported' :
    rho > 0.1 ? 'positive — hypothesis REJECTED' :
    'near zero — no correlation'
  }`);

  // Buckets
  const clean = valid.filter(r => r.findings === 0);
  const buggy = valid.filter(r => r.findings > 0);
  if (clean.length && buggy.length) {
    const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const cleanCoh = avg(clean.map(r => r.voidCoherence));
    const buggyCoh = avg(buggy.map(r => r.voidCoherence));
    console.log(`\nClean files (0 findings)  avg Void coherency: ${cleanCoh.toFixed(4)}  (n=${clean.length})`);
    console.log(`Buggy files (>0 findings) avg Void coherency: ${buggyCoh.toFixed(4)}  (n=${buggy.length})`);
    console.log(`delta                                       : ${(buggyCoh - cleanCoh).toFixed(4)}`);
  }

  fs.mkdirSync('docs/benchmarks', { recursive: true });
  fs.writeFileSync('docs/benchmarks/coherence-vs-findings-2026-04-14.json',
    JSON.stringify({ rows, correlation: rho, ts: new Date().toISOString() }, null, 2));
  console.log('\nRaw data: docs/benchmarks/coherence-vs-findings-2026-04-14.json');
}

run().catch(e => { console.error(e); process.exit(1); });
