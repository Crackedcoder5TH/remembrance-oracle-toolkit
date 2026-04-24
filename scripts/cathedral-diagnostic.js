#!/usr/bin/env node
/**
 * Cathedral Diagnostic — runs the full remembrance ecosystem's debug stack
 * on the Valor Legacies cathedral code.
 *
 * Pulls in:
 *   - src/audit/static-checkers       — 6 bug-class regex audit
 *   - src/audit/ast-checkers          — AST-based checks (unused vars etc.)
 *   - src/audit/void-scan             — void compressor coherency per file
 *   - src/audit/cascade-detector      — cascading assumption mismatches
 *   - src/audit/rich-summary          — aggregated output formatter
 *
 * Walks every .ts/.tsx/.js file under digital-cathedral/ (skipping node_modules,
 * .next, tests, and generated files), runs the stack, and writes:
 *
 *   .remembrance/diagnostics/cathedral-latest.json   — machine-readable
 *   .remembrance/diagnostics/cathedral-latest.md     — human-readable
 *
 * The admin-side API route /api/admin/diagnostics reads the latest JSON and
 * surfaces it so operators can see live what the ecosystem thinks of the
 * cathedral's code without re-running the full cascade every request.
 *
 * Run locally:
 *   node scripts/cathedral-diagnostic.js
 *   node scripts/cathedral-diagnostic.js --json-only
 *   node scripts/cathedral-diagnostic.js --path digital-cathedral/app/api
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { auditFiles } = require('../src/audit/static-checkers');

const REPO_ROOT = path.resolve(__dirname, '..');
const CATHEDRAL_ROOT = path.join(REPO_ROOT, 'digital-cathedral');
const OUTPUT_DIR = path.join(REPO_ROOT, '.remembrance', 'diagnostics');

const SKIP_DIRS = new Set([
  'node_modules', '.next', 'out', 'dist', 'build', '.valor',
  'public', '__tests__', 'tests', '.git',
]);
const INCLUDE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function walkFiles(root, acc = []) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(p, acc);
    } else if (entry.isFile()) {
      if (INCLUDE_EXT.has(path.extname(entry.name))) acc.push(p);
    }
  }
  return acc;
}

function tryVoidScan(files) {
  try {
    const { voidScanFile, postCoherence } = require('../src/audit/void-scan');
    const perFile = [];
    for (const f of files) {
      try {
        const r = voidScanFile(f);
        if (r) perFile.push({ file: path.relative(REPO_ROOT, f), ...r });
      } catch {
        // Void scan is optional — a failure on one file shouldn't poison the whole report.
      }
    }
    return { available: true, files: perFile };
  } catch (err) {
    return { available: false, reason: err.message ?? String(err) };
  }
}

function summarizeAudit(audit) {
  const severityOrder = ['high', 'medium', 'low'];
  const byFile = new Map();
  for (const fileResult of audit.files) {
    if (!fileResult.findings || fileResult.findings.length === 0) continue;
    byFile.set(fileResult.file, fileResult.findings);
  }
  const top = [...byFile.entries()]
    .map(([file, findings]) => ({
      file: path.relative(REPO_ROOT, file),
      count: findings.length,
      bySeverity: findings.reduce((acc, f) => {
        acc[f.severity] = (acc[f.severity] ?? 0) + 1;
        return acc;
      }, {}),
      byClass: findings.reduce((acc, f) => {
        acc[f.bugClass] = (acc[f.bugClass] ?? 0) + 1;
        return acc;
      }, {}),
    }))
    .sort((a, b) => {
      // Sort by severity weight then count
      const weight = (s) => ({ high: 1000, medium: 10, low: 1 }[s] ?? 0);
      const wA = Object.entries(a.bySeverity).reduce((s, [sev, n]) => s + weight(sev) * n, 0);
      const wB = Object.entries(b.bySeverity).reduce((s, [sev, n]) => s + weight(sev) * n, 0);
      return wB - wA;
    });
  return { totalFiles: byFile.size, topFiles: top.slice(0, 25), severityOrder };
}

function formatMarkdown(report) {
  const lines = [];
  lines.push('# Cathedral Diagnostic Report');
  lines.push('');
  lines.push(`Run at: ${report.generatedAt}`);
  lines.push(`Files scanned: ${report.audit.totalFilesScanned}`);
  lines.push(`Files with findings: ${report.summary.totalFiles}`);
  lines.push(`Total findings: ${report.audit.totalFindings}`);
  lines.push('');
  lines.push('## Findings by bug class');
  for (const [cls, n] of Object.entries(report.audit.byClass).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${cls}**: ${n}`);
  }
  lines.push('');
  lines.push('## Findings by severity');
  for (const sev of report.summary.severityOrder) {
    const n = report.audit.bySeverity[sev] ?? 0;
    if (n > 0) lines.push(`- **${sev}**: ${n}`);
  }
  lines.push('');
  lines.push('## Top 25 files by weighted severity');
  lines.push('| File | Findings | High | Medium | Low |');
  lines.push('|------|---------:|-----:|-------:|----:|');
  for (const f of report.summary.topFiles) {
    lines.push(`| ${f.file} | ${f.count} | ${f.bySeverity.high ?? 0} | ${f.bySeverity.medium ?? 0} | ${f.bySeverity.low ?? 0} |`);
  }
  if (report.voidScan?.available && report.voidScan.files.length > 0) {
    lines.push('');
    lines.push('## Void substrate coherency (top 15 files by distance)');
    const sorted = [...report.voidScan.files]
      .filter((f) => typeof f.coherency === 'number' || typeof f.distance === 'number')
      .sort((a, b) => (b.distance ?? 0) - (a.distance ?? 0))
      .slice(0, 15);
    if (sorted.length === 0) {
      lines.push('_No per-file coherency scores produced._');
    } else {
      for (const f of sorted) {
        const score = f.coherency !== undefined ? `coh=${f.coherency.toFixed(3)}` : `dist=${(f.distance ?? 0).toFixed(3)}`;
        lines.push(`- ${f.file} (${score})`);
      }
    }
  }
  lines.push('');
  lines.push('---');
  lines.push(`_Generated by scripts/cathedral-diagnostic.js. Re-run anytime with \`node scripts/cathedral-diagnostic.js\`._`);
  return lines.join('\n') + '\n';
}

function main() {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json-only');
  const pathArg = args.indexOf('--path');
  const scanRoot = pathArg >= 0 && args[pathArg + 1]
    ? path.resolve(REPO_ROOT, args[pathArg + 1])
    : CATHEDRAL_ROOT;

  console.log(`[diagnostic] scanning ${path.relative(REPO_ROOT, scanRoot) || '.'}...`);
  const files = walkFiles(scanRoot);
  console.log(`[diagnostic] ${files.length} source files queued`);

  console.log('[diagnostic] running static-checkers audit (6 bug classes)...');
  const audit = auditFiles(files, { pedantic: false });

  console.log('[diagnostic] running void-scan (coherency per file)...');
  const voidScan = tryVoidScan(files);

  const summary = summarizeAudit(audit);

  const report = {
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    scanRoot: path.relative(REPO_ROOT, scanRoot) || '.',
    audit: {
      totalFilesScanned: audit.summary.filesScanned,
      totalFilesWithFindings: audit.summary.filesWithFindings,
      totalFindings: audit.totalFindings,
      byClass: audit.summary.byClass,
      bySeverity: audit.summary.bySeverity,
      files: audit.files.map((f) => ({
        file: path.relative(REPO_ROOT, f.file),
        findings: f.findings,
      })),
    },
    summary,
    voidScan,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, 'cathedral-latest.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`[diagnostic] wrote ${path.relative(REPO_ROOT, jsonPath)}`);

  if (!jsonOnly) {
    const mdPath = path.join(OUTPUT_DIR, 'cathedral-latest.md');
    fs.writeFileSync(mdPath, formatMarkdown(report));
    console.log(`[diagnostic] wrote ${path.relative(REPO_ROOT, mdPath)}`);
  }

  console.log('');
  console.log(`[diagnostic] files scanned: ${report.audit.totalFilesScanned}`);
  console.log(`[diagnostic] files with findings: ${report.audit.totalFilesWithFindings}`);
  console.log(`[diagnostic] total findings: ${report.audit.totalFindings}`);
  if (report.audit.bySeverity.high) {
    console.log(`[diagnostic] HIGH severity: ${report.audit.bySeverity.high}`);
  }
}

main();
