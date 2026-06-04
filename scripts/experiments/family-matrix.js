#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { fractalCoherencyOf } = require('../../src/core/fractal-waveform.js');

const ECOSYSTEM_ROOT = process.env.ECOSYSTEM_ROOT || path.resolve(__dirname, '..', '..', '..');

const repos = [
  'remembrance-oracle-toolkit',
  'REMEMBRANCE-AGENT-Swarm-',
  'MOONS-OF-REMEMBRANCE',
  'Void-Data-Compressor',
  'REMEMBRANCE-Interface',
  'REMEMBRANCE-BLOCKCHAIN',
  'Reflector-oracle-',
  'Remembrance-dialer',
  'REMEMBRANCE-API-Key-Plugger',
];

// Group docs by RHETORICAL FAMILY — what shape they serve.
const families = {
  README: [],        // explanatory prose, what-it-is
  AGENT_INSTR: [],   // operational imperative (AGENTS.md / AI.md)
  MANIFESTO: [],     // philosophical / declarative
  CAPABILITIES: [],  // verified compliance tables
  ECOSYSTEM: [],     // shared cross-repo content
};

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

function withinFamily(docs) {
  const ps = [];
  for (let i = 0; i < docs.length; i++)
    for (let j = i + 1; j < docs.length; j++)
      ps.push(fractalCoherencyOf(docs[i].content, docs[j].content));
  const mean = ps.reduce((s, x) => s + x, 0) / ps.length;
  const min = Math.min(...ps);
  const max = Math.max(...ps);
  return { n: docs.length, pairs: ps.length, mean, min, max };
}

function crossFamily(a, b) {
  const ps = [];
  for (const x of a) for (const y of b) ps.push(fractalCoherencyOf(x.content, y.content));
  const mean = ps.reduce((s, x) => s + x, 0) / ps.length;
  return { pairs: ps.length, mean };
}

console.log('Within-family coherency (do members of the same family cohere?):');
for (const [name, docs] of Object.entries(families)) {
  const w = withinFamily(docs);
  console.log('  ' + name.padEnd(13) + ' n=' + w.n + '  pairs=' + w.pairs +
              '  mean=' + w.mean.toFixed(3) + '  min=' + w.min.toFixed(3) + '  max=' + w.max.toFixed(3));
}

console.log('\nCross-family coherency (do families differ from each other?):');
const names = Object.keys(families);
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const c = crossFamily(families[names[i]], families[names[j]]);
    console.log('  ' + names[i].padEnd(13) + ' <-> ' + names[j].padEnd(13) + '  mean=' + c.mean.toFixed(3));
  }
}
