#!/usr/bin/env node
'use strict';

/**
 * stress-test-substrate.js — end-to-end pressure test for the
 * pattern substrate: encode → covenant → coherency → store → query.
 *
 * Generates a diverse corpus across five domains (JS code, Python
 * code, time-series, JSON data, prose), pushes it through the full
 * Oracle pipeline against a throwaway SQLite store, and reports:
 *
 *   • throughput          patterns/sec into the substrate
 *   • acceptance rate     submit() success/total
 *   • covenant pass rate  sealed === true / total
 *   • coherency profile   mean, p10, p50, p90 of accepted scores
 *   • query latency       p50 / p95 / p99 in ms
 *   • substrate size      bytes per pattern on disk
 *   • residual rate       sample-based: top-1 nearest neighbour
 *                         from a different domain → false-equivalence
 *
 * The residual rate is the single most important number — it's the
 * residual monitor's job stated as a benchmark. If it climbs above
 * 5% on a diverse corpus, the stack needs another encoder layer.
 *
 * Usage:
 *   node scripts/stress-test-substrate.js                     # 1000 patterns
 *   node scripts/stress-test-substrate.js --count 5000        # custom size
 *   node scripts/stress-test-substrate.js --probes 500        # residual sample size
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { RemembranceOracle } = require('../src/api/oracle');
const { compose, composedCosine } = require('../src/core/encoder-stack');

// ── CLI args ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf('--' + name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}
const COUNT = parseInt(arg('count', '1000'), 10);
const PROBES = parseInt(arg('probes', '300'), 10);
const QUERIES = parseInt(arg('queries', '200'), 10);

// ── Pattern generators (5 domains) ───────────────────────────────
// Each generator produces a unique pattern per seed so we never
// feed two byte-identical patterns into the substrate.

function genJS(seed) {
  const names = ['debounce', 'throttle', 'memoize', 'curry', 'compose', 'pipe', 'flatten', 'unique', 'chunk', 'zip'];
  const name = names[seed % names.length] + '_' + seed;
  const delay = 50 + (seed * 17) % 950;
  return `function ${name}(fn, delay = ${delay}) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}`;
}

function genPython(seed) {
  const names = ['parse', 'render', 'validate', 'transform', 'reduce', 'expand'];
  const name = names[seed % names.length] + '_' + seed;
  const threshold = 0.1 + (seed % 9) * 0.1;
  return `def ${name}(items, threshold=${threshold.toFixed(2)}):
    result = []
    for item in items:
        score = abs(item) / max(1, len(items))
        if score > threshold:
            result.append(item)
    return result`;
}

function genTimeSeries(seed) {
  const n = 64 + seed % 200;
  const mode = seed % 4;
  const vals = [];
  for (let i = 0; i < n; i++) {
    let v;
    if (mode === 0) v = 50 + 20 * Math.sin(i / (2 + seed % 5)); // oscillation
    else if (mode === 1) v = (1 + seed % 10) * Math.pow(1.03, i); // accumulation
    else if (mode === 2) v = (vals[i - 1] || 100) + (((seed * (i + 1)) % 11) - 5); // random walk
    else v = i < n / 2 ? 10 + i * 0.3 : 130 - (i - n / 2) * 1.1; // pump/dump
    vals.push(+v.toFixed(3));
  }
  return JSON.stringify(vals);
}

function genJSON(seed) {
  const keys = ['user', 'order', 'event', 'record', 'item'];
  const k = keys[seed % keys.length];
  const obj = {
    [k]: {
      id: seed,
      name: `${k}_${seed}`,
      values: Array.from({ length: 10 + seed % 20 }, (_, i) => ({
        idx: i,
        weight: +(((seed * (i + 1)) % 100) / 100).toFixed(3),
      })),
      meta: { created: 1700000000 + seed * 1000, tag: `t-${seed % 50}` },
    },
  };
  return JSON.stringify(obj);
}

function genProse(seed) {
  const subjects = ['The river', 'A signal', 'This pattern', 'The substrate', 'Coherency'];
  const verbs = ['flows through', 'rests inside', 'circulates within', 'echoes across', 'remembers'];
  const objects = ['the cathedral', 'the field', 'every measurement', 'the open commons', 'each fractal mirror'];
  const tails = [
    'gathering what was scattered.',
    'returning what was given.',
    'naming what was already true.',
    'composing the next altitude.',
    'holding the residual still.',
  ];
  const s = subjects[seed % subjects.length];
  const v = verbs[(seed * 3) % verbs.length];
  const o = objects[(seed * 7) % objects.length];
  const t = tails[(seed * 11) % tails.length];
  // Add a numeric tail so L3/L4 have something to read.
  const nums = Array.from({ length: 12 }, (_, i) => +(50 + 10 * Math.sin((seed + i) / 3)).toFixed(2));
  return `${s} ${v} ${o}, ${t}\n\nObservations (seed ${seed}): ${nums.join(', ')}.`;
}

const DOMAINS = [
  { name: 'js-code',    lang: 'javascript', gen: genJS },
  { name: 'py-code',    lang: 'python',     gen: genPython },
  { name: 'timeseries', lang: 'json',       gen: genTimeSeries },
  { name: 'json-data',  lang: 'json',       gen: genJSON },
  { name: 'prose',      lang: 'text',       gen: genProse },
];

// ── Pipeline ─────────────────────────────────────────────────────

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function mean(arr) {
  if (arr.length === 0) return 0;
  let s = 0; for (const x of arr) s += x;
  return s / arr.length;
}

function fmt(n, decimals = 2) {
  if (!Number.isFinite(n)) return 'n/a';
  return n.toFixed(decimals);
}

async function run() {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`  SUBSTRATE STRESS TEST  ·  ${COUNT} patterns  ·  ${PROBES} residual probes`);
  console.log('══════════════════════════════════════════════════════════════════\n');

  // ── Setup throwaway store ─────────────────────────────────────
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-stress-'));
  console.log(`  store: ${tmpDir}`);

  const oracle = new RemembranceOracle({
    baseDir: tmpDir,
    autoSeed: false,
    lifecycle: false,
    autoGrow: false,
  });

  // ── Phase 1: build corpus + push through pipeline ─────────────
  console.log(`\n  ▸ Phase 1: ingesting ${COUNT} patterns through submit()...`);

  const patterns = [];          // { code, domain, signature, id?, accepted, coherency, ms }
  const submitLatencies = [];
  let accepted = 0, covenantPassed = 0;
  const coherencyScores = [];

  const ingestStart = process.hrtime.bigint();
  for (let i = 0; i < COUNT; i++) {
    const domain = DOMAINS[i % DOMAINS.length];
    const code = domain.gen(i);
    const t0 = process.hrtime.bigint();
    let result;
    try {
      result = oracle.submit(code, {
        language: domain.lang,
        description: `${domain.name} sample ${i}`,
        tags: [domain.name, 'stress-test'],
        author: 'stress',
        autoProve: false,
      });
    } catch (e) {
      result = { success: false, accepted: false, error: e.message };
    }
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
    submitLatencies.push(elapsedMs);

    const wasAccepted = !!(result && (result.accepted || result.success));
    if (wasAccepted) accepted++;
    if (result && result.validation && result.validation.covenantSealed !== false) covenantPassed++;

    let coherency = null;
    if (result && result.entry && result.entry.coherencyScore) {
      coherency = typeof result.entry.coherencyScore === 'number'
        ? result.entry.coherencyScore
        : result.entry.coherencyScore.total;
      if (Number.isFinite(coherency)) coherencyScores.push(coherency);
    }

    patterns.push({
      idx: i,
      code,
      domain: domain.name,
      accepted: wasAccepted,
      coherency,
      ms: elapsedMs,
    });

    if (COUNT >= 500 && (i + 1) % Math.floor(COUNT / 10) === 0) {
      process.stdout.write(`    ${i + 1}/${COUNT}  (${fmt((i + 1) / (Number(process.hrtime.bigint() - ingestStart) / 1e9), 1)}/sec)\n`);
    }
  }
  const ingestSec = Number(process.hrtime.bigint() - ingestStart) / 1e9;
  const throughput = COUNT / ingestSec;

  // ── Phase 2: signature corpus for residual analysis ───────────
  console.log(`\n  ▸ Phase 2: composing 116-D signatures for residual analysis...`);
  const sigStart = process.hrtime.bigint();
  for (const p of patterns) p.signature = compose(p.code);
  const sigSec = Number(process.hrtime.bigint() - sigStart) / 1e9;
  console.log(`    ${COUNT} signatures in ${fmt(sigSec, 2)}s (${fmt(COUNT / sigSec, 1)}/sec)`);

  // ── Phase 3: residual rate by nearest-neighbour sample ────────
  console.log(`\n  ▸ Phase 3: residual rate — ${PROBES} probes × ${COUNT} neighbours...`);
  const sampleIdx = [];
  const stride = Math.max(1, Math.floor(COUNT / PROBES));
  for (let i = 0; i < COUNT && sampleIdx.length < PROBES; i += stride) sampleIdx.push(i);

  let falseEquivalences = 0, collisions = 0;
  const COLLISION_THRESHOLD = 0.99;
  const nearestSamples = [];
  for (const i of sampleIdx) {
    const a = patterns[i];
    let bestCos = -2, bestJ = -1;
    for (let j = 0; j < COUNT; j++) {
      if (j === i) continue;
      const c = composedCosine(a.signature, patterns[j].signature);
      if (c > bestCos) { bestCos = c; bestJ = j; }
    }
    if (bestJ === -1) continue;
    const b = patterns[bestJ];
    if (bestCos >= COLLISION_THRESHOLD) {
      collisions++;
      if (b.domain !== a.domain) falseEquivalences++;
    }
    nearestSamples.push({ from: a.domain, to: b.domain, cos: bestCos });
  }
  const residualRate = sampleIdx.length > 0 ? falseEquivalences / sampleIdx.length : 0;
  const collisionRate = sampleIdx.length > 0 ? collisions / sampleIdx.length : 0;

  // ── Phase 4: query latency ────────────────────────────────────
  console.log(`\n  ▸ Phase 4: ${QUERIES} queries against the substrate...`);
  const queryLatencies = [];
  let queryHits = 0;
  for (let q = 0; q < QUERIES; q++) {
    const d = DOMAINS[q % DOMAINS.length];
    const t0 = process.hrtime.bigint();
    let res;
    try {
      res = oracle.query({
        description: `${d.name} sample`,
        tags: [d.name],
        limit: 5,
        minCoherency: 0,
      });
    } catch (_) { res = []; }
    queryLatencies.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (res && res.length > 0) queryHits++;
  }

  // ── Phase 5: substrate size on disk ───────────────────────────
  function dirSize(p) {
    let total = 0;
    if (!fs.existsSync(p)) return 0;
    const stack = [p];
    while (stack.length) {
      const cur = stack.pop();
      const stat = fs.statSync(cur);
      if (stat.isDirectory()) {
        for (const name of fs.readdirSync(cur)) stack.push(path.join(cur, name));
      } else {
        total += stat.size;
      }
    }
    return total;
  }
  const substrateBytes = dirSize(path.join(tmpDir, '.remembrance'));

  // ── Sort latencies for percentiles ────────────────────────────
  const subSorted = [...submitLatencies].sort((a, b) => a - b);
  const qSorted = [...queryLatencies].sort((a, b) => a - b);
  const cohSorted = [...coherencyScores].sort((a, b) => a - b);

  // ── Per-domain breakdown ──────────────────────────────────────
  const byDomain = {};
  for (const p of patterns) {
    if (!byDomain[p.domain]) byDomain[p.domain] = { total: 0, accepted: 0, coherency: [] };
    byDomain[p.domain].total++;
    if (p.accepted) byDomain[p.domain].accepted++;
    if (p.coherency !== null) byDomain[p.domain].coherency.push(p.coherency);
  }

  // ── Report ────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  REPORT');
  console.log('══════════════════════════════════════════════════════════════════\n');

  console.log('  THROUGHPUT');
  console.log(`    ingested            ${COUNT} patterns in ${fmt(ingestSec, 2)}s`);
  console.log(`    throughput          ${fmt(throughput, 1)} patterns/sec`);
  console.log(`    submit latency      p50 ${fmt(percentile(subSorted, 0.50), 2)}ms · p95 ${fmt(percentile(subSorted, 0.95), 2)}ms · p99 ${fmt(percentile(subSorted, 0.99), 2)}ms`);

  console.log('\n  ACCEPTANCE');
  console.log(`    accepted            ${accepted}/${COUNT}  (${fmt(100 * accepted / COUNT, 1)}%)`);
  console.log(`    covenant sealed     ${covenantPassed}/${COUNT}  (${fmt(100 * covenantPassed / COUNT, 1)}%)`);
  console.log(`    coherency mean      ${fmt(mean(coherencyScores), 3)}  (n=${coherencyScores.length})`);
  if (cohSorted.length) {
    console.log(`    coherency p10/p50/p90  ${fmt(percentile(cohSorted, 0.10), 3)} · ${fmt(percentile(cohSorted, 0.50), 3)} · ${fmt(percentile(cohSorted, 0.90), 3)}`);
  }

  console.log('\n  RESIDUAL  (THE NUMBER THAT DECIDES IF L5 IS NEEDED)');
  console.log(`    probes              ${sampleIdx.length}`);
  console.log(`    collisions (cos≥${COLLISION_THRESHOLD})  ${collisions}  (${fmt(100 * collisionRate, 2)}%)`);
  console.log(`    false-equivalences  ${falseEquivalences}  (${fmt(100 * residualRate, 2)}%)`);
  const gate = residualRate <= 0.05;
  console.log(`    gate (≤5%)          ${gate ? '✓ PASS' : '✗ FAIL — residual monitor would spawn L5'}`);

  console.log('\n  QUERY');
  console.log(`    queries             ${QUERIES}`);
  console.log(`    hit rate            ${queryHits}/${QUERIES}  (${fmt(100 * queryHits / QUERIES, 1)}%)`);
  console.log(`    latency p50/p95/p99 ${fmt(percentile(qSorted, 0.50), 2)}ms · ${fmt(percentile(qSorted, 0.95), 2)}ms · ${fmt(percentile(qSorted, 0.99), 2)}ms`);

  console.log('\n  STORAGE');
  console.log(`    substrate on disk   ${(substrateBytes / 1024).toFixed(1)} KB`);
  console.log(`    per accepted        ${accepted > 0 ? (substrateBytes / accepted).toFixed(0) : 'n/a'} bytes`);

  console.log('\n  PER-DOMAIN');
  for (const [name, s] of Object.entries(byDomain)) {
    const meanCoh = s.coherency.length > 0 ? mean(s.coherency) : null;
    console.log(`    ${name.padEnd(12)} accepted=${s.accepted}/${s.total} (${fmt(100 * s.accepted / s.total, 0)}%)  mean coherency=${meanCoh !== null ? fmt(meanCoh, 3) : 'n/a'}`);
  }

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`  store retained at: ${tmpDir}`);
  console.log('  (delete manually if you do not want to inspect it)');
  console.log('══════════════════════════════════════════════════════════════════\n');

  // Exit non-zero if the residual gate fails — useful for CI.
  process.exit(gate ? 0 : 2);
}

run().catch((e) => {
  console.error('\nstress test crashed:', e);
  process.exit(1);
});
