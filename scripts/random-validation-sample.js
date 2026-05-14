#!/usr/bin/env node
'use strict';

/**
 * Random-sample validation of the risk-score correlation.
 *
 * The Phase 2 validation corpus (20 files) was curated — I picked
 * files I already knew were clean or buggy. That's selection bias.
 * This script tests whether the ρ ≈ +0.37 result holds when the
 * corpus is drawn randomly from src/.
 *
 * Sampling:
 *   - Deterministic seed (default 1) so the result is reproducible
 *   - Walks src/ recursively, excludes node_modules/.git/.remembrance
 *   - Samples N files (default 30) via Fisher–Yates with the seed
 *   - Excludes files smaller than 500 bytes (not enough code to score)
 *   - Excludes files larger than 100 KB (too slow to audit in batch)
 *
 * Output:
 *   - Per-file table: risk score vs audit finding count
 *   - Spearman ρ between combined risk and audit findings
 *   - Clean vs buggy mean risk
 *   - Comparison with the Phase 2 curated-corpus ρ = +0.37
 *
 * Usage:
 *   node scripts/random-validation-sample.js [--seed 42] [--n 30]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { computeBugProbability } = require('../src/quality/risk-score');

const SRC_ROOT = path.join(__dirname, '..', 'src');
const MIN_BYTES = 500;
const MAX_BYTES = 100 * 1024;
const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.remembrance', 'dist', 'build']);

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { seed: 1, n: 30 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seed' && args[i + 1]) { out.seed = Number(args[i + 1]); i++; }
    else if (args[i] === '--n' && args[i + 1]) { out.n = Number(args[i + 1]); i++; }
  }
  return out;
}

// Mulberry32 PRNG — tiny, deterministic, good enough for shuffling.
function makeRng(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 1;
  return function () {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fisherYates(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function collectJsFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.has(entry.name)) continue;
        stack.push(p);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.js' || ext === '.ts' || ext === '.mjs' || ext === '.cjs') {
          out.push(p);
        }
      }
    }
  }
  return out;
}

function sizeFilter(file) {
  try {
    const s = fs.statSync(file);
    return s.size >= MIN_BYTES && s.size <= MAX_BYTES;
  } catch { return false; }
}

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
  const denom = n * (n * n - 1);
  return denom > 0 ? 1 - (6 * sumD2) / denom : 0;
}

function run() {
  const { seed, n } = parseArgs();
  console.log(`Random validation (seed=${seed}, n=${n})`);
  console.log('─'.repeat(60));

  const all = collectJsFiles(SRC_ROOT).filter(sizeFilter);
  console.log(`${all.length} candidate files in ${SRC_ROOT}`);

  const rng = makeRng(seed);
  const shuffled = fisherYates(all, rng);
  const sample = shuffled.slice(0, n);

  const rows = [];
  for (const file of sample) {
    const code = fs.readFileSync(file, 'utf-8');
    const risk = computeBugProbability(code, { filePath: file });
    const findings = auditFindings(file);
    const rel = path.relative(path.join(__dirname, '..'), file);
    rows.push({
      file: rel,
      findings,
      probability: risk.probability,
      riskLevel: risk.riskLevel,
      cyclomatic: risk.signals.cyclomatic,
      lines: risk.signals.lines,
      totalCoherency: risk.signals.totalCoherency,
    });
  }

  // Sort by probability descending for display.
  const sorted = rows.slice().sort((a, b) => b.probability - a.probability);
  console.log('\nPer-file (sorted by risk):');
  console.log('  risk     level   findings  cyc   lines  file');
  for (const r of sorted) {
    console.log(
      `  ${r.probability.toFixed(3)}   ` +
      `${r.riskLevel.padEnd(6)}  ` +
      `${String(r.findings).padStart(2)}        ` +
      `${String(r.cyclomatic).padStart(3)}   ` +
      `${String(r.lines).padStart(4)}  ` +
      r.file,
    );
  }

  const valid = rows.filter(r => r.findings >= 0);
  const findings = valid.map(r => r.findings);
  const risks = valid.map(r => r.probability);
  const cyclos = valid.map(r => r.cyclomatic);
  const cohs = valid.map(r => 1 - r.totalCoherency);

  const rhoRisk = spearman(findings, risks);
  const rhoCyclo = spearman(findings, cyclos);
  const rhoCoh = spearman(findings, cohs);

  console.log('\n─'.repeat(60));
  console.log('Spearman ρ vs audit finding count:');
  console.log(`  combined risk score : ${rhoRisk >= 0 ? '+' : ''}${rhoRisk.toFixed(4)}`);
  console.log(`  raw cyclomatic      : ${rhoCyclo >= 0 ? '+' : ''}${rhoCyclo.toFixed(4)}`);
  console.log(`  raw coherency risk  : ${rhoCoh >= 0 ? '+' : ''}${rhoCoh.toFixed(4)}`);
  console.log(`\n  (Phase 2 curated corpus was ρ = +0.3699)`);

  // Clean vs buggy mean
  const clean = valid.filter(r => r.findings === 0);
  const buggy = valid.filter(r => r.findings > 0);
  const avg = (a) => (a.length > 0 ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  if (clean.length > 0 && buggy.length > 0) {
    const cleanMean = avg(clean.map(r => r.probability));
    const buggyMean = avg(buggy.map(r => r.probability));
    console.log(`\nClean files (n=${clean.length}):  mean risk ${cleanMean.toFixed(4)}`);
    console.log(`Buggy files (n=${buggy.length}):  mean risk ${buggyMean.toFixed(4)}`);
    console.log(`Delta (buggy - clean):     ${(buggyMean - cleanMean).toFixed(4)}`);
    if (buggyMean > cleanMean) {
      console.log('  → correct direction (buggy files score higher)');
    } else {
      console.log('  → WRONG direction (clean files score higher)');
    }
  }

  // Risk level distribution
  const byRisk = { HIGH: [], MEDIUM: [], LOW: [] };
  for (const r of valid) {
    if (byRisk[r.riskLevel]) byRisk[r.riskLevel].push(r);
  }
  console.log('\nRisk level distribution:');
  for (const level of ['HIGH', 'MEDIUM', 'LOW']) {
    const files = byRisk[level] || [];
    const withBugs = files.filter(r => r.findings > 0).length;
    const rate = files.length > 0 ? (withBugs / files.length * 100).toFixed(0) : '0';
    console.log(`  ${level.padEnd(6)} ${String(files.length).padStart(3)} files | ${String(withBugs).padStart(2)} with bugs | bug rate ${rate}%`);
  }

  const baseRate = buggy.length > 0 && valid.length > 0
    ? (buggy.length / valid.length * 100).toFixed(0)
    : '0';
  console.log(`  base rate: ${baseRate}% (${buggy.length}/${valid.length})`);

  fs.mkdirSync('docs/benchmarks', { recursive: true });
  const outFile = `docs/benchmarks/random-validation-seed${seed}-2026-04-15.json`;
  fs.writeFileSync(outFile, JSON.stringify({
    seed,
    n,
    sampleSize: rows.length,
    correlations: { combined: rhoRisk, cyclomatic: rhoCyclo, coherency: rhoCoh },
    rows: sorted,
    ts: new Date().toISOString(),
  }, null, 2));
  console.log(`\nRaw data: ${outFile}`);
}

run();
