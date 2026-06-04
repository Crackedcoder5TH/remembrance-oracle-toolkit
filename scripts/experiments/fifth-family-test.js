#!/usr/bin/env node
'use strict';

/**
 * Fifth-family test.
 *
 * Hypothesis (your prediction): write a document deliberately outside the
 * four observed registers — descriptive / imperative / declarative /
 * evidential — and the tool should either
 *   (a) refuse to cluster it with any existing family, OR
 *   (b) force it into one anyway.
 *
 * Outcome (a) is the strong test: families are real categories the
 * substrate can defend, and the tool will recognise a new register
 * when it appears.
 *
 * Outcome (b) would mean the families are weaker than they looked.
 *
 * The fifth-doc is /tmp/fifth-doc.md — a pure interrogative register
 * (open questions, no answers, no commitments).
 */

const fs = require('fs');
const path = require('path');
const { fractalCoherencyOf } = require('../../src/core/fractal-waveform.js');

const ECOSYSTEM_ROOT = process.env.ECOSYSTEM_ROOT || path.resolve(__dirname, '..', '..', '..');
const fifthPath = path.resolve(__dirname, 'fifth-doc.md');
const fifth = fs.readFileSync(fifthPath, 'utf8');

const repos = [
  'remembrance-oracle-toolkit', 'REMEMBRANCE-AGENT-Swarm-', 'MOONS-OF-REMEMBRANCE',
  'Void-Data-Compressor', 'REMEMBRANCE-Interface', 'REMEMBRANCE-BLOCKCHAIN',
  'Reflector-oracle-', 'Remembrance-dialer', 'REMEMBRANCE-API-Key-Plugger',
];

const families = { README: [], AGENT_INSTR: [], MANIFESTO: [], CAPABILITIES: [], ECOSYSTEM: [] };
for (const repo of repos) {
  for (const f of ['README.md', 'AGENTS.md', 'AI.md', 'MANIFESTO.md', 'CAPABILITIES.md', 'ECOSYSTEM.md']) {
    const full = path.join(ECOSYSTEM_ROOT, repo, f);
    if (!fs.existsSync(full)) continue;
    const c = fs.readFileSync(full, 'utf8');
    if (c.split('\n').length < 30) continue;
    const doc = { key: repo + '/' + f, content: c };
    if (f === 'README.md') families.README.push(doc);
    else if (f === 'AGENTS.md' || f === 'AI.md') families.AGENT_INSTR.push(doc);
    else if (f === 'MANIFESTO.md') families.MANIFESTO.push(doc);
    else if (f === 'CAPABILITIES.md') families.CAPABILITIES.push(doc);
    else if (f === 'ECOSYSTEM.md') families.ECOSYSTEM.push(doc);
  }
}

console.log('Measuring fifth-doc (' + fifth.split('\n').length + ' lines, INTERROGATIVE register) against each family:\n');

const results = {};
for (const [name, docs] of Object.entries(families)) {
  const cs = docs.map(d => fractalCoherencyOf(fifth, d.content));
  const mean = cs.reduce((s, x) => s + x, 0) / cs.length;
  const min = Math.min(...cs);
  const max = Math.max(...cs);
  results[name] = { mean, min, max, n: cs.length };
  console.log('  ' + name.padEnd(13) + ' n=' + cs.length + '   mean=' + mean.toFixed(3) +
              '   min=' + min.toFixed(3) + '   max=' + max.toFixed(3));
}
console.log();

// Compare to known within-family means (from family-matrix run):
const withinFamilyMeans = {
  README: 0.870, AGENT_INSTR: 0.875, MANIFESTO: 0.943,
  CAPABILITIES: 0.879, ECOSYSTEM: 1.000,
};

console.log('Family-coupling delta (fifth-doc mean MINUS within-family mean):');
console.log('  negative -> fifth doc is OUTSIDE that family');
console.log('  positive -> fifth doc is INSIDE that family');
console.log();
let minDelta = Infinity, minFamily = null;
let maxDelta = -Infinity, maxFamily = null;
for (const [name, r] of Object.entries(results)) {
  const delta = r.mean - withinFamilyMeans[name];
  console.log('  ' + name.padEnd(13) + ' delta=' + (delta >= 0 ? '+' : '') + delta.toFixed(3));
  if (delta < minDelta) { minDelta = delta; minFamily = name; }
  if (delta > maxDelta) { maxDelta = delta; maxFamily = name; }
}

console.log('\nVerdict:');
const overallMean = Object.values(results).reduce((s, r) => s + r.mean, 0) / Object.keys(results).length;
console.log('  Overall mean coherency vs existing surface: ' + overallMean.toFixed(3));
console.log('  Closest family:  ' + maxFamily + ' (delta ' + (maxDelta>=0?'+':'') + maxDelta.toFixed(3) + ')');
console.log('  Furthest family: ' + minFamily + ' (delta ' + (minFamily?minDelta.toFixed(3):'n/a') + ')');

const inAnyFamily = Object.values(results).some(r => r.mean >= 0.90);
const refused = Object.values(results).every(r => r.mean < withinFamilyMeans[Object.keys(results)[0]]); // placeholder
const distantFromAll = Object.entries(results).every(([n, r]) => r.mean < withinFamilyMeans[n]);

console.log();
if (distantFromAll) {
  console.log('  RESULT: outcome (a) — the tool refuses to place the fifth doc in any');
  console.log('          existing family. It coheres below every family\'s within-family');
  console.log('          floor. The four-family hypothesis predicted this; the tool');
  console.log('          confirms a fifth register is structurally distinct.');
} else if (inAnyFamily) {
  console.log('  RESULT: outcome (b) — the fifth doc gets absorbed into the ' + maxFamily +
              ' family. Families are weaker than the within-vs-across split suggested.');
} else {
  console.log('  RESULT: ambiguous — the fifth doc partially overlaps families but does');
  console.log('          not strongly belong to any. The four-family split is real but');
  console.log('          not sharp.');
}

// Also write to the field
try {
  const { contribute } = require('../../src/core/field-coupling.js');
  for (const [name, r] of Object.entries(results)) {
    contribute({ source: 'experiment:fifth-family:vs:' + name.toLowerCase(), coherence: r.mean, cost: r.n });
  }
  console.log('\n  [field] contributed 5 observations under experiment:fifth-family:*');
} catch (e) {
  console.log('\n  [field] could not contribute: ' + e.message);
}
