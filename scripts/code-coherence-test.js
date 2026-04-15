#!/usr/bin/env node
'use strict';

/**
 * Per-pattern nearest-neighbor coherence test.
 *
 * The Void /cascade endpoint averages all waveforms in a domain into
 * one mean waveform, then correlates against that mean. For a code
 * substrate where each "domain" is a pattern type containing dozens
 * of heterogeneous patterns, the mean smooths into noise.
 *
 * This script sidesteps that by doing per-pattern matching on the
 * Oracle side: for each test file, compute its waveform, then Pearson-
 * correlate against EVERY individual proven-pattern waveform in the
 * code substrates and return the MAX correlation as the coherence
 * score. That's "how much does this file resemble any one proven
 * pattern?" rather than "how much does it resemble the average of a
 * type bucket?"
 *
 * Then it re-runs the Phase 1 correlation test (Void-coherence vs
 * audit-finding count) with this new score and reports whether the
 * hypothesis finally holds.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SUBSTRATE_DIR = '/home/user/Void-Data-Compressor';
const SUBSTRATE_GLOB = /^code_.*_substrate\.json$/;
const TARGET_LEN = 128;

function loadAllPatterns() {
  const files = fs.readdirSync(SUBSTRATE_DIR).filter(f => SUBSTRATE_GLOB.test(f));
  const patterns = [];
  for (const f of files) {
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(SUBSTRATE_DIR, f), 'utf-8')); }
    catch (e) { console.warn(`Skipping ${f}: ${e.message}`); continue; }
    const type = data.meta?.pattern_type || f.replace(/^code_|_substrate\.json$/g, '');
    for (const p of data.patterns || []) {
      if (Array.isArray(p.waveform) && p.waveform.length === TARGET_LEN) {
        patterns.push({ name: p.name, type, waveform: p.waveform });
      }
    }
  }
  return patterns;
}

function codeToWaveform(code) {
  const bytes = Buffer.from(code, 'utf-8');
  if (bytes.length < 8) return null;
  const wave = new Float64Array(TARGET_LEN);
  if (bytes.length >= TARGET_LEN) {
    for (let k = 0; k < TARGET_LEN; k++) {
      const idx = Math.floor((k / (TARGET_LEN - 1)) * (bytes.length - 1));
      wave[k] = bytes[idx];
    }
  } else {
    for (let k = 0; k < TARGET_LEN; k++) {
      const t = (k / (TARGET_LEN - 1)) * (bytes.length - 1);
      const lo = Math.floor(t);
      const hi = Math.ceil(t);
      wave[k] = bytes[lo] * (1 - (t - lo)) + bytes[hi] * (t - lo);
    }
  }
  let min = Infinity, max = -Infinity;
  for (const v of wave) { if (v < min) min = v; if (v > max) max = v; }
  if (max - min < 1e-9) return null;
  const out = new Float64Array(TARGET_LEN);
  for (let k = 0; k < TARGET_LEN; k++) out[k] = (wave[k] - min) / (max - min);
  return out;
}

function pearson(a, b) {
  if (!a || a.length === 0) return 0;
  const n = a.length || 1;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = n > 0 ? sa / n : 0;
  const mb = n > 0 ? sb / n : 0;
  let num = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    num += da * db;
    va += da * da;
    vb += db * db;
  }
  const den = Math.sqrt(va * vb);
  return den > 0 ? num / den : 0;
}

function nearestNeighborScore(code, patterns) {
  const wave = codeToWaveform(code);
  if (!wave) return { score: 0, match: null };
  let best = { score: -Infinity, match: null };
  for (const p of patterns) {
    const c = pearson(wave, p.waveform);
    if (c > best.score) best = { score: c, match: p };
  }
  return best;
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
  console.log('Loading code substrate...');
  const patterns = loadAllPatterns();
  console.log(`  ${patterns.length} proven patterns loaded from ${SUBSTRATE_DIR}`);
  console.log();

  const rows = [];
  for (const file of TARGETS) {
    if (!fs.existsSync(file)) { console.log(`MISSING: ${file}`); continue; }
    const code = fs.readFileSync(file, 'utf-8');
    const { score, match } = nearestNeighborScore(code, patterns);
    const findings = auditFindings(file);
    rows.push({ file, findings, nearestScore: score, nearestPattern: match?.name, nearestType: match?.type });
    console.log(
      file.padEnd(60) +
      `  findings: ${String(findings).padStart(2)}` +
      `  nearest: ${score.toFixed(4)}` +
      `  (${match?.name?.slice(0, 24) || '-'})`
    );
  }

  // Exclude exact self-matches (score >= 0.99): if a test file is
  // literally in the substrate, its nearest neighbor is itself with
  // Pearson = 1.0, which drags the clean-bucket average up for
  // trivial reasons unrelated to bug probability.
  const valid = rows.filter(r => r.findings >= 0 && r.nearestScore < 0.99);
  const excluded = rows.filter(r => r.nearestScore >= 0.99).map(r => r.file);
  if (excluded.length) console.log(`\nExcluded ${excluded.length} exact self-matches:`, excluded);
  const findings = valid.map(r => r.findings);
  const scores = valid.map(r => r.nearestScore);
  const rho = spearman(findings, scores);

  console.log('\n=== Correlation ===');
  console.log(`samples          : ${valid.length}/${TARGETS.length}`);
  console.log(`Spearman ρ       : ${rho.toFixed(4)}`);
  console.log(`interpretation   : ${
    rho < -0.5 ? 'STRONG negative — hypothesis CONFIRMED' :
    rho < -0.3 ? 'moderate negative — hypothesis supported' :
    rho < -0.1 ? 'weak negative — hypothesis weakly supported' :
    rho > 0.1 ? 'positive — hypothesis REJECTED' :
    'near zero — no correlation'
  }`);

  const clean = valid.filter(r => r.findings === 0);
  const buggy = valid.filter(r => r.findings > 0);
  if (clean.length && buggy.length) {
    const avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
    const cleanAvg = avg(clean.map(r => r.nearestScore));
    const buggyAvg = avg(buggy.map(r => r.nearestScore));
    console.log(`\nClean files (0 findings)  avg nearest-pattern Pearson: ${cleanAvg.toFixed(4)}  (n=${clean.length})`);
    console.log(`Buggy files (>0 findings) avg nearest-pattern Pearson: ${buggyAvg.toFixed(4)}  (n=${buggy.length})`);
    console.log(`delta                                                  : ${(buggyAvg - cleanAvg).toFixed(4)}`);
  }

  fs.mkdirSync('docs/benchmarks', { recursive: true });
  fs.writeFileSync('docs/benchmarks/code-coherence-nearest-2026-04-15.json',
    JSON.stringify({ rows, correlation: rho, ts: new Date().toISOString() }, null, 2));
  console.log('\nRaw data: docs/benchmarks/code-coherence-nearest-2026-04-15.json');
}

run();
