#!/usr/bin/env node
'use strict';

/**
 * Per-repo coherence — the coherency score of EACH repo on its own, alongside
 * the grand-total ecosystem number.
 *
 * The Void compressor already did the work: it compressed every repo's
 * functions into the substrate and scored each with a coherency_v1. This script
 * reads that canonical substrate (cross_repo_function_records.json), groups the
 * per-function scores by repo, and reports a per-repo coherence scoreboard plus
 * the record-weighted grand mean — the same number ecosystem-health reports.
 *
 * With --contribute it pushes each repo's coherence into the shared field as a
 * per-repo source (`<repo>:coherence`). The field's per-source histogram then
 * carries a live, per-repo coherence the interface already renders (the /field
 * page groups sources by family), and the field's global coherence is the
 * grand total. Re-run it (a cron, a CI job, after a re-harvest) and the numbers
 * move — whenever something changes, the field changes with it.
 *
 * Modes:
 *   node scripts/repo-coherence.js                 # human scoreboard
 *   node scripts/repo-coherence.js --json          # one-line JSON
 *   node scripts/repo-coherence.js --quiet         # grand-mean number only
 *   node scripts/repo-coherence.js --contribute    # also feed the live field
 *     (set REMEMBRANCE_FIELD_URL + REMEMBRANCE_FIELD_TOKEN to reach the live one)
 *
 * Resolves the Void repo via VOID_REPO env or the sibling path, exactly like
 * ecosystem-health.js.
 */

const fs = require('fs');
const path = require('path');

function _resolveVoidRepo() {
  if (process.env.VOID_REPO && fs.existsSync(process.env.VOID_REPO)) {
    return process.env.VOID_REPO;
  }
  for (const p of [
    path.resolve(__dirname, '../../Void-Data-Compressor'),
    path.resolve(__dirname, '../../void-data-compressor'),
  ]) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Void-Data-Compressor not found — set VOID_REPO');
}

function _safeRead(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

// Void's short repo labels → the GitHub repo they stand for. Display-only; the
// field source label uses the short key so it matches the interface's existing
// per-family/per-node source mapping (e.g. `blockchain:...`).
const REPO_LABELS = {
  oracle: 'remembrance-oracle-toolkit',
  void: 'Void-Data-Compressor',
  reflector: 'Reflector-oracle-',
  blockchain: 'REMEMBRANCE-BLOCKCHAIN',
  dialer: 'Remembrance-dialer',
  swarm: 'REMEMBRANCE-AGENT-Swarm-',
  moons: 'MOONS-OF-REMEMBRANCE',
  plugger: 'REMEMBRANCE-API-Key-Plugger',
  interface: 'REMEMBRANCE-Interface',
  odysseus: 'odysseus',
};

function _clamp01(x) { return Math.max(0, Math.min(1, x)); }

function gather() {
  const voidRepo = _resolveVoidRepo();
  const records = _safeRead(path.join(voidRepo, 'cross_repo_function_records.json'));
  const out = { generatedAt: new Date().toISOString(), voidRepo, repos: [] };
  if (!records || !Array.isArray(records.records)) {
    out.error = 'cross_repo_function_records.json missing or malformed';
    return out;
  }

  const byRepo = new Map();
  let sum = 0;
  let n = 0;
  for (const r of records.records) {
    const u = r && r.coherency_v1 && typeof r.coherency_v1.unified === 'number'
      ? r.coherency_v1.unified : null;
    if (u == null) continue;
    const repo = (r.repo || 'unknown');
    let e = byRepo.get(repo);
    if (!e) { e = { repo, sum: 0, count: 0, min: 1, max: 0 }; byRepo.set(repo, e); }
    e.sum += u; e.count += 1;
    if (u < e.min) e.min = u;
    if (u > e.max) e.max = u;
    sum += u; n += 1;
  }

  out.totalRecords = n;
  out.repos = [...byRepo.values()]
    .map((e) => ({
      repo: e.repo,
      label: REPO_LABELS[e.repo] || e.repo,
      coherence: Number((e.sum / e.count).toFixed(4)),
      count: e.count,
      min: Number(e.min.toFixed(4)),
      max: Number(e.max.toFixed(4)),
    }))
    .sort((a, b) => b.coherence - a.coherence);
  // Grand total: record-weighted mean across ALL functions — the canonical
  // ecosystem coherency (matches ecosystem-health's mean_coherency_v1).
  out.grandMean = n ? Number((sum / n).toFixed(4)) : 0;
  return out;
}

function _bar(v, width = 22) {
  const filled = Math.round(_clamp01(v) * width);
  return '█'.repeat(filled) + '·'.repeat(width - filled);
}

function renderHuman(data) {
  const L = [];
  L.push('═══════════════════════════════════════════════════════════════');
  L.push(`  PER-REPO COHERENCE        grand total ${data.grandMean.toFixed(4)}`);
  L.push('═══════════════════════════════════════════════════════════════');
  L.push('');
  if (data.error) { L.push('  ' + data.error); return L.join('\n'); }
  for (const r of data.repos) {
    L.push(`  ${r.repo.padEnd(12)} ${_bar(r.coherence)} ${r.coherence.toFixed(4)}  (${r.count} fn)`);
  }
  L.push('');
  L.push(`  ${data.repos.length} repos · ${data.totalRecords.toLocaleString()} functions · grand total ${data.grandMean.toFixed(4)}`);
  L.push(`  source: ${path.join(data.voidRepo, 'cross_repo_function_records.json')}`);
  return L.join('\n');
}

// Feed each repo's coherence into the shared field as `<repo>:coherence`. When
// REMEMBRANCE_FIELD_URL is set, field-coupling's bridge mirrors each one to the
// live field; otherwise it updates only this process's in-memory engine.
function contributeAll(data, opts = {}) {
  let contribute;
  try { ({ contribute } = require('../src/core/field-coupling')); }
  catch (e) { return { ok: false, error: 'field-coupling unavailable: ' + e.message }; }
  const cost = Number.isFinite(opts.cost) ? opts.cost : 1;
  const live = !!(process.env.REMEMBRANCE_FIELD_URL || '').trim();
  const sent = [];
  for (const r of data.repos) {
    const source = `${r.repo}:coherence`;
    try {
      contribute({ source, coherence: _clamp01(r.coherence), cost });
      sent.push({ source, coherence: r.coherence });
    } catch (e) {
      sent.push({ source, error: e.message });
    }
  }
  return { ok: true, live, count: sent.length, sent };
}

function main() {
  const args = process.argv.slice(2);
  const data = gather();

  if (args.includes('--quiet')) {
    console.log(data.grandMean);
  } else if (args.includes('--json')) {
    console.log(JSON.stringify(data));
  } else {
    console.log(renderHuman(data));
  }

  if (args.includes('--contribute')) {
    const ci = args.indexOf('--cost');
    const cost = ci >= 0 ? Number(args[ci + 1]) : 1;
    const res = contributeAll(data, { cost });
    if (!res.ok) {
      console.error('\n  contribute failed: ' + res.error);
      process.exitCode = 1;
      return;
    }
    const where = res.live
      ? 'live field (' + process.env.REMEMBRANCE_FIELD_URL + ')'
      : 'local in-memory engine only — set REMEMBRANCE_FIELD_URL to reach the live field';
    console.log(`\n  contributed ${res.count} per-repo coherences → ${where}`);
  }
}

if (require.main === module) main();

module.exports = { gather, renderHuman, contributeAll };
