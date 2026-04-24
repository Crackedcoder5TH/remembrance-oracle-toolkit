#!/usr/bin/env node
/**
 * Cathedral Diagnostic v2 — AST-first + suppressions + auto-fix.
 *
 * Runs the full oracle audit stack against the cathedral (or any
 * specified path), applying in order:
 *
 *   1. AST-based checkers  (src/audit/ast-checkers.js)
 *        - Parses each file once, walks the tree, applies suppressions
 *        - Lower false-positive rate than regex
 *   2. Static (regex) checkers (src/audit/static-checkers.js)
 *        - Fallback for patterns the AST path doesn't cover
 *        - Suppressions applied here too (parsed from file comments)
 *   3. Dedupe across both checkers
 *        - AST finding wins when both flag the same {file, line, bugClass}
 *   4. Optional auto-fix (src/audit/auto-fix.js)
 *        - With --fix, apply generated patches to disk for AST-fixable findings
 *
 * Suppression syntax (line comments, applies to Oracle checkers only):
 *
 *   // oracle-ignore: state-mutation          ← same line, specific rule
 *   // oracle-ignore                          ← same line, all rules
 *   // oracle-ignore-next-line: security      ← next line
 *   // oracle-ignore-file: type, integration  ← rest of file (must be in first 20 lines)
 *
 * CLI:
 *   node scripts/cathedral-diagnostic.js
 *   node scripts/cathedral-diagnostic.js --fix          # apply auto-fixes to disk
 *   node scripts/cathedral-diagnostic.js --path X       # scan a subtree
 *   node scripts/cathedral-diagnostic.js --json-only    # skip markdown
 *   node scripts/cathedral-diagnostic.js --dry-fix      # show patches without writing
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// AST-first path (has suppressions baked in)
const astCheckers = require('../src/audit/ast-checkers');
// Regex fallback
const staticCheckers = require('../src/audit/static-checkers');
// Suppression machinery for the regex path
const { parseComments, isSuppressed } = require('../src/audit/suppressions');
const { parseProgram } = require('../src/audit/parser');
// Auto-fix
const { autoFixFile } = require('../src/audit/auto-fix');
// Optional: void-scan coherency
let voidScan = null;
try { voidScan = require('../src/audit/void-scan'); } catch { /* optional */ }

const REPO_ROOT = path.resolve(__dirname, '..');
const CATHEDRAL_ROOT = path.join(REPO_ROOT, 'digital-cathedral');
const OUTPUT_DIR = path.join(REPO_ROOT, '.remembrance', 'diagnostics');

const SKIP_DIRS = new Set([
  'node_modules', '.next', 'out', 'dist', 'build', '.valor',
  'public', '__tests__', 'tests', '.git',
]);
const JS_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const PY_EXT = new Set(['.py']);
const INCLUDE_EXT = new Set([...JS_EXT, ...PY_EXT]);

/**
 * Optional Python audit via ruff subprocess. Bucketed into the same
 * bug-class taxonomy the oracle uses so findings merge cleanly.
 */
const RUFF_BUG_CLASS = {
  S: 'security', B: 'edge-case', E: 'type',
  F: 'integration', W: 'type', C: 'edge-case',
  N: 'type', UP: 'type', SIM: 'edge-case',
};
function ruffToBugClass(code) {
  // Ruff codes look like S301, B008, E501. Use the alpha prefix.
  const alpha = (code.match(/^[A-Z]+/) || [])[0] || '';
  return RUFF_BUG_CLASS[alpha] || 'edge-case';
}
function ruffSeverity(code) {
  if (/^S/.test(code)) return 'high';   // Security
  if (/^(E7|E9|F)/.test(code)) return 'medium';
  return 'low';
}
function auditPyFile(filePath) {
  // Graceful fallback: if ruff isn't installed, skip Python entirely.
  const r = spawnSync('ruff', ['check', '--output-format', 'json', filePath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.error && r.error.code === 'ENOENT') return { findings: [], ruffAvailable: false };
  let parsed = [];
  try { parsed = r.stdout ? JSON.parse(r.stdout) : []; } catch { parsed = []; }
  const findings = parsed.map((p) => ({
    line: p.location?.row ?? 1,
    column: p.location?.column ?? 1,
    bugClass: ruffToBugClass(p.code || ''),
    assumption: p.message || p.code,
    reality: `${p.code}: ${p.message || 'ruff finding'}`,
    suggestion: p.fix?.message || null,
    severity: ruffSeverity(p.code || ''),
    source: 'ruff',
    ruffCode: p.code,
  }));
  return { findings, ruffAvailable: true };
}

function walkFiles(root, acc = []) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = path.join(root, entry.name);
    if (entry.isDirectory()) walkFiles(p, acc);
    else if (entry.isFile() && INCLUDE_EXT.has(path.extname(entry.name))) acc.push(p);
  }
  return acc;
}

