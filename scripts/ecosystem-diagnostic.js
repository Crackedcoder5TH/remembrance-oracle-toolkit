#!/usr/bin/env node
/**
 * Ecosystem Diagnostic — run the oracle's audit + void coherency across every
 * remembrance repo, then scan for wiring gaps between them.
 *
 * Produces .remembrance/diagnostics/ecosystem-<DATE>.{json,md} with:
 *   - per-repo audit summary (files scanned, findings, high-severity count)
 *   - per-repo wiring-gap list (ecosystem primitives the repo doesn't import)
 *   - cross-repo resonance (which repos use which ecosystem modules)
 *
 * Usage:
 *   node scripts/ecosystem-diagnostic.js
 *   node scripts/ecosystem-diagnostic.js --parent /home/user
 */

'use strict';

const fs = require('fs');
const path = require('path');

const astCheckers = require('../src/audit/ast-checkers');
const staticCheckers = require('../src/audit/static-checkers');
const { parseComments, isSuppressed } = require('../src/audit/suppressions');
const { parseProgram } = require('../src/audit/parser');

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
const PY_EXT = new Set(['.py']);

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
  try {
    program = parseProgram(source);
    const astResult = astCheckers.auditCode(source, { program });
    astFindings = (astResult.findings || []).map((f) => ({ ...f, source: 'ast' }));
  } catch { program = null; }

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

function auditRepo(repoPath, repoName) {
  if (!fs.existsSync(repoPath)) {
    return { repo: repoName, found: false };
  }
  const files = walkFiles(repoPath);
  const jsFiles = files.filter((f) => JS_EXT.has(path.extname(f)));
  const pyFiles = files.filter((f) => PY_EXT.has(path.extname(f)));

  const findings = [];
  for (const f of jsFiles) {
    const fs_ = auditJsFile(f);
    for (const x of fs_) findings.push({ file: path.relative(repoPath, f), ...x });
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
    bySeverity,
    byClass,
    primitives,
    expected,
    wiringGaps,
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

  console.log(`[ecosystem] parent=${parent}`);
  console.log(`[ecosystem] auditing ${REPOS.length} repos...`);

  const results = [];
  for (const name of REPOS) {
    const p = path.join(parent, name);
    process.stdout.write(`  ${name.padEnd(32)} `);
    const r = auditRepo(p, name);
    if (!r.found) {
      console.log('[missing]');
      results.push(r);
      continue;
    }
    console.log(`${r.counts.totalFiles} files, ${r.counts.findings} findings, ${r.wiringGaps.length} gaps`);
    results.push(r);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    parentDir: parent,
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
