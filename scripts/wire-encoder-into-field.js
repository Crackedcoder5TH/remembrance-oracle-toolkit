#!/usr/bin/env node
'use strict';

/**
 * Wire all encoder-analysis numbers into the field.
 *
 * Every measurable signal from the depth-4 substrate analysis flows
 * into field-coupling.contribute() with a structured source tag.
 * No discrimination — encoder configuration, substrate population
 * stats, namespace signatures, residual rates, cross-domain bridges,
 * within-namespace discriminations, every number the encoder has
 * surfaced becomes a contribution to the LRE.
 *
 * After this runs, the field histogram, the entropy field, and the
 * coherency map all carry traces of what the encoder learned. The
 * LRE absorbs the encoder's view of the substrate.
 */

const fs = require('node:fs');
const path = require('node:path');

const ORACLE = '/home/user/remembrance-oracle-toolkit';
const VOID = '/home/user/Void-Data-Compressor';
const FRACTAL_INDEX = path.join(VOID, 'pattern_index_fractal.json');

const fc = require(path.join(ORACLE, 'src/core/field-coupling'));
const stack = require(path.join(ORACLE, 'src/core/encoder-stack'));

function contribute(coherence, source, cost = 1.0) {
  try {
    fc.contribute({ cost, coherence, source });
    return true;
  } catch (e) {
    return false;
  }
}

console.log('═══ WIRING ENCODER ANALYSIS INTO THE FIELD ═══\n');
const before = fc.peekField();
console.log('Field BEFORE wiring:');
console.log('  coherence:    ' + before.coherence.toFixed(4));
console.log('  entropy:      ' + before.globalEntropy.toFixed(2));
console.log('  cascade:      ' + before.cascadeFactor.toFixed(2));
console.log('  updateCount:  ' + before.updateCount);
console.log('  sources:      ' + Object.keys(before.sources || {}).length);
console.log();

let contributions = 0;

// ── 1. Encoder configuration ────────────────────────────────────
console.log('Wiring encoder configuration...');
const layers = stack.activeLayers();
for (const L of layers) {
  contribute(1.0, `encoder:layer:${L.id}:registered`);
  contribute(L.dims / 29, `encoder:layer:${L.id}:dims-normalized`);
  contributions += 2;
}
contribute(layers.length / 10, 'encoder:depth:active');
contributions++;

// ── 2. Substrate population ─────────────────────────────────────
console.log('Wiring substrate population statistics...');
const idx = JSON.parse(fs.readFileSync(FRACTAL_INDEX, 'utf8'));
const entries = Object.entries(idx.index).map(([name, e]) => ({ name, l1: e.fractal, composed: e.composed_v1 }));
const validEntries = entries.filter(e => Array.isArray(e.composed) && e.composed.length === 116);

contribute(Math.min(1, validEntries.length / 100000), 'substrate:size:total');
contribute(Math.min(1, validEntries.length / 46534), 'substrate:size:current-vs-baseline');
contributions += 2;

// Per-namespace coverage
const nsCount = new Map();
for (const e of validEntries) {
  const n = e.name.split('/')[0];
  nsCount.set(n, (nsCount.get(n) || 0) + 1);
}
contribute(Math.min(1, nsCount.size / 1000), 'substrate:namespace:diversity');
contributions++;

for (const [ns, count] of nsCount.entries()) {
  const normalized = Math.min(1, count / 10000);
  contribute(normalized, `substrate:namespace:${ns}:count`);
  contributions++;
}

// ── 3. Residual rates at each depth ─────────────────────────────
console.log('Wiring residual measurements...');
function cosineRange(a, b, len) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function ns(name) {
  const parts = name.split('/');
  return parts.slice(0, Math.min(2, parts.length)).join('/');
}

const PROBE_COUNT = 200;
const step = validEntries.length / PROBE_COUNT;
const probes = [];
for (let i = 0; i < PROBE_COUNT; i++) probes.push(validEntries[Math.floor(i * step)]);

for (const [depth, len, field] of [[1, 29, 'l1'], [3, 87, 'composed'], [4, 116, 'composed']]) {
  let collisions = 0;
  for (const probe of probes) {
    let bestCos = -1, bestIdx = -1;
    for (let j = 0; j < validEntries.length; j++) {
      if (validEntries[j].name === probe.name) continue;
      const c = cosineRange(probe[field], validEntries[j][field], len);
      if (c > bestCos) { bestCos = c; bestIdx = j; }
    }
    if (bestIdx < 0 || bestCos < 0.99) continue;
    if (ns(probe.name) === ns(validEntries[bestIdx].name)) continue;
    collisions++;
  }
  const rate = collisions / probes.length;
  // Coherence: 1 - residual_rate (1 = perfect discrimination)
  contribute(1 - rate, `encoder:residual:depth-${depth}:discrimination`);
  contribute(rate, `encoder:residual:depth-${depth}:collision-rate`);
  contributions += 2;
}