/**
 * Run both checkers on a file, apply suppressions (AST does it internally;
 * we do it manually for static), dedupe, and return combined findings.
 *
 * Returns { findings, program } — program may be null if AST parse failed,
 * which also disables auto-fix for that file.
 */
function auditOneFile(filePath) {
  let source;
  try { source = fs.readFileSync(filePath, 'utf-8'); }
  catch { return { findings: [], program: null }; }

  // AST path — already applies suppressions.
  let program = null;
  let astFindings = [];
  try {
    program = parseProgram(source);
    const astResult = astCheckers.auditCode(source, { program });
    astFindings = (astResult.findings || []).map((f) => ({ ...f, source: 'ast' }));
  } catch (e) {
    // Parse failure → no AST findings; static path still runs below.
    if (process.env.ORACLE_DEBUG) console.warn(`[diag:ast] ${filePath}: ${e.message}`);
    program = null;
  }

  // Static regex path — manually filter via suppressions table.
  const staticResult = staticCheckers.auditCode(source);
  let staticFindings = (staticResult.findings || []).map((f) => ({ ...f, source: 'static' }));

  // Apply suppressions to static findings. Build a table from either the
  // parsed AST comments (if we have them) or a minimal comment scan of the
  // source text. The AST program gives us precise comment positions; the
  // fallback is a looser line-based scan.
  if (program && program.comments) {
    const table = parseComments(program.comments, program.lines.length);
    staticFindings = staticFindings.filter((f) => !isSuppressed(f, table));
  } else {
    // Lightweight fallback: scan for // oracle-ignore... comments by line.
    const lines = source.split(/\r?\n/);
    const directives = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/\/\/\s*(?:oracle|oracle-audit|orc)-ignore(?:-(next-line|file))?(?::\s*([\w/,-]+))?/);
      if (!m) continue;
      directives.push({ line: i + 1, scope: m[1] || 'same-line', rules: m[2] });
    }
    staticFindings = staticFindings.filter((f) => {
      for (const d of directives) {
        const targetLine = d.scope === 'next-line' ? d.line + 1 : d.line;
        if (d.scope === 'file' && d.line <= 20) {
          if (!d.rules) return false;
          const rules = d.rules.split(',').map((s) => s.trim());
          if (rules.includes(f.bugClass)) return false;
        } else if (targetLine === f.line) {
          if (!d.rules) return false;
          const rules = d.rules.split(',').map((s) => s.trim());
          if (rules.includes(f.bugClass)) return false;
        }
      }
      return true;
    });
  }

  // Dedupe — AST finding beats static when they flag the same (line, bugClass).
  const key = (f) => `${f.line}:${f.bugClass}`;
  const seen = new Map();
  for (const f of astFindings) seen.set(key(f), f);
  for (const f of staticFindings) if (!seen.has(key(f))) seen.set(key(f), f);

  return { findings: [...seen.values()], program };
}

function tryVoidScan(files) {
  if (!voidScan || !voidScan.voidScanFile) return { available: false, files: [] };
  const out = [];
  for (const f of files) {
    try {
      const r = voidScan.voidScanFile(f);
      if (r) out.push({ file: path.relative(REPO_ROOT, f), ...r });
    } catch { /* optional per-file */ }
  }
  return { available: true, files: out };
}

function summarize(fileResults) {
  const byClass = {};
  const bySeverity = {};
  const bySource = { ast: 0, static: 0 };
  let totalFindings = 0;
  let filesWithFindings = 0;
  for (const fr of fileResults) {
    if (fr.findings.length === 0) continue;
    filesWithFindings++;
    totalFindings += fr.findings.length;
    for (const f of fr.findings) {
      byClass[f.bugClass] = (byClass[f.bugClass] ?? 0) + 1;
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
      bySource[f.source] = (bySource[f.source] ?? 0) + 1;
    }
  }
  return { totalFindings, filesWithFindings, byClass, bySeverity, bySource };
}

