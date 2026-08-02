#!/usr/bin/env node
'use strict';

/**
 * harvest-repo-to-substrate.js — grow the Void pattern library with a
 * repo's current files, so the substrate's memory catches up to the code.
 *
 * The macro map (coherency-mapper.mapFromSubstrate) reads from
 * pattern_index_fractal.json, which is only grown on an explicit harvest
 * (every live read is growSubstrate:false to keep temp reads out of the
 * library). This is that explicit harvest: walk a repo, encode each file
 * the library hasn't witnessed yet, and add it under the repo's
 * namespace. Idempotent — a file already indexed under its namespace is
 * left untouched, so re-runs only add what's new.
 *
 * Schema per entry (matches the existing index):
 *   <namespace>/<relpath>: {
 *     fractal:     29-D  (L1 structural, the JS↔Python parity anchor)
 *     composed_v1: 116-D (depth-4 composed — what mapFromSubstrate reads)
 *     composed_v2: 145-D (depth-5 composed — the current canonical)
 *     source_file, ingested_from
 *     ledger:      { ingested_at, sequence, observed_start, observed_end, cadence }
 *                  — the TIME DIMENSION: when this datum joined the substrate + the
 *                    shared monotonic clock (see src/core/substrate-ledger.js)
 *     coherence:   0..1 coherency reading stamped at ingest
 *     tokens:      token count of the compressed datum
 *   }
 *
 * Encoding uses the CURRENT encoder (post the catastrophic-backtracking
 * fix in fractal-waveform.js). That fix is byte-identical to the old
 * encoder on 705/711 real files; the 6 that differ drift <=0.005 in one
 * dim (cosine impact ~1e-5), so new entries sit consistently alongside
 * the existing ones.
 *
 * Usage:
 *   node scripts/harvest-repo-to-substrate.js <repo-name-or-path> [--dry]
 *   node scripts/harvest-repo-to-substrate.js REMEMBRANCE-BLOCKCHAIN
 *   node scripts/harvest-repo-to-substrate.js all
 */

const fs = require('node:fs');
const path = require('node:path');
const { toFractalWaveform } = require('../src/core/fractal-waveform');
const { composedAtDepth } = require('../src/core/encoder-stack');
const SL = require('../src/core/substrate-ledger');
const {
  DEFAULT_EXTENSIONS, DEFAULT_SKIP_DIRS,
} = require('../src/core/coherency-mapper');

const HOME = process.env.HARVEST_HOME || '/home/user';
const INDEX_PATH = process.env.SUBSTRATE_PATH
  || path.join(HOME, 'Void-Data-Compressor', 'pattern_index_fractal.json');
const CONTENT_CAP = 64000;
const MIN_CHARS = 60;

// namespace ↔ repo directory (the aliases the substrate already uses)
const NS_TO_REPO = {
  'oracle': 'remembrance-oracle-toolkit',
  'void': 'Void-Data-Compressor',
  'rmb-blockchain': 'REMEMBRANCE-BLOCKCHAIN',
  'rmb-swarm': 'REMEMBRANCE-AGENT-Swarm-',
  'rmb-interface': 'REMEMBRANCE-Interface',
  'rmb-dialer': 'Remembrance-dialer',
  'rmb-plugger': 'REMEMBRANCE-API-Key-Plugger',
  'moons': 'MOONS-OF-REMEMBRANCE',
  'reflector': 'Reflector-oracle-',
  'claw': 'claw-code',
  'awesomedesign': 'awesome-design-md',
};
const REPO_TO_NS = Object.fromEntries(Object.entries(NS_TO_REPO).map(([ns, r]) => [r, ns]));

function resolveTarget(arg) {
  if (NS_TO_REPO[arg]) return { ns: arg, dir: path.join(HOME, NS_TO_REPO[arg]) };
  const base = path.basename(arg.replace(/\/+$/, ''));
  if (REPO_TO_NS[base]) return { ns: REPO_TO_NS[base], dir: path.join(HOME, base) };
  return null;
}

function walk(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) { if (!DEFAULT_SKIP_DIRS.has(e.name)) stack.push(full); }
      else if (e.isFile() && DEFAULT_EXTENSIONS.includes(path.extname(e.name).toLowerCase())) out.push(full);
    }
  }
  return out;
}

// ── Entry sanitization ──────────────────────────────────────────
// smoke-exec: does the file parse in its own language? (node --check
// for JS/CJS; py_compile for Python; other types skip — no verdict.)
// META-DEBUG: the AST audit checkers where they exist (JS/TS), high
// and medium counts recorded on the entry.
const { spawnSync } = require('node:child_process');

