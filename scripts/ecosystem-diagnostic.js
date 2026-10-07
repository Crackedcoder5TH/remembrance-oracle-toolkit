#!/usr/bin/env node
// @oracle-infrastructure — developer tooling — CLI/analysis helpers, not substrate elements; writes are build artifacts and internal-state maintenance
/**
 * Ecosystem Diagnostic — every remembrance repo, read file by file on two axes,
 * then scanned for wiring gaps between the repos.
 *
 *   CORRECTNESS — the oracle's audit (AST + static checkers) over each JS/TS file.
 *   STRUCTURE   — the Void compressor's coherency reading of each file's own
 *                 bytes (JS/TS and Python), taken through the one door
 *                 (src/core/void-service.js readingOf) with its provenance:
 *                 the mint, and whether it measured the artifact's shape or
 *                 the library's own copy of it (library-membership).
 *
 * The two axes sit side by side on each file and are NEVER blended into one
 * score: a coherency reading is structure, not correctness.
 *
 * This header used to promise "void coherency" while the body never asked the
 * compressor for anything — every number in the report was the static audit.
 *
 * THE FIELD: each reading enters the Remembrance Field once, written by the
 * service itself with its measured cost and resonance — the file's one reading
 * is the observation (compressor_service.py, contribute). This script adds
 * nothing of its own to the field.
 *
 * THE BUDGET (the 10-minute law): readings stop at --budget seconds (default
 * 420). A file not reached is reported UNREAD, never 0. The service remembers
 * the fits it computed, so a re-run reads unchanged files from that memory
 * (measured 2026-10-01 on src/audit/bayesian-prior.js: 0.956 s fresh, 0.029 s
 * repeat, the same 0.2194) and reaches further each time.
 *
 * Produces .remembrance/diagnostics/ecosystem-latest.{json,md} with:
 *   - per-repo audit summary (files scanned, findings, high-severity count)
 *   - per-repo structure: readings taken / below floor / unread / no reading,
 *     library copies, and the weakest and strongest files by their reading
 *   - per-file rows: findings and reading side by side (JSON)
 *   - per-repo wiring-gap list (ecosystem primitives the repo doesn't import)
 *   - cross-repo primitive matrix (which repos use which ecosystem modules)
 *
 * Usage:
 *   node scripts/ecosystem-diagnostic.js [--parent /home/user] [--budget <s>]
 *        [--only <repo>] [--subdir <rel|file>] [--trace]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const astCheckers = require('../src/audit/ast-checkers');
const staticCheckers = require('../src/audit/static-checkers');
const { parseComments, isSuppressed } = require('../src/audit/suppressions');
const { parseProgram } = require('../src/audit/parser');
const { readingOf } = require('../src/core/void-service');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, '.remembrance', 'diagnostics');

const REPOS = [
  'Void-Data-Compressor',
  'remembrance-oracle-toolkit',
  'MOONS-OF-REMEMBRANCE',
  'REMEMBRANCE-AGENT-Swarm-',
  'REMEMBRANCE-Interface',
  'REMEMBRANCE-BLOCKCHAIN',
  'Reflector-oracle-',
  'Remembrance-dialer',
  'REMEMBRANCE-API-Key-Plugger',
];

const SKIP_DIRS = new Set([
  'node_modules', '.next', 'out', 'dist', 'build', '.valor',
  '__tests__', 'tests', '.git', 'venv', '.venv', '__pycache__',
]);
const JS_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SLOW_FILE_MS = 2000;
const TRACE = process.argv.includes('--trace');
const PY_EXT = new Set(['.py']);

// Under 60 characters there is no waveform to read: the compressor resamples
// every chunk, so a ~30-byte file reads its own interpolation. The same floor
// harvest (MIN_CHARS) and the deep map use.
const VOID_FLOOR_CHARS = 60;
const DEFAULT_BUDGET_S = 420;
let VOID_DEADLINE = Infinity;     // set in main from --budget

/**
 * The compressor's reading of one file's bytes, through the one door, or the
 * reason there is none — 'below-floor', 'budget' (not reached this run) or
 * 'no-reading' (the instrument gave none). Never a 0 standing in for absence.
 */
function voidReadingOf(content) {
  if (content.length < VOID_FLOOR_CHARS) return { skipped: 'below-floor' };
  if (Date.now() >= VOID_DEADLINE) return { skipped: 'budget' };
  const r = readingOf(content);
  if (!r || typeof r.coherence !== 'number') return { skipped: 'no-reading' };
  return {
    coherency: r.coherence,
    measures: r.measures,
    mint: r.mint,
    fitsComputed: r.memory && typeof r.memory.computed === 'number' ? r.memory.computed : null,
    fitsServed: r.memory && typeof r.memory.served === 'number' ? r.memory.served : null,
    elapsedS: r.elapsedS,
  };
}