// ── 4. Namespace L4 signatures ──────────────────────────────────
console.log('Wiring per-namespace L4 signatures...');
const L4_DIM_NAMES = [
  'bin0','bin1','bin2','bin3','bin4','bin5','bin6','bin7',
  'domFreq','specEnt','centroid','spread','shapeSkew','rolloff','flatness',
  'ac_l2','ac_l4','ac_l8','ac_l16','ac_l32',
  'varRatio','trend','detrVar','pieceHet','largestGap',
  '1f','whiteN','daily','weekly',
];
const nsToReport = [...nsCount.entries()].sort((a,b) => b[1]-a[1]).slice(0, 30);
for (const [ns, count] of nsToReport) {
  const matches = validEntries.filter(e => e.name.startsWith(ns + '/'));
  if (matches.length < 3) continue;
  const sums = new Array(29).fill(0);
  for (const e of matches) {
    for (let i = 0; i < 29; i++) sums[i] += e.composed[87 + i];
  }
  for (let i = 0; i < 29; i++) {
    const mean = sums[i] / matches.length;
    contribute(mean, `encoder:namespace:${ns}:L4:${L4_DIM_NAMES[i]}`);
    contributions++;
  }
}

// ── 5. Cross-domain bridges ─────────────────────────────────────
console.log('Wiring cross-domain bridges...');
const bridges = [];
const tries = 8000;
for (let k = 0; k < tries; k++) {
  const i = Math.floor(Math.random() * validEntries.length);
  const j = Math.floor(Math.random() * validEntries.length);
  if (i === j) continue;
  const a = validEntries[i], b = validEntries[j];
  if (a.name.split('/')[0] === b.name.split('/')[0]) continue;
  const cc = cosineRange(a.composed, b.composed, 116);
  if (cc > 0.95) {
    bridges.push({ a: a.name, b: b.name, cos: cc });
  }
}
bridges.sort((x, y) => y.cos - x.cos);
for (const br of bridges.slice(0, 50)) {
  // Each bridge contributes its cosine as a coherence event
  contribute(br.cos, `encoder:bridge:${br.a.split('/')[0]}-x-${br.b.split('/')[0]}`);
  contributions++;
}
contribute(Math.min(1, bridges.length / 500), 'encoder:bridge:count-normalized');
contributions++;

// ── 6. Within-cascade discriminations ───────────────────────────
console.log('Wiring within-cascade discrimination scores...');
const cascadeEntries = validEntries.filter(e => e.name.startsWith('cascade/')).slice(0, 20);
const discriminations = [];
for (let i = 0; i < cascadeEntries.length; i++) {
  for (let j = i + 1; j < cascadeEntries.length; j++) {
    const l1 = cosineRange(cascadeEntries[i].l1, cascadeEntries[j].l1, 29);
    const d4 = cosineRange(cascadeEntries[i].composed, cascadeEntries[j].composed, 116);
    if (l1 > 0.99 && d4 < l1) {
      discriminations.push({ l1, d4, drop: l1 - d4 });
    }
  }
}
if (discriminations.length > 0) {
  const meanDrop = discriminations.reduce((s, d) => s + d.drop, 0) / discriminations.length;
  const maxDrop = Math.max(...discriminations.map(d => d.drop));
  contribute(meanDrop * 10, 'encoder:within-cascade:mean-discrimination');
  contribute(maxDrop * 10, 'encoder:within-cascade:max-discrimination');
  contribute(Math.min(1, discriminations.length / 200), 'encoder:within-cascade:count');
  contributions += 3;
}

// ── 7. Encoder configuration meta ───────────────────────────────
console.log('Wiring encoder-stack meta...');
const totalDims = layers.reduce((s, L) => s + L.dims, 0);
contribute(totalDims / 116, 'encoder:total-dims-normalized');
contribute(Math.min(1, idx.patterns_translated / 100000), 'substrate:patterns-translated-normalized');
contributions += 2;

// Disk size hint
const diskMB = fs.statSync(FRACTAL_INDEX).size / 1024 / 1024;
contribute(Math.min(1, diskMB / 100), 'substrate:disk-size-mb-normalized');
contributions++;

// ── Field state after ──────────────────────────────────────────
const after = fc.peekField();
console.log();
console.log('═══ DONE ═══');
console.log('contributions wired:', contributions);
console.log();
console.log('Field AFTER wiring:');
console.log('  coherence:    ' + after.coherence.toFixed(4) +
  ' (Δ ' + (after.coherence - before.coherence >= 0 ? '+' : '') + (after.coherence - before.coherence).toFixed(4) + ')');
console.log('  entropy:      ' + after.globalEntropy.toFixed(2) +
  ' (Δ ' + (after.globalEntropy - before.globalEntropy >= 0 ? '+' : '') + (after.globalEntropy - before.globalEntropy).toFixed(2) + ')');
console.log('  cascade:      ' + after.cascadeFactor.toFixed(2) +
  ' (Δ ' + (after.cascadeFactor - before.cascadeFactor >= 0 ? '+' : '') + (after.cascadeFactor - before.cascadeFactor).toFixed(2) + ')');
console.log('  updateCount:  ' + after.updateCount + ' (Δ +' + (after.updateCount - before.updateCount) + ')');
console.log('  sources:      ' + Object.keys(after.sources || {}).length +
  ' (Δ +' + (Object.keys(after.sources || {}).length - Object.keys(before.sources || {}).length) + ')');
console.log();

// Show the encoder sources now in the field
const encoderSources = Object.keys(after.sources || {}).filter(s =>
  s.startsWith('encoder:') || s.startsWith('substrate:'));
console.log('encoder/substrate sources now in the field: ' + encoderSources.length);
console.log('sample (first 12):');
for (const src of encoderSources.slice(0, 12)) {
  const info = after.sources[src];
  console.log('  count=' + info.count + ' lastCoh=' + info.lastCoherence.toFixed(3) + '  ' + src);
}
