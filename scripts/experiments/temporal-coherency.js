#!/usr/bin/env node
'use strict';

/**
 * Point the field at the time axis. For each repo's canonical README:
 *   - walk git history
 *   - compute adjacent-step and long-arc coherency
 *   - contribute the readings to the field under:
 *       temporal:<repo>:adjacent
 *       temporal:<repo>:arc
 *       temporal:<repo>:convergence   (late_half - early_half)
 *
 * After this the field carries a temporal axis it can introspect.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { fractalCoherencyOf } = require('../../src/core/fractal-waveform.js');
const { contribute, peekField } = require('../../src/core/field-coupling.js');

const ECOSYSTEM_ROOT = process.env.ECOSYSTEM_ROOT || path.resolve(__dirname, '..', '..', '..');

const repos = [
  'remembrance-oracle-toolkit', 'REMEMBRANCE-AGENT-Swarm-', 'MOONS-OF-REMEMBRANCE',
  'Void-Data-Compressor', 'REMEMBRANCE-Interface', 'REMEMBRANCE-BLOCKCHAIN',
  'Reflector-oracle-', 'Remembrance-dialer', 'REMEMBRANCE-API-Key-Plugger',
];

function sh(cmd, cwd) {
  try { return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { return null; }
}

function thin(arr, n) {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}

const before = peekField();
const beforeCoh = (before && before.coherence) || null;
const beforeSources = (before && before.sources && before.sources.length) || 0;

const summary = [];
for (const repo of repos) {
  const repoDir = path.join(ECOSYSTEM_ROOT, repo);
  if (!fs.existsSync(path.join(repoDir, 'README.md'))) continue;
  const log = sh('git log --reverse --pretty=format:"%H|%ai" -- README.md', repoDir);
  if (!log) continue;
  const commits = log.trim().split('\n').filter(Boolean).map(l => {
    const [hash, date] = l.split('|'); return { hash, date };
  });
  if (commits.length < 3) continue;
  const sampled = thin(commits, 12);
  const versions = [];
  for (const c of sampled) {
    const v = sh('git show ' + c.hash + ':README.md', repoDir);
    if (v && v.split('\n').length >= 10) versions.push({ ...c, content: v });
  }
  if (versions.length < 3) continue;

  const adj = [];
  for (let i = 0; i < versions.length - 1; i++) adj.push(fractalCoherencyOf(versions[i].content, versions[i+1].content));
  const meanAdj = adj.reduce((s, x) => s + x, 0) / adj.length;
  const arc = fractalCoherencyOf(versions[0].content, versions[versions.length-1].content);
  const half = Math.floor(adj.length / 2);
  const early = adj.slice(0, half).reduce((s,x)=>s+x,0) / Math.max(1, half);
  const late  = adj.slice(half).reduce((s,x)=>s+x,0) / Math.max(1, adj.length - half);
  const convergence = late - early;

  // Adjacent and arc ARE coherence readings (0..1 by construction).
  // Convergence is a DERIVATIVE of coherence — not a coherence reading
  // itself. Recording it as 0.5+delta would inject a low-coherence signal
  // that has nothing to do with the underlying field. Skip it; log it
  // separately as analysis output instead.
  contribute({ source: 'temporal:' + repo + ':adjacent', coherence: meanAdj, cost: 1 });
  contribute({ source: 'temporal:' + repo + ':arc', coherence: arc, cost: 1 });

  summary.push({ repo, versions: versions.length, meanAdj, arc, convergence });
  console.log('  [field] ' + repo.padEnd(28) +
              ' adj=' + meanAdj.toFixed(3) + '  arc=' + arc.toFixed(3) +
              '  delta=' + (convergence>=0?'+':'') + convergence.toFixed(3));
}

const after = peekField();
const afterCoh = (after && after.coherence) || null;
const afterSources = (after && after.sources && after.sources.length) || 0;

console.log('\n=== TEMPORAL AXIS WRITTEN TO FIELD ===');
console.log('Sources contributed: ' + (summary.length * 2) + ' (adjacent + arc per repo; convergence is a derivative, not a coherence reading)');
console.log('Field global coherence BEFORE: ' + (beforeCoh != null ? beforeCoh.toFixed(4) : 'n/a') + '  (' + beforeSources + ' sources)');
console.log('Field global coherence AFTER:  ' + (afterCoh != null ? afterCoh.toFixed(4) : 'n/a') + '  (' + afterSources + ' sources)');
if (beforeCoh != null && afterCoh != null) {
  const delta = afterCoh - beforeCoh;
  console.log('Delta: ' + (delta>=0?'+':'') + delta.toFixed(4) +
              (delta >= 0 ? '   (temporal axis RAISED global coherency — covenant absorbs the new axis)' :
                            '   (temporal axis LOWERED global coherency — flagging for inspection)'));
}

const meanAdjAll = summary.reduce((s, t) => s + t.meanAdj, 0) / summary.length;
const meanArcAll = summary.reduce((s, t) => s + t.arc, 0) / summary.length;
const meanConv = summary.reduce((s, t) => s + t.convergence, 0) / summary.length;
console.log('\nTemporal axis readings:');
console.log('  adjacent-step mean across repos: ' + meanAdjAll.toFixed(3));
console.log('  long-arc mean across repos:      ' + meanArcAll.toFixed(3));
console.log('  convergence mean:                ' + (meanConv>=0?'+':'') + meanConv.toFixed(3));

// Persist as JSON for the experiment record
const out = {
  ts: new Date().toISOString(),
  experiment: 'temporal-coherency',
  file: 'README.md',
  per_repo: summary,
  aggregate: { meanAdjacent: meanAdjAll, meanArc: meanArcAll, meanConvergence: meanConv },
  field: { before: beforeCoh, after: afterCoh, delta: (beforeCoh != null && afterCoh != null) ? afterCoh - beforeCoh : null },
};
const outPath = path.resolve(__dirname, 'temporal-experiment.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('\nWrote ' + outPath);