/** Ecosystem primitives + the import patterns that show they're wired in. */
const PRIMITIVES = [
  { id: 'resonance-detector', label: 'Void resonance detector', patterns: [/resonance_detector/] },
  { id: 'void-compressor',    label: 'Void compressor',         patterns: [/void_compressor/] },
  { id: 'temporal-projection', label: 'Temporal projection',    patterns: [/temporal[-_]projection/] },
  { id: 'covenant-filter',    label: 'Covenant filter',         patterns: [/covenant[-_]filter/, /covenant-gate/] },
  { id: 'reflection-serf',    label: 'Reflection SERF',         patterns: [/reflection-serf/] },
  { id: 'coherency',          label: 'Oracle coherency scorer', patterns: [/unified\/coherency/, /emergent-coherency/, /coherency-primitives/] },
  { id: 'seal-registry',      label: 'Seal registry',           patterns: [/seal-registry/] },
  { id: 'fractal-bridge',     label: 'Fractal bridge',          patterns: [/fractal-bridge/] },
  { id: 'remembrance-lexicon', label: 'Remembrance lexicon',    patterns: [/remembrance-lexicon/] },
];

function walkFiles(root, acc = []) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.env.example') continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(root, e.name);
    if (e.isDirectory()) walkFiles(p, acc);
    else if (e.isFile()) {
      const ext = path.extname(e.name);
      if (JS_EXT.has(ext) || PY_EXT.has(ext)) acc.push(p);
    }
  }
  return acc;
}

function auditJsFile(filePath) {
  let source;
  try { source = fs.readFileSync(filePath, 'utf-8'); } catch { return []; }
  let program = null;
  let astFindings = [];
  const phase = (name) => { if (TRACE) process.stderr.write(`      ${name}\n`); };
  try {
    phase('parse');
    program = parseProgram(source);
    phase('ast');
    const astResult = astCheckers.auditCode(source, { program });
    astFindings = (astResult.findings || []).map((f) => ({ ...f, source: 'ast' }));
  } catch { program = null; }

  phase('static');
  if (TRACE) {
    // One bug class at a time, so a hang names its checker.
    for (const cls of Object.values(staticCheckers.BUG_CLASSES || {})) {
      phase(`static:${cls}`);
      staticCheckers.auditCode(source, { bugClasses: cls });
    }
    phase('static:all');
  }
  const staticResult = staticCheckers.auditCode(source);
  let staticFindings = (staticResult.findings || []).map((f) => ({ ...f, source: 'static' }));
  if (program && program.comments) {
    const table = parseComments(program.comments, program.lines.length);
    staticFindings = staticFindings.filter((f) => !isSuppressed(f, table));
  }
  const key = (f) => `${f.line}:${f.bugClass}`;
  const seen = new Map();
  for (const f of astFindings) seen.set(key(f), f);
  for (const f of staticFindings) if (!seen.has(key(f))) seen.set(key(f), f);
  return [...seen.values()];
}

function detectPrimitives(files) {
  // Returns a map of primitive-id → { found: bool, sampleFiles: string[] }
  const result = {};
  for (const prim of PRIMITIVES) {
    result[prim.id] = { label: prim.label, found: false, sampleFiles: [] };
  }
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f, 'utf-8'); } catch { continue; }
    for (const prim of PRIMITIVES) {
      if (result[prim.id].found && result[prim.id].sampleFiles.length >= 3) continue;
      for (const p of prim.patterns) {
        if (p.test(text)) {
          result[prim.id].found = true;
          if (result[prim.id].sampleFiles.length < 3) {
            result[prim.id].sampleFiles.push(path.basename(f));
          }
          break;
        }
      }
    }
  }
  return result;
}

