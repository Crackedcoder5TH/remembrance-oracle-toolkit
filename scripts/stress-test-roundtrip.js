#!/usr/bin/env node
'use strict';

/**
 * stress-test-roundtrip.js — proves the oracle substrate and the
 * field-tool package serve identical fractal-signature search
 * results across the wire.
 *
 * Pipeline:
 *   1. Spin a throwaway oracle, submit N patterns through
 *      oracle.submit() — populates the in-memory FractalIndex.
 *   2. oracle.exportSignatures() → JSON-safe array of {id, vec}.
 *   3. Load that array into a fresh field-tool FractalIndex via
 *      loadSignatures().
 *   4. Run M queries through BOTH indexes (using the oracle-encoded
 *      query vector handed to field-tool's searchVec()), and check:
 *        - top-1 id agreement on every query
 *        - score drift bounded by Float64 precision
 *        - per-side query latency
 *
 * Pass criteria: 100% top-1 id agreement, max score drift < 1e-9.
 * Anything looser is a covenant break and exits non-zero.
 *
 * Usage:
 *   node scripts/stress-test-roundtrip.js                # 1000 / 200
 *   node scripts/stress-test-roundtrip.js --count 5000
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { RemembranceOracle } = require('../src/api/oracle');
const { FractalIndex: FieldToolFractalIndex } =
  require('../packages/field-tool/src/fractal-index');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf('--' + name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}
const COUNT = parseInt(arg('count', '1000'), 10);
const QUERIES = parseInt(arg('queries', '200'), 10);

// ── Pattern generators (mirror the earlier benchmarks) ───────────

function genJS(seed) {
  const names = ['debounce', 'throttle', 'memoize', 'curry', 'compose', 'pipe', 'flatten', 'unique', 'chunk', 'zip'];
  return `function ${names[seed % names.length]}_${seed}(fn, delay = ${50 + (seed * 17) % 950}) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); }; }`;
}
function genPython(seed) {
  const names = ['parse', 'render', 'validate', 'transform', 'reduce', 'expand'];
  return `def ${names[seed % names.length]}_${seed}(items, t=${(0.1 + (seed % 9) * 0.1).toFixed(2)}):\n    return [i for i in items if abs(i) > t]`;
}
function genTimeSeries(seed) {
  const n = 64 + seed % 200;
  const vals = [];
  for (let i = 0; i < n; i++) vals.push(+(50 + 20 * Math.sin(i / (2 + seed % 5))).toFixed(3));
  return JSON.stringify(vals);
}
function genJSON(seed) {
  return JSON.stringify({
    [['user', 'order', 'event', 'record', 'item'][seed % 5]]: {
      id: seed,
      values: Array.from({ length: 10 + seed % 20 }, (_, i) => ({ idx: i, w: ((seed * (i + 1)) % 100) / 100 })),
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

function pct(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0; }
function fmt(n, d = 2) { return Number.isFinite(n) ? n.toFixed(d) : 'n/a'; }

async function run() {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`  ROUND-TRIP PARITY BENCHMARK  ·  ${COUNT} patterns  ·  ${QUERIES} queries`);
  console.log('  oracle.fractalSearch()  ↔  field-tool FractalIndex');
  console.log('══════════════════════════════════════════════════════════════════\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-rt-'));
  console.log(`  store: ${tmpDir}`);

  // ── 1. ingest through oracle ──────────────────────────────────
  console.log(`\n  ▸ ingesting ${COUNT} patterns through oracle.submit()...`);
  const oracle = new RemembranceOracle({
    baseDir: tmpDir, autoSeed: false, lifecycle: false, autoGrow: false,
  });
  const submitted = [];
  const ingestStart = process.hrtime.bigint();
  for (let i = 0; i < COUNT; i++) {
    const d = DOMAINS[i % DOMAINS.length];
    const r = oracle.submit(d.gen(i), {
      language: d.lang, description: `${d.name} ${i}`, tags: [d.name, 'rt'], author: 'rt', autoProve: false,
    });
    submitted.push({ id: String(r.entry.id), domain: d.name });
  }
  const ingestSec = Number(process.hrtime.bigint() - ingestStart) / 1e9;
  console.log(`    ${COUNT} ingested in ${fmt(ingestSec, 1)}s  (oracle index now ${oracle._fractalIndex.size()} entries)`);

  // ── 2. export and load into field-tool ────────────────────────
  console.log(`\n  ▸ exporting signatures and loading into field-tool FractalIndex...`);
  const exportStart = process.hrtime.bigint();
  const sigs = oracle.exportSignatures();
  const exportMs = Number(process.hrtime.bigint() - exportStart) / 1e6;
  const exportBytes = JSON.stringify(sigs).length;

  const ft = new FieldToolFractalIndex();
  const loadStart = process.hrtime.bigint();
  const loaded = ft.loadSignatures(sigs);
  const loadMs = Number(process.hrtime.bigint() - loadStart) / 1e6;

  console.log(`    exported ${sigs.length} signatures  (${fmt(exportMs, 1)}ms, ${fmt(exportBytes / 1024, 1)} KB JSON-safe)`);
  console.log(`    loaded   ${loaded} signatures  (${fmt(loadMs, 1)}ms)`);
  console.log(`    field-tool memory ${fmt(ft.memoryBytes() / 1024 / 1024, 2)} MB`);

  // ── 3. parity check + per-side latency ────────────────────────
  console.log(`\n  ▸ ${QUERIES} parity queries...`);
  const oracleLat = [], fieldLat = [];
  let idAgreement = 0, scoreDrift = 0;
  let topkOverlap = 0;
  const KTOP = 5;

  for (let q = 0; q < QUERIES; q++) {
    const seed = COUNT + q;
    const d = DOMAINS[q % DOMAINS.length];
    const queryText = d.gen(seed);

    // Oracle side — full pipeline.
    const t0 = process.hrtime.bigint();
    const oracleHits = oracle.fractalSearch(queryText, { topK: KTOP, hydrate: false });
    oracleLat.push(Number(process.hrtime.bigint() - t0) / 1e6);

    // Field-tool side — receives the same query vector the oracle used.
    // The oracle's index already encoded it; we mirror that work here
    // to give field-tool a vector it can pass directly to searchVec().
    // In production the oracle would just hand the precomputed vector
    // over the wire; for benchmark fidelity we re-encode locally.
    const qVec = oracle._fractalIndex._encode(queryText);
    const t1 = process.hrtime.bigint();
    const fieldHits = ft.searchVec(qVec, { topK: KTOP });
    fieldLat.push(Number(process.hrtime.bigint() - t1) / 1e6);

    if (oracleHits.length && fieldHits.length) {
      if (oracleHits[0].id === fieldHits[0].id) idAgreement++;
      const drift = Math.abs(oracleHits[0].score - fieldHits[0].score);
      if (drift > scoreDrift) scoreDrift = drift;
      const fieldIds = new Set(fieldHits.map(h => h.id));
      let overlap = 0;
      for (const h of oracleHits) if (fieldIds.has(h.id)) overlap++;
      topkOverlap += overlap / KTOP;
    }
  }

  const oSorted = [...oracleLat].sort((a, b) => a - b);
  const fSorted = [...fieldLat].sort((a, b) => a - b);

  // ── Report ────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  REPORT');
  console.log('══════════════════════════════════════════════════════════════════\n');

  console.log('  TRANSPORT');
  console.log(`    signatures exported       ${sigs.length}`);
  console.log(`    JSON payload              ${fmt(exportBytes / 1024, 1)} KB  (${fmt(exportBytes / sigs.length, 0)} bytes/pattern)`);
  console.log(`    export → load round-trip  ${fmt(exportMs + loadMs, 1)} ms total`);

  console.log('\n  PARITY (the covenant)');
  console.log(`    top-1 id agreement        ${idAgreement}/${QUERIES}  (${fmt(100 * idAgreement / QUERIES, 1)}%)`);
  console.log(`    top-${KTOP} overlap            ${fmt(100 * topkOverlap / QUERIES, 1)}%`);
  console.log(`    max top-1 score drift     ${scoreDrift.toExponential(2)}  (Float64 noise floor is ~1e-15)`);

  console.log('\n  LATENCY');
  console.log(`    oracle.fractalSearch      p50/p95/p99   ${fmt(pct(oSorted, 0.50))}ms / ${fmt(pct(oSorted, 0.95))}ms / ${fmt(pct(oSorted, 0.99))}ms`);
  console.log(`    field-tool searchVec      p50/p95/p99   ${fmt(pct(fSorted, 0.50))}ms / ${fmt(pct(fSorted, 0.95))}ms / ${fmt(pct(fSorted, 0.99))}ms`);

  console.log('\n══════════════════════════════════════════════════════════════════');
  const pass = (idAgreement === QUERIES) && (scoreDrift < 1e-9);
  if (pass) {
    console.log('  ✓ COVENANT INTACT — both packages serve identical results from');
    console.log('    the same substrate signatures. Published field-tool and the');
    console.log('    oracle substrate are visibly one system.');
  } else {
    console.log('  ✗ COVENANT BREAK — round-trip parity failed.');
    console.log(`    id agreement: ${idAgreement}/${QUERIES}   score drift: ${scoreDrift.toExponential(2)}`);
  }
  console.log('══════════════════════════════════════════════════════════════════\n');
  process.exit(pass ? 0 : 2);
}

run().catch(e => { console.error(e); process.exit(1); });
