#!/usr/bin/env node
'use strict';

/**
 * stress-test-fractal-search.js — head-to-head benchmark of the
 * new FractalIndex (in-memory 116-D cosine, field-tool encoder)
 * against oracle's existing description+tag query() path.
 *
 * Builds a synthetic substrate of N patterns across five domains,
 * loads them into the FractalIndex, then runs M queries through
 * both paths and reports:
 *
 *   • build time / memory footprint of the index
 *   • per-query latency p50/p95/p99 for both paths
 *   • top-1 domain-match accuracy for both paths
 *   • speedup factor (description+tag → fractal)
 *
 * Usage:
 *   node scripts/stress-test-fractal-search.js               # 10000 / 500
 *   node scripts/stress-test-fractal-search.js --count 5000 --queries 200
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { RemembranceOracle } = require('../src/api/oracle');
const { FractalIndex } = require('../src/core/fractal-index');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf('--' + name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}
const COUNT = parseInt(arg('count', '10000'), 10);
const QUERIES = parseInt(arg('queries', '500'), 10);

// ── Pattern generators (mirror substrate stress test) ────────────

function genJS(seed) {
  const names = ['debounce', 'throttle', 'memoize', 'curry', 'compose', 'pipe', 'flatten', 'unique', 'chunk', 'zip'];
  return `function ${names[seed % names.length]}_${seed}(fn, delay = ${50 + (seed * 17) % 950}) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}`;
}

function genPython(seed) {
  const names = ['parse', 'render', 'validate', 'transform', 'reduce', 'expand'];
  return `def ${names[seed % names.length]}_${seed}(items, threshold=${(0.1 + (seed % 9) * 0.1).toFixed(2)}):
    result = []
    for item in items:
        if abs(item) > threshold: result.append(item)
    return result`;
}

function genTimeSeries(seed) {
  const n = 64 + seed % 200;
  const vals = [];
  for (let i = 0; i < n; i++) {
    const v = 50 + 20 * Math.sin(i / (2 + seed % 5));
    vals.push(+v.toFixed(3));
  }
  return JSON.stringify(vals);
}

function genJSON(seed) {
  return JSON.stringify({
    [['user', 'order', 'event', 'record', 'item'][seed % 5]]: {
      id: seed,
      values: Array.from({ length: 10 + seed % 20 }, (_, i) => ({ idx: i, w: ((seed * (i + 1)) % 100) / 100 })),
      meta: { tag: `t-${seed % 50}` },
    },
  });
}

function genProse(seed) {
  const nums = Array.from({ length: 12 }, (_, i) => +(50 + 10 * Math.sin((seed + i) / 3)).toFixed(2));
  return `The pattern circulates within the field, returning what was given.\nObservations ${seed}: ${nums.join(', ')}.`;
}

const DOMAINS = [
  { name: 'js-code',    lang: 'javascript', gen: genJS },
  { name: 'py-code',    lang: 'python',     gen: genPython },
  { name: 'timeseries', lang: 'json',       gen: genTimeSeries },
  { name: 'json-data',  lang: 'json',       gen: genJSON },
  { name: 'prose',      lang: 'text',       gen: genProse },
];

// ── Stat helpers ─────────────────────────────────────────────────

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function fmt(n, d = 2) { return Number.isFinite(n) ? n.toFixed(d) : 'n/a'; }

// ── Run ──────────────────────────────────────────────────────────

async function run() {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`  FRACTAL SEARCH BENCHMARK  ·  ${COUNT} patterns  ·  ${QUERIES} queries`);
  console.log('══════════════════════════════════════════════════════════════════\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-fractal-'));
  console.log(`  store: ${tmpDir}`);

  const oracle = new RemembranceOracle({
    baseDir: tmpDir, autoSeed: false, lifecycle: false, autoGrow: false,
  });

  // ── Phase 1: ingest corpus through oracle ─────────────────────
  console.log(`\n  ▸ Phase 1: ingesting ${COUNT} patterns through oracle.submit()...`);
  const submitted = []; // { id, text, domain }
  const ingestStart = process.hrtime.bigint();
  for (let i = 0; i < COUNT; i++) {
    const d = DOMAINS[i % DOMAINS.length];
    const text = d.gen(i);
    const r = oracle.submit(text, {
      language: d.lang,
      description: `${d.name} sample ${i}`,
      tags: [d.name, 'bench'],
      author: 'bench',
      autoProve: false,
    });
    const id = (r && r.entry && r.entry.id) || `bench-${i}`;
    submitted.push({ id, text, domain: d.name });
    if (COUNT >= 1000 && (i + 1) % Math.floor(COUNT / 5) === 0) {
      process.stdout.write(`    ${i + 1}/${COUNT}\n`);
    }
  }
  const ingestSec = Number(process.hrtime.bigint() - ingestStart) / 1e9;
  console.log(`    ${COUNT} ingested in ${fmt(ingestSec, 1)}s  (${fmt(COUNT / ingestSec, 1)}/sec)`);

  // ── Phase 2: build FractalIndex via bulk rebuild ──────────────
  console.log(`\n  ▸ Phase 2: building FractalIndex (field-tool encoder, 116-D)...`);
  const idx = new FractalIndex();
  const buildStart = process.hrtime.bigint();
  idx.rebuild(submitted.map(s => ({ id: s.id, text: s.text })));
  const buildSec = Number(process.hrtime.bigint() - buildStart) / 1e9;
  const memMB = idx.memoryBytes() / 1024 / 1024;
  console.log(`    ${idx.size()} indexed in ${fmt(buildSec, 2)}s  (${fmt(idx.size() / buildSec, 0)} encodes/sec)`);
  console.log(`    memory: ${fmt(memMB, 2)} MB  (${fmt(memMB * 1024 * 1024 / idx.size(), 0)} bytes/pattern)`);

  // Map id → domain for top-1 accuracy scoring.
  const idToDomain = new Map(submitted.map(s => [s.id, s.domain]));

  // ── Phase 3: query both paths ─────────────────────────────────
  console.log(`\n  ▸ Phase 3: ${QUERIES} queries via oracle.query() (description+tag)...`);
  const oldLatencies = [];
  let oldDomainHits = 0;
  for (let q = 0; q < QUERIES; q++) {
    const seed = COUNT + q;
    const d = DOMAINS[q % DOMAINS.length];
    const queryText = d.gen(seed);
    const t0 = process.hrtime.bigint();
    let res;
    try {
      res = oracle.query({ description: `${d.name} sample`, tags: [d.name], limit: 5, minCoherency: 0 });
    } catch (_) { res = []; }
    oldLatencies.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (res && res.length > 0) {
      const topDomain = idToDomain.get(res[0].id);
      if (topDomain === d.name) oldDomainHits++;
    }
    void queryText; // not used by the old path
  }

  console.log(`\n  ▸ Phase 4: ${QUERIES} queries via FractalIndex.search() (116-D cosine)...`);
  const newLatencies = [];
  let newDomainHits = 0;
  for (let q = 0; q < QUERIES; q++) {
    const seed = COUNT + q;
    const d = DOMAINS[q % DOMAINS.length];
    const queryText = d.gen(seed);
    const t0 = process.hrtime.bigint();
    const res = idx.search(queryText, { topK: 5 });
    newLatencies.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (res.length > 0) {
      const topDomain = idToDomain.get(res[0].id);
      if (topDomain === d.name) newDomainHits++;
    }
  }

  // ── Sort latencies for percentiles ────────────────────────────
  const oSorted = [...oldLatencies].sort((a, b) => a - b);
  const nSorted = [...newLatencies].sort((a, b) => a - b);

  // ── Report ────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  REPORT');
  console.log('══════════════════════════════════════════════════════════════════\n');

  console.log('  INDEX');
  console.log(`    patterns                  ${idx.size()}`);
  console.log(`    build time                ${fmt(buildSec, 2)}s  (${fmt(idx.size() / buildSec, 0)} encodes/sec)`);
  console.log(`    memory footprint          ${fmt(memMB, 2)} MB  (${fmt(memMB * 1024 * 1024 / idx.size(), 0)} bytes/pattern)`);

  console.log('\n  QUERY LATENCY');
  console.log(`    oracle.query()  p50/p95/p99   ${fmt(percentile(oSorted, 0.50), 2)}ms / ${fmt(percentile(oSorted, 0.95), 2)}ms / ${fmt(percentile(oSorted, 0.99), 2)}ms`);
  console.log(`    FractalIndex    p50/p95/p99   ${fmt(percentile(nSorted, 0.50), 2)}ms / ${fmt(percentile(nSorted, 0.95), 2)}ms / ${fmt(percentile(nSorted, 0.99), 2)}ms`);
  const speedup50 = percentile(oSorted, 0.50) / Math.max(0.001, percentile(nSorted, 0.50));
  const speedup99 = percentile(oSorted, 0.99) / Math.max(0.001, percentile(nSorted, 0.99));
  console.log(`    speedup (p50 / p99)       ${fmt(speedup50, 1)}× / ${fmt(speedup99, 1)}×`);

  console.log('\n  TOP-1 DOMAIN ACCURACY  (did the top match come from the same domain?)');
  console.log(`    oracle.query()            ${oldDomainHits}/${QUERIES}  (${fmt(100 * oldDomainHits / QUERIES, 1)}%)`);
  console.log(`    FractalIndex              ${newDomainHits}/${QUERIES}  (${fmt(100 * newDomainHits / QUERIES, 1)}%)`);

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`  store retained at: ${tmpDir}`);
  console.log('══════════════════════════════════════════════════════════════════\n');
}

run().catch(e => { console.error(e); process.exit(1); });