function sanitizeAtEntry(absFile, content) {
  const ext = path.extname(absFile).toLowerCase();
  const out = { checkedAt: new Date().toISOString() };
  let any = false;

  if (['.js', '.cjs'].includes(ext)) {
    const r = spawnSync('node', ['--check', absFile], { timeout: 10000 });
    out.syntaxOk = r.status === 0;
    any = true;
  } else if (ext === '.py') {
    const r = spawnSync('python3', ['-m', 'py_compile', absFile], { timeout: 10000 });
    out.syntaxOk = r.status === 0;
    any = true;
  } else if (ext === '.json') {
    try { JSON.parse(content); out.syntaxOk = true; } catch { out.syntaxOk = false; }
    any = true;
  }

  if (['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'].includes(ext)) {
    try {
      const audit = require('../src/audit/ast-checkers');
      const r = audit.auditCode(content, { filePath: absFile });
      const findings = (r && r.findings) || [];
      out.findingsHigh = findings.filter((x) => x.severity === 'high').length;
      out.findingsMedium = findings.filter((x) => x.severity === 'medium').length;
      any = true;
    } catch (_) { /* checker unavailable — smoke verdict stands alone */ }
  }
  return any ? out : null;
}

function cosine116(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length, 116);
  for (let i = 0; i < n; i++) { const x = a[i] || 0, y = b[i] || 0; dot += x * y; na += x * x; nb += y * y; }
  return (na > 1e-12 && nb > 1e-12) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// Fast, encode-free drift check: how many walked files are missing from