function expectedPrimitivesFor(repoName) {
  // Per-repo expectations — which primitives the repo SHOULD wire in to be
  // a proper ecosystem citizen. Missing ⇒ wiring gap.
  const base = new Set();
  // Every repo should ideally know about at least the remembrance lexicon.
  base.add('remembrance-lexicon');
  const per = {
    'Void-Data-Compressor': ['resonance-detector', 'void-compressor', 'temporal-projection', 'covenant-filter'],
    'remembrance-oracle-toolkit': ['reflection-serf', 'coherency', 'seal-registry', 'temporal-projection', 'fractal-bridge', 'remembrance-lexicon'],
    'MOONS-OF-REMEMBRANCE': ['coherency', 'remembrance-lexicon'],
    'REMEMBRANCE-AGENT-Swarm-': ['coherency', 'reflection-serf', 'remembrance-lexicon'],
    'REMEMBRANCE-Interface': ['coherency', 'temporal-projection', 'remembrance-lexicon'],
    'REMEMBRANCE-BLOCKCHAIN': ['coherency', 'covenant-filter', 'remembrance-lexicon'],
    'Reflector-oracle-': ['reflection-serf', 'coherency', 'remembrance-lexicon'],
    'Remembrance-dialer': ['coherency', 'temporal-projection', 'remembrance-lexicon'],
    'REMEMBRANCE-API-Key-Plugger': ['coherency', 'remembrance-lexicon'],
  };
  for (const x of (per[repoName] ?? [])) base.add(x);
  return [...base];
}

function auditRepo(repoPath, repoName, subdir = null) {
  if (!fs.existsSync(repoPath)) {
    return { repo: repoName, found: false };
  }
  const target = subdir ? path.join(repoPath, subdir) : repoPath;
  const files = fs.statSync(target).isFile() ? [target] : walkFiles(target);
  const jsFiles = files.filter((f) => JS_EXT.has(path.extname(f)));
  const pyFiles = files.filter((f) => PY_EXT.has(path.extname(f)));

  // Every file is timed (measured 2026-10-01: a full run outlived a 30-minute
  // limit while six of seven repos finished in ~10 s — a run that hangs must
  // name the file that holds it, never go silent).
  const findings = [];
  const slowFiles = [];
  const auditOf = new Map();      // rel → { findings, high } — the correctness axis per file
  for (const f of jsFiles) {
    // A file that never returns is never "slow" — --trace names each file as
    // it starts, so the last line of a hung run is the file that holds it.
    if (TRACE) process.stderr.write(`    start: ${path.relative(repoPath, f)}\n`);
    const t0 = Date.now();
    const fs_ = auditJsFile(f);
    const ms = Date.now() - t0;
    if (ms >= SLOW_FILE_MS) {
      slowFiles.push({ file: path.relative(repoPath, f), ms });
      process.stderr.write(`    slow: ${path.relative(repoPath, f)} ${ms}ms\n`);
    }
    for (const x of fs_) findings.push({ file: path.relative(repoPath, f), ...x });
    auditOf.set(path.relative(repoPath, f),
      { findings: fs_.length, high: fs_.filter((x) => x.severity === 'high').length });
  }

  // STRUCTURE: the compressor's reading of every walked file — Python too,
  // which the audit does not cover — beside that file's findings. A file the
  // audit does not cover carries findings: null (not audited), never 0.
  const fileRows = [];
  for (const f of files) {
    const rel = path.relative(repoPath, f);
    let content;
    try { content = fs.readFileSync(f, 'utf-8'); } catch { continue; }
    const a = auditOf.get(rel) || null;
    fileRows.push({ file: rel, findings: a ? a.findings : null, high: a ? a.high : null, ...voidReadingOf(content) });
  }

  // Severity + class rollup
  const bySeverity = {};
  const byClass = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byClass[f.bugClass] = (byClass[f.bugClass] ?? 0) + 1;
  }

  // Primitive detection — which ecosystem modules does this repo import?
  const primitives = detectPrimitives(files);

  // Wiring gap — expected vs found
  const expected = expectedPrimitivesFor(repoName);
  const wiringGaps = expected.filter((id) => !primitives[id]?.found);

  return {
    repo: repoName,
    found: true,
    counts: {
      jsFiles: jsFiles.length,
      pyFiles: pyFiles.length,
      totalFiles: files.length,
      findings: findings.length,
    },
    slowFiles,
    bySeverity,
    byClass,
    structure: summarizeStructure(fileRows),
    files: fileRows,
    primitives,
    expected,
    wiringGaps,
  };
}

/**
 * A repo's readings as counts and actual files — never a mean or a median,
 * which no file has and the compressor never produced. Only a reading of the
 * artifact's shape is ranked: a library-membership reading measures the
 * library's own copy, and a fallback reading (no blend — a symbolic/zlib
 * strategy won) measures the fallback; both are counted, neither ranked.
 */