function formatMarkdown(report) {
  const L = [];
  L.push('# Cathedral Diagnostic Report');
  L.push('');
  L.push(`Run at: ${report.generatedAt}`);
  L.push(`Mode: ${report.mode}`);
  L.push(`Files scanned: ${report.filesScanned}`);
  L.push(`Files with findings: ${report.summary.filesWithFindings}`);
  L.push(`Total findings: ${report.summary.totalFindings}`);
  if (report.fixes) {
    L.push(`Auto-fixes applied: ${report.fixes.applied} across ${report.fixes.filesPatched} files`);
  }
  L.push('');
  L.push('## Findings by bug class');
  for (const [cls, n] of Object.entries(report.summary.byClass).sort((a, b) => b[1] - a[1])) {
    L.push(`- **${cls}**: ${n}`);
  }
  L.push('');
  L.push('## Findings by severity');
  for (const sev of ['high', 'medium', 'low']) {
    const n = report.summary.bySeverity[sev] ?? 0;
    if (n > 0) L.push(`- **${sev}**: ${n}`);
  }
  L.push('');
  L.push('## Findings by source');
  L.push(`- AST-based: ${report.summary.bySource.ast ?? 0}`);
  L.push(`- Regex-based: ${report.summary.bySource.static ?? 0}`);
  L.push('');
  L.push('## Top 25 files by weighted severity');
  L.push('| File | Total | High | Medium | Low |');
  L.push('|------|-----:|-----:|------:|----:|');
  const weighted = report.files
    .filter((f) => f.findings.length > 0)
    .map((f) => {
      const by = { high: 0, medium: 0, low: 0 };
      for (const x of f.findings) by[x.severity] = (by[x.severity] ?? 0) + 1;
      const w = by.high * 1000 + by.medium * 10 + by.low;
      return { file: f.file, total: f.findings.length, by, w };
    })
    .sort((a, b) => b.w - a.w)
    .slice(0, 25);
  for (const f of weighted) {
    L.push(`| ${f.file} | ${f.total} | ${f.by.high} | ${f.by.medium} | ${f.by.low} |`);
  }
  L.push('');
  L.push('---');
  L.push(`_Re-run: \`node scripts/cathedral-diagnostic.js\`. Auto-fix: add \`--fix\`._`);
  return L.join('\n') + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json-only');
  const doFix = args.includes('--fix');
  const dryFix = args.includes('--dry-fix');
  const suggestSup = args.includes('--suggest-suppressions');
  const pathArg = args.indexOf('--path');
  const scanRoot = pathArg >= 0 && args[pathArg + 1]
    ? path.resolve(REPO_ROOT, args[pathArg + 1])
    : CATHEDRAL_ROOT;

  const mode = doFix ? 'audit+fix' : dryFix ? 'audit+dry-fix' : 'audit';
  console.log(`[diagnostic] mode=${mode} scanning ${path.relative(REPO_ROOT, scanRoot) || '.'}`);
  const files = walkFiles(scanRoot);
  console.log(`[diagnostic] ${files.length} source files queued`);
  console.log('[diagnostic] running AST + regex checkers with suppressions...');

  const fileResults = [];
  let programCache = new Map();
  let ruffAvailable = null;
  for (const f of files) {
    const ext = path.extname(f);
    if (PY_EXT.has(ext)) {
      const { findings, ruffAvailable: ra } = auditPyFile(f);
      if (ruffAvailable === null) ruffAvailable = ra;
      fileResults.push({
        file: path.relative(REPO_ROOT, f),
        absPath: f,
        findings,
      });
      continue;
    }
    const { findings, program } = auditOneFile(f);
    fileResults.push({
      file: path.relative(REPO_ROOT, f),
      absPath: f,
      findings,
    });
    if (program) programCache.set(f, program);
  }
  if (ruffAvailable === false) {
    console.log('[diagnostic] ruff not found on PATH — Python files scanned as 0-finding (install `pip install ruff` for full coverage)');
  }

  let fixes = null;
  if (doFix || dryFix) {
    console.log(`[diagnostic] ${doFix ? 'applying' : 'dry-running'} auto-fixes...`);
    let applied = 0;
    let filesPatched = 0;
    const fixedFiles = [];
    for (const fr of fileResults) {
      if (fr.findings.length === 0) continue;
      try {
        const result = autoFixFile(fr.absPath, fr.findings, { write: doFix });
        if (result.fixed > 0) {
          applied += result.fixed;
          filesPatched += 1;
          fixedFiles.push({
            file: fr.file,
            fixed: result.fixed,
            unfixed: result.unfixed.length,
          });
        }
      } catch (err) {
        if (process.env.ORACLE_DEBUG) console.warn(`[diag:fix] ${fr.file}: ${err.message}`);
      }
    }
    fixes = { applied, filesPatched, files: fixedFiles };
    console.log(`[diagnostic] ${doFix ? 'applied' : 'would apply'} ${applied} fix(es) across ${filesPatched} file(s)`);
  }

  // Post-fix — if we just wrote fixes, re-scan to show the new baseline.
  if (doFix && fixes && fixes.applied > 0) {
    console.log('[diagnostic] re-scanning after fixes...');
    fileResults.length = 0;
    for (const f of files) {
      const { findings } = auditOneFile(f);
      fileResults.push({ file: path.relative(REPO_ROOT, f), absPath: f, findings });
    }
  }

  console.log('[diagnostic] running void-scan (coherency per file)...');
  const voidScanResult = tryVoidScan(files);

  const summary = summarize(fileResults);

  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    scanRoot: path.relative(REPO_ROOT, scanRoot) || '.',
    filesScanned: files.length,
    summary,
    fixes,
    files: fileResults.map((fr) => ({ file: fr.file, findings: fr.findings })),
    voidScan: voidScanResult,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, 'cathedral-latest.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`[diagnostic] wrote ${path.relative(REPO_ROOT, jsonPath)}`);

  if (suggestSup) {
    // Emit a suppressions-draft markdown file grouping findings by file
    // with a ready-to-paste `// oracle-ignore-next-line: <class>` comment
    // for each one. Operator reviews, copies what they want, pastes into
    // source.
    const lines = [];
    lines.push('# Suppression Suggestions');
    lines.push('');
    lines.push('Generated draft. For each finding below, the suggested line');
    lines.push('contains the exact comment to paste on the line ABOVE the');
    lines.push('flagged line to silence it. Review before applying.');
    lines.push('');
    for (const fr of fileResults) {
      if (fr.findings.length === 0) continue;
      lines.push(`## ${fr.file}`);
      lines.push('');
      const byLine = new Map();
      for (const f of fr.findings) {
        const key = f.line;
        if (!byLine.has(key)) byLine.set(key, new Set());
        byLine.get(key).add(f.bugClass);
      }
      for (const [line, classes] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
        const rules = [...classes].join(', ');
        lines.push(`- line ${line} (${rules})`);
        lines.push(`  \`\`\``);
        lines.push(`  // oracle-ignore-next-line: ${rules}`);
        lines.push(`  \`\`\``);
      }
      lines.push('');
    }
    const sugPath = path.join(OUTPUT_DIR, 'cathedral-suppressions-draft.md');
    fs.writeFileSync(sugPath, lines.join('\n') + '\n');
    console.log(`[diagnostic] wrote ${path.relative(REPO_ROOT, sugPath)}`);
  }

  if (!jsonOnly) {
    const mdPath = path.join(OUTPUT_DIR, 'cathedral-latest.md');
    fs.writeFileSync(mdPath, formatMarkdown(report));
    console.log(`[diagnostic] wrote ${path.relative(REPO_ROOT, mdPath)}`);
  }

  console.log('');
  console.log(`[diagnostic] files scanned: ${report.filesScanned}`);
  console.log(`[diagnostic] files with findings: ${summary.filesWithFindings}`);
  console.log(`[diagnostic] total findings: ${summary.totalFindings}`);
  if (summary.bySeverity.high) {
    console.log(`[diagnostic] HIGH severity: ${summary.bySeverity.high}`);
  }
  console.log(`[diagnostic] by source: AST=${summary.bySource.ast ?? 0}, regex=${summary.bySource.static ?? 0}`);
}

main().catch((err) => {
  console.error('[diagnostic] fatal:', err.message);
  process.exit(1);
});
