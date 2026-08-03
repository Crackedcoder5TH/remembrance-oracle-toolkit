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

function resolveTarget(arg, explicitNs) {
  // An explicit namespace lets ANY directory be witnessed — used for
  // reference corpora that are not ecosystem repos: a language's own
  // standard library or type definitions, written by that language's
  // maintainers. Those describe how working code is SUPPOSED to be
  // structured, which is what the substrate should learn a language from,
  // rather than from whatever application code happens to be at hand.
  //
  //   harvest /usr/lib/python3.11 --as lang-python
  if (explicitNs) {
    const dir = path.resolve(arg);
    if (!fs.existsSync(dir)) return null;
    return { ns: explicitNs, dir };
  }
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

// ── The coherency reading ────────────────────────────────────────────────
// Every coherency the substrate stores comes off the Void compressor, reading
// the artifact's OWN BYTES as a uint8 waveform — the same quantisation
// goggle-web.js uses, so ingest and live reads land on one scale.
//
// Not the fractal vector: 29 heterogeneous feature slots are not 29 samples,
// and the compressor resamples every chunk to 256, so a 29-slot input is
// upsampled ~9× and the interpolation manufactures the smoothness it then
// reports. Measured on 48 files, the compressor's reading on the fractal
// vector (mean 0.582) correlates r = -0.229 with its reading on the same
// files' bytes (mean 0.186). The bytes are the artifact; the feature vector
// is a description of it.
// One client for the instrument, shared with field-tool and anything else that
// needs a reading (src/core/void-service.js). It starts the service when cold,
// caches by content hash, and returns null rather than a substitute. Files
// still enter the substrate when no reading is available — memory is not gated
// on the instrument — they simply enter without a coherency, which is honest.
const _voidService = require('../src/core/void-service');
let _warnedNoReading = false;

function voidCoherenceOf(content) {
  const c = _voidService.coherencyOf(content);
  if (c === null && !_warnedNoReading) {
    _warnedNoReading = true;
    console.error('  ⚠ no coherency reading available — files will be witnessed WITHOUT one.');
  }
  return c;
}

function cosine116(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length, 116);
  for (let i = 0; i < n; i++) { const x = a[i] || 0, y = b[i] || 0; dot += x * y; na += x * x; nb += y * y; }
  return (na > 1e-12 && nb > 1e-12) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// Is this file too small to carry a waveform? The harvest floor. Under
// MIN_CHARS there is no signal to compress: the compressor chunks and
// resamples to 256, so a ~30-byte file is upsampled ~8× and the reading
// reports the interpolation rather than the artifact. Shared by the harvest
// loop and the drift check so BOTH use one definition of "will never be
// indexed" — otherwise `--check` counts files a harvest will never add.
function belowFloor(absFile) {
  try {
    return fs.readFileSync(absFile, 'utf8').slice(0, CONTENT_CAP).length < MIN_CHARS;
  } catch {
    return false;   // unreadable is a real problem, not a floor case
  }
}

// Fast, encode-free drift check: how many walked files are missing from
// the index, by name alone. CI-friendly — exits non-zero when drift
// exceeds --max (default 0), so a pipeline can gate on "substrate current"
// without the cost of a full harvest.
//
// DRIFT IS WHAT A HARVEST WOULD FIX. This used to count every walked file
// absent from the index, which folded in files that are absent BY DESIGN:
// the 30-byte AI-tool pointer stubs (`CLAUDE.md` → "See AGENTS.md") and
// empty `__init__.py` sit under the MIN_CHARS floor, so no harvest will
// ever index them. Counting them as drift made the two counters contradict
// each other — `--check` reported "15 unindexed" while a harvest of the
// same repos reported "+0 witnessed", and neither was wrong. They were
// answering different questions under the same word. Actionable drift is
// now the gate; below-floor files are reported separately and never gate.
// Re-take the coherency on entries that are ALREADY in the substrate.
//
// The harvest loop is idempotent by key, so a file whose reading was taken
// the wrong way is never revisited — the bad number is sticky. Every entry
// harvested before the compressor became the source carries
// `seriesCoherence(fractal)`, which measures the encoder's slot ordering
// rather than the file (r = -0.025 against the compressor's reading of the
// same bytes). This re-reads those files through the compressor in place.
//
// Only the coherency changes; the fractal/composed vectors and the ledger
// sequence are untouched, so nothing downstream re-indexes.
function restamp(targets, idx, index) {
  let done = 0, gone = 0, floored = 0, unread = 0;
  const before = [], after = [];
  for (const { ns, dir } of targets) {
    if (!fs.existsSync(dir)) { console.error('  skip (missing): ' + dir); continue; }
    for (const f of walk(dir)) {
      const key = ns + '/' + path.relative(dir, f);
      const entry = index[key];
      if (!entry) continue;
      let content;
      try { content = fs.readFileSync(f, 'utf8').slice(0, CONTENT_CAP); } catch { gone++; continue; }
      if (content.length < MIN_CHARS) { floored++; continue; }
      const c = voidCoherenceOf(content);
      if (c == null) { unread++; continue; }
      if (typeof entry.coherence === 'number') before.push(entry.coherence);
      entry.coherence = SL.clamp01(c);
      entry.coherence_source = 'void:compress_signal';
      after.push(entry.coherence);
      done++;
      if (done % 250 === 0) console.log(`    …${done} re-read`);
    }
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  console.log(`restamp: ${done} entries re-read through the compressor`);
  if (gone) console.log(`  ${gone} indexed file(s) no longer on disk — left as-is`);
  if (floored) console.log(`  ${floored} below floor — left as-is`);
  if (unread) console.log(`  ${unread} unread (service down) — left as-is, NOT zeroed`);
  if (before.length) console.log(`  mean coherence  ${mean(before).toFixed(4)} → ${mean(after).toFixed(4)}`);
  if (done) {
    idx.ingestion_log = idx.ingestion_log || [];
    idx.ingestion_log.push({
      at: new Date().toISOString(), restamped: done,
      targets: targets.map((t) => t.ns), tool: 'harvest-repo-to-substrate --restamp',
      note: 'coherency re-read off the Void compressor (was seriesCoherence on the fractal feature vector)',
    });
    const tmp = INDEX_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(idx));
    fs.renameSync(tmp, INDEX_PATH);
    console.log(`  written → ${INDEX_PATH}`);
  }
  process.exit(0);
}

function checkDrift(targets, index, maxDrift) {
  let totalDrift = 0;
  let totalFloor = 0;
  const perRepo = [];
  for (const { ns, dir } of targets) {
    if (!fs.existsSync(dir)) continue;
    const files = walk(dir);
    let drift = 0, floor = 0;
    for (const f of files) {
      const key = ns + '/' + path.relative(dir, f);
      if (index[key]) continue;
      if (belowFloor(f)) floor++; else drift++;
    }
    perRepo.push({ ns, drift, floor, total: files.length });
    totalDrift += drift;
    totalFloor += floor;
  }
  console.log('substrate drift check:');
  for (const r of perRepo) {
    console.log(`  ${r.ns.padEnd(16)} ${r.drift} unindexed of ${r.total}`
      + (r.floor ? `  (+${r.floor} below floor, not harvestable)` : ''));
  }
  console.log(`  total drift: ${totalDrift} (threshold ${maxDrift})`);
  if (totalFloor) {
    console.log(`  below floor: ${totalFloor} file(s) under ${MIN_CHARS} chars — no waveform to measure, excluded by design`);
  }
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
  const doRestamp = args.includes('--restamp');
  const maxIdx = args.indexOf('--max');
  const maxDrift = maxIdx >= 0 ? (parseInt(args[maxIdx + 1], 10) || 0) : 0;
  const asIdx = args.indexOf('--as');
  const explicitNs = asIdx >= 0 ? args[asIdx + 1] : null;
  const targetArg = args.find((a, i) => !a.startsWith('--')
    && args[i - 1] !== '--max' && args[i - 1] !== '--as');
  if (!targetArg) {
    console.error('usage: harvest-repo-to-substrate.js <repo-name-or-path|all> [--dry|--check [--max N]|--restamp] [--as <namespace>]');
    process.exit(2);
  }

  const targets = (targetArg === 'all' && !explicitNs)
    ? Object.keys(NS_TO_REPO).map((ns) => ({ ns, dir: path.join(HOME, NS_TO_REPO[ns]) }))
    : [resolveTarget(targetArg, explicitNs)].filter(Boolean);
  if (!targets.length) { console.error('unknown repo: ' + targetArg); process.exit(1); }

  let idx;
  try { idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); }
  catch (e) { console.error(`cannot read substrate index at ${INDEX_PATH}: ${e.message}`); process.exit(1); }
  const index = idx.index;
  if (check) return checkDrift(targets, index, maxDrift);
  if (doRestamp) return restamp(targets, idx, index);
  const now = new Date().toISOString();
  const beforeTotal = Object.keys(index).length;

  // Pre-index existing composed_v1 vectors for the "what arises" resonance
  // report — nearest cross-repo neighbour of each newly harvested file.
  const composedAll = [];
  for (const [name, e] of Object.entries(index)) {
    if (e.composed_v1) composedAll.push([name, e.composed_v1]);
  }

  let added = 0, skipped = 0, floored = 0;
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
      // Below the floor is NOT "already indexed". Counting it as `skipped`
      // is what made a harvest report "+0 witnessed · N already indexed"
      // for files the index had never seen.
      if (content.length < MIN_CHARS) { floored++; continue; }

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
        // window for a static artifact) + its coherency reading + token count.
        // One shared clock across all ingest paths.
        //
        // THE COHERENCY COMES OFF THE COMPRESSOR, READING THE FILE'S BYTES.
        //
        // This used to be `SL.seriesCoherence(fractal)` — and that was a
        // category error, not a scale difference. The 29-slot fractal vector is
        // not a waveform: its slots are NAMED, HETEROGENEOUS FEATURES (charge,
        // valence, mass, spin, phase, … structurality) in whatever order
        // fractal-waveform.js lists them. Slot 7 (`group`) is the constant 11
        // for every file in the ecosystem. seriesCoherence reads lag-1
        // autocorrelation and fits a trend over the slot INDEX, so on a feature
        // vector it measures the encoder's authoring order, not the file.
        //
        // Measured, 48 repo files (scratchpad permutation test):
        //   • permuting the slot order — the same relabeling for every file —
        //     changed the reading by 0.115 on average, LARGER than the metric's
        //     whole spread across files (sd 0.113); r(before, after) = 0.036.
        //   • r(seriesCoherence(fractal), compressor-on-file-bytes) = -0.025.
        //     Not a noisy proxy for the real reading. Unrelated to it.
        //
        // It read ~0.19–0.23, and the compressor reads ~0.186 on the same
        // files, which is why this survived so long: the right magnitude by
        // coincidence. seriesCoherence is CORRECT on a genuine time series
        // (against synthetic controls it tracks the compressor within ~0.1 from
        // pure sine 1.000 down to white noise 0.152) — it was simply pointed at
        // something that is not one.
        const _coh = voidCoherenceOf(content);
        SL.stamp(entry, { sequence: seq++, now, content, coherence: _coh });
        // LABEL THE PROVENANCE. The value came off the compressor, but only
        // the restamp path was recording that, so 661 freshly-harvested
        // entries carried a real reading with coherence_source unset — you
        // could not tell from the entry where its number came from. Under a
        // rule that says coherency comes from one place, an unlabelled
        // reading is indistinguishable from a substituted one.
        if (typeof _coh === 'number' && isFinite(_coh)) {
          entry.coherence_source = 'void:compress_signal';
        }
        // Collect for the field — but only real readings. If the compressor is
        // unreachable, `voidCoherenceOf` returns null and this file enters the
        // substrate with NO coherency rather than a fabricated one. A reading
        // that did not come off the compressor is not a coherency.
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
  console.log(`  +${added} files witnessed · ${skipped} already indexed`
    + (floored ? ` · ${floored} below floor (<${MIN_CHARS} chars, no waveform)` : ''));
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
    // SOURCE NOTE — this is the Void compressor's reading, taken off each
    // file's bytes, using the same quantisation goggle-web.js uses so ingest
    // and live reads are the same measurement.
    //
    // The compressor is the ONLY producer of coherency in this ecosystem.
    // avg_coherence is not "a kind of" coherency to be reconciled with others;
    // it is the number. How the instrument computes it internally is the
    // instrument's business — quoting its internals as though they DEFINED
    // coherency is a category error, and an earlier version of this note made
    // it. Everything downstream transforms this number to see where coherency
    // is, how it behaves and how it flows; nothing downstream produces one.
    //
    // An even earlier version claimed the ingest reading and the goggles'
    // 0.72–0.89 were "two coherencies on different scales" awaiting
    // calibration. There were never two. The ingest reading was
    // seriesCoherence over the 29-slot fractal FEATURE VECTOR, correlating
    // r = -0.025 with the compressor on the same files — not a rival scale, a
    // number that was not coherency at all.
    //
    // computeCoherencyScore is likewise NOT a coherency: it scores structural
    // validity (syntax, completeness, consistency, AST) and reads r = -0.313
    // against the compressor. Tagged `harvest:ingest-coherency` so the true
    // reading stays identifiable in the histogram.
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