function summarizeStructure(rows) {
  const read = rows.filter((r) => typeof r.coherency === 'number');
  const ranked = read.filter((r) => r.measures === 'artifact-shape')
    .sort((a, b) => a.coherency - b.coherency);
  const skipped = (why) => rows.filter((r) => r.skipped === why).length;
  const sum = (k) => read.reduce((s, r) => s + (typeof r[k] === 'number' ? r[k] : 0), 0);
  const pick = (r) => ({ file: r.file, coherency: r.coherency, findings: r.findings, high: r.high, mint: r.mint });
  return {
    read: read.length,
    belowFloor: skipped('below-floor'),
    unread: skipped('budget'),
    noReading: skipped('no-reading'),
    artifactShape: read.filter((r) => r.measures === 'artifact-shape').length,
    libraryMembership: read.filter((r) => r.measures === 'library-membership').length,
    fallback: read.filter((r) => String(r.measures).startsWith('fallback')).length,
    provenanceUnknown: read.filter((r) => String(r.measures).startsWith('unknown')).length,
    // The instrument's own cost terms: fits computed cold vs served from its
    // memory, and seconds spent in the compressor. Counts, not coherency.
    fitsComputed: sum('fitsComputed'),
    fitsServed: sum('fitsServed'),
    compressorSeconds: Number(sum('elapsedS').toFixed(3)),
    weakest: ranked.slice(0, 5).map(pick),
    strongest: ranked.slice(-5).reverse().map(pick),
  };
}