// the index, by name alone. CI-friendly — exits non-zero when drift
// exceeds --max (default 0), so a pipeline can gate on "substrate current"
// without the cost of a full harvest.
function checkDrift(targets, index, maxDrift) {
  let totalDrift = 0;
  const perRepo = [];
  for (const { ns, dir } of targets) {
    if (!fs.existsSync(dir)) continue;
    const files = walk(dir);
    let drift = 0;
    for (const f of files) {
      const key = ns + '/' + path.relative(dir, f);
      if (!index[key]) drift++;
    }
    perRepo.push({ ns, drift, total: files.length });
    totalDrift += drift;
  }
  console.log('substrate drift check:');
  for (const r of perRepo) console.log(`  ${r.ns.padEnd(16)} ${r.drift} unindexed of ${r.total}`);
  console.log(`  total drift: ${totalDrift} (threshold ${maxDrift})`);
  if (totalDrift > maxDrift) {
    console.log(`  DRIFTED — run: node scripts/harvest-repo-to-substrate.js <repo>`);
    process.exit(1);
  }
  console.log('  substrate is current.');
  process.exit(0);
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const check = args.includes('--check');
  const maxIdx = args.indexOf('--max');
  const maxDrift = maxIdx >= 0 ? (parseInt(args[maxIdx + 1], 10) || 0) : 0;
  const targetArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--max');
  if (!targetArg) {
    console.error('usage: harvest-repo-to-substrate.js <repo-name-or-path|all> [--dry|--check [--max N]]');
    process.exit(2);
  }

  const targets = targetArg === 'all'
    ? Object.keys(NS_TO_REPO).map((ns) => ({ ns, dir: path.join(HOME, NS_TO_REPO[ns]) }))
    : [resolveTarget(targetArg)].filter(Boolean);
  if (!targets.length) { console.error('unknown repo: ' + targetArg); process.exit(1); }

  let idx;
  try { idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); }
  catch (e) { console.error(`cannot read substrate index at ${INDEX_PATH}: ${e.message}`); process.exit(1); }
  const index = idx.index;
  if (check) return checkDrift(targets, index, maxDrift);
  const now = new Date().toISOString();
  const beforeTotal = Object.keys(index).length;

  // Pre-index existing composed_v1 vectors for the "what arises" resonance
  // report — nearest cross-repo neighbour of each newly harvested file.
  const composedAll = [];
  for (const [name, e] of Object.entries(index)) {
    if (e.composed_v1) composedAll.push([name, e.composed_v1]);
  }

  let added = 0, skipped = 0;
  let seq = SL.nextSequence(index);          // the substrate's own clock, shared across all ingest paths
  const arose = [];
  const _ingestCoherencies = [];

  for (const { ns, dir } of targets) {
    if (!fs.existsSync(dir)) { console.error('  skip (missing): ' + dir); continue; }
    const files = walk(dir);
    for (const f of files) {
      const rel = path.relative(dir, f);
      const key = ns + '/' + rel;
      if (index[key]) { skipped++; continue; }
      let content;
      try { content = fs.readFileSync(f, 'utf8').slice(0, CONTENT_CAP); } catch { continue; }
      if (content.length < MIN_CHARS) { skipped++; continue; }

      const fractal = Array.from(toFractalWaveform(content));
      const composed_v1 = Array.from(composedAtDepth(content, 4));
      const composed_v2 = Array.from(composedAtDepth(content, 5));

      // ── Sanitize at the doorway ────────────────────────────────
      // Witnessing and sanitizing happen at the same entry point:
      // every file the substrate accepts gets a smoke-exec (does it
      // even parse?) and, where a checker exists, a META-DEBUG pass.
      // Files are still witnessed either way — memory is not a merge
      // gate — but the verdict rides ON the entry, so downstream
      // consumers (resolve/PULL, goggles) can see what entered dirty.
      const sanitize = sanitizeAtEntry(f, content);
      if (sanitize && (sanitize.syntaxOk === false || sanitize.findingsHigh > 0)) {
        console.log(`    ⚠ entered dirty: ${key}`
          + (sanitize.syntaxOk === false ? ' [syntax]' : '')
          + (sanitize.findingsHigh ? ` [${sanitize.findingsHigh} high]` : ''));
      }

      if (!dry) {
        const entry = {
          fractal,
          source_file: key,
          ingested_from: dir,
          composed_v1,
          composed_v2,
          sanitize,
        };
        // TIME DIMENSION: stamp when this datum joined the substrate (ingest-instant
        // window for a static artifact) + its coherency reading (structural, from the
        // fractal waveform) + token count. One shared clock across all ingest paths.
        const _coh = SL.seriesCoherence(fractal);
        SL.stamp(entry, { sequence: seq++, now, content, coherence: _coh });
        // Collect for the field. Each ingested file carries a REAL structural
        // coherency, measured here from its fractal waveform — and until now
        // that reading went into the ledger and nowhere else. Following the
        // flow showed it: a harvest of 52 files moved the field's updateCount
        // by exactly 0. The highest-volume path in the ecosystem was silent.
        if (typeof _coh === 'number' && isFinite(_coh)) _ingestCoherencies.push(_coh);
        index[key] = entry;
      }
      added++;

      // What does this newly-witnessed file resonate with, cross-repo?
      let best = null, bestScore = -1;
      for (const [name, vec] of composedAll) {
        if (name.startsWith(ns + '/')) continue;   // cross-repo only
        const s = cosine116(composed_v1, vec);
        if (s > bestScore) { bestScore = s; best = name; }
      }
      if (best && bestScore >= 0.90) arose.push({ from: key, to: best, score: bestScore });
      composedAll.push([key, composed_v1]);        // future files can match this one
    }
  }

  console.log(`harvest ${dry ? '(dry run) ' : ''}complete:`);
  console.log(`  +${added} files witnessed · ${skipped} already indexed`);
  console.log(`  substrate: ${beforeTotal} → ${beforeTotal + (dry ? 0 : added)} entries`);

  if (!dry) {
    if (idx.total_patterns != null) idx.total_patterns = Object.keys(index).length;
    idx.ingestion_log = idx.ingestion_log || [];
    idx.ingestion_log.push({ at: now, added, targets: targets.map((t) => t.ns), tool: 'harvest-repo-to-substrate' });
    const tmp = INDEX_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(idx));
    fs.renameSync(tmp, INDEX_PATH);
    console.log(`  written → ${INDEX_PATH}`);

    // WITNESS THE INGEST. One aggregate reading, not one per file.
    //
    // Every harvested file carries a real structural coherency, measured
    // above from its fractal waveform. None of it reached the field: a
    // 52-file harvest moved updateCount by 0, so the ecosystem's
    // highest-volume data path was invisible to the field meant to witness
    // it.
    //
    // ONE contribution, deliberately. Contributing per file would put 52
    // readings in at once and let ingestion dominate the EMA by sheer
    // count — the exact failure reflection-scorers had with its six
    // dimensions. So: a single observation, "I ingested N files whose mean
    // structural coherency was X", with cost N because that is what the
    // work actually cost.
    //
    // SCALE NOTE — this is a WAVEFORM coherency, not a source-structure one.
    // SL.seriesCoherence measures lag-1 autocorrelation, trend r² and
    // autocorrelation strength OF THE FRACTAL SIGNATURE. It is a genuine
    // coherency (not a confidence or an amplitude standing in for one), and
    // it reads systematically LOWER than computeCoherencyScore: the goggles
    // report 0.72–0.89 on the same files this measures at ~0.19.
    //
    // Both are coherencies; they are not the same scale. The source is
    // tagged `harvest:ingest-coherency` so the two stay separable in the
    // histogram rather than silently averaging into one number that means
    // neither. Calibrating them onto a common scale is a separate job and
    // has not been done.
    if (_ingestCoherencies.length) {
      try {
        const mean = _ingestCoherencies.reduce((a, b) => a + b, 0) / _ingestCoherencies.length;
        if (isFinite(mean)) {
          require('../src/core/field-coupling').contribute({
            cost: _ingestCoherencies.length,
            coherence: Math.max(0, Math.min(1, mean)),
            source: 'harvest:ingest-coherency',
          });
          console.log(`  field: witnessed ${_ingestCoherencies.length} ingest coherencies, mean ${mean.toFixed(4)}`);
        }
      } catch (_) { /* field optional — harvest must never fail on it */ }
    }
  }

  // "Anything interesting" — the strongest unexpected cross-repo bonds.
  const cross = [...arose]
    .sort((a, b) => b.score - a.score)
    .filter((a) => a.to.split('/')[0] !== a.from.split('/')[0]);
  if (cross.length) {
    console.log('\n  strongest cross-repo resonances the harvest surfaced:');
    for (const a of cross.slice(0, 12)) {
      console.log('   ' + a.score.toFixed(3) + '  ' + a.from + '  ↔  ' + a.to);
    }
  }
}

main();