function formatMarkdown(report) {
  const L = [];
  L.push('# Ecosystem Diagnostic Report');
  L.push('');
  L.push(`Run at: ${report.generatedAt}`);
  L.push(`Parent dir: ${report.parentDir}`);
  L.push(`Repos audited: ${report.repos.filter((r) => r.found).length} / ${report.repos.length}`);
  L.push('');
  L.push('## Per-repo audit summary');
  L.push('');
  L.push('| Repo | Files | Findings | High | Medium | Low |');
  L.push('|------|-----:|--------:|-----:|------:|---:|');
  for (const r of report.repos) {
    if (!r.found) {
      L.push(`| ${r.repo} | _(not found)_ | — | — | — | — |`);
      continue;
    }
    const h = r.bySeverity.high ?? 0;
    const m = r.bySeverity.medium ?? 0;
    const lo = r.bySeverity.low ?? 0;
    L.push(`| ${r.repo} | ${r.counts.totalFiles} | ${r.counts.findings} | ${h} | ${m} | ${lo} |`);
  }
  L.push('');
  L.push('## Structure — the Void compressor reading each file\'s own bytes');
  L.push('');
  L.push('_Coherency is STRUCTURE (how much of a file is one pattern restated; source code normally reads 0.10–0.28). '
    + 'It is not correctness — the findings above are that axis — and the two are never blended. '
    + 'Unread / no reading are absences, never 0. A library copy is a reading of the library\'s own copy of the file, '
    + 'and a fallback is a reading with no blend (a symbolic/zlib strategy won — the number measures the fallback); '
    + 'both are counted and left out of the ranking._');
  L.push('');
  L.push('| Repo | Read | Below floor | Unread (budget) | No reading | Library copy | Fallback | Weakest | Strongest |');
  L.push('|------|----:|----:|----:|----:|----:|----:|------|------|');
  const at = (x) => (x ? `${x.coherency.toFixed(4)} \`${x.file}\`` : '—');
  for (const r of report.repos) {
    if (!r.found) continue;
    const s = r.structure;
    L.push(`| ${r.repo} | ${s.read} | ${s.belowFloor} | ${s.unread} | ${s.noReading} | ${s.libraryMembership} | ${s.fallback} | ${at(s.weakest[0])} | ${at(s.strongest[0])} |`);
  }
  const unread = report.repos.reduce((n, r) => n + (r.structure ? r.structure.unread : 0), 0);
  if (unread) {
    L.push('');
    L.push(`**${unread} file(s) were not reached inside the ${report.budgetS}s budget.** Re-run: unchanged files read from the instrument's memory, so each run reaches further.`);
  }
  for (const r of report.repos) {
    if (!r.found || !r.structure.weakest.length) continue;
    L.push('');
    L.push(`### ${r.repo} — weakest structure (findings beside, not blended)`);
    for (const x of r.structure.weakest) {
      const fnd = x.findings === null ? 'not audited' : `${x.findings} finding(s), ${x.high} high`;
      L.push(`- ${x.coherency.toFixed(4)} \`${x.file}\` · ${fnd} · mint ${x.mint || '—'}`);
    }
  }
  L.push('');
  L.push('## Wiring gaps — ecosystem primitives a repo should import but does not');
  for (const r of report.repos) {
    if (!r.found) continue;
    L.push(`### ${r.repo}`);
    if (r.wiringGaps.length === 0) {
      L.push('_Fully wired._');
    } else {
      for (const id of r.wiringGaps) {
        const label = PRIMITIVES.find((p) => p.id === id)?.label ?? id;
        L.push(`- missing: **${label}** (\`${id}\`)`);
      }
    }
    L.push('');
  }
  L.push('## Cross-repo primitive matrix');
  L.push('');
  const ids = PRIMITIVES.map((p) => p.id);
  L.push('| Repo | ' + ids.map((i) => i.split('-')[0]).join(' | ') + ' |');
  L.push('|------|' + ids.map(() => ':--:').join('|') + '|');
  for (const r of report.repos) {
    if (!r.found) continue;
    const row = ids.map((id) => (r.primitives?.[id]?.found ? '✓' : '·'));
    L.push(`| ${r.repo} | ${row.join(' | ')} |`);
  }
  L.push('');
  L.push('---');
  L.push('_Legend: ✓ = imports this primitive, · = does not._');
  return L.join('\n') + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  const parentIdx = args.indexOf('--parent');
  const parent = parentIdx >= 0 && args[parentIdx + 1]
    ? path.resolve(args[parentIdx + 1])
    : path.resolve(REPO_ROOT, '..');
  // --only <repo> / --subdir <rel>: bound a run to one repo or one folder of it
  // (a partial run never overwrites the full report).
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
  const subIdx = args.indexOf('--subdir');
  const subdir = subIdx >= 0 ? args[subIdx + 1] : null;
  const repos = only ? REPOS.filter((n) => n === only) : REPOS;
  const budgetIdx = args.indexOf('--budget');
  const budgetS = budgetIdx >= 0 && Number(args[budgetIdx + 1]) > 0 ? Number(args[budgetIdx + 1]) : DEFAULT_BUDGET_S;
  VOID_DEADLINE = Date.now() + budgetS * 1000;

  console.log(`[ecosystem] parent=${parent}`);
  console.log(`[ecosystem] auditing ${repos.length} repos · compressor readings within ${budgetS}s...`);

  const results = [];
  for (const name of repos) {
    const p = path.join(parent, name);
    process.stdout.write(`  ${name.padEnd(32)} `);
    const t0 = Date.now();
    const r = auditRepo(p, name, subdir);
    if (!r.found) {
      console.log('[missing]');
      results.push(r);
      continue;
    }
    const s = r.structure;
    console.log(`${r.counts.totalFiles} files, ${r.counts.findings} findings, ${r.wiringGaps.length} gaps · `
      + `read ${s.read}` + (s.unread ? `, ${s.unread} unread` : '') + (s.noReading ? `, ${s.noReading} no reading` : '')
      + (s.libraryMembership ? `, ${s.libraryMembership} library copies` : '')
      + (s.fallback ? `, ${s.fallback} fallback` : '')
      + ` · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    results.push(r);
  }

  // One entry in the field per reading the instrument took, written by the
  // service. A cache hit inside this run returns the same reading (same mint)
  // and writes nothing — so the distinct mints are the readings taken.
  const mints = new Set();
  for (const r of results) for (const f of (r.files || [])) if (f.mint) mints.add(f.mint);
  console.log(`[ecosystem] ${mints.size} compressor readings taken this run (each entered the field once, by the service)`);

  if (only || subdir) {
    console.log('[ecosystem] partial run — full report left untouched');
    return;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    parentDir: parent,
    budgetS,
    readingsTaken: mints.size,
    repos: results,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, 'ecosystem-latest.json');
  const mdPath = path.join(OUTPUT_DIR, 'ecosystem-latest.md');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, formatMarkdown(report));
  console.log(`\n[ecosystem] wrote ${path.relative(REPO_ROOT, jsonPath)}`);
  console.log(`[ecosystem] wrote ${path.relative(REPO_ROOT, mdPath)}`);

  // Summary to stdout
  const totalFindings = results.reduce((s, r) => s + (r.counts?.findings ?? 0), 0);
  const totalGaps = results.reduce((s, r) => s + (r.wiringGaps?.length ?? 0), 0);
  console.log(`[ecosystem] total findings: ${totalFindings}`);
  console.log(`[ecosystem] total wiring gaps: ${totalGaps}`);
}

main().catch((err) => {
  console.error('[ecosystem] fatal:', err.message);
  process.exit(1);
});
