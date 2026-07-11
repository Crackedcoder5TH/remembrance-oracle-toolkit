'use strict';

/**
 * repo-audit.js — audit any repository by git URL or local path: the
 * one entry point behind the `remembrance-audit` CLI and the
 * `oracle_audit_repo` MCP tool, so a client audit can be run from a
 * phone, a chat, or a terminal and produce the same report.
 *
 * It is a thin orchestration over machinery that already earned its
 * place — nothing here re-implements analysis:
 *   - coherency-mapper.mapProjectCoherency — the deep macro map
 *     (structure distribution, orphans/duplicates via the shared
 *     pairwise engine, cross-system bridges)
 *   - audit/ast-checkers.auditFiles — the meta-debug correctness axis
 *     (parse channel; every finding carries line + fix suggestion)
 *
 * CONFIDENTIALITY: client code never grows the substrate. The mapper
 * already reads with growSubstrate: false; this module adds no path
 * that writes any part of the audited repo into the pattern library,
 * the oracle store, or the field beyond a single anonymous
 * completed-audit event (counts only, no content).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { mapProjectCoherency } = require('../core/coherency-mapper');
const { auditFiles } = require('./ast-checkers');
let fc = null;
try { fc = require('../core/field-coupling'); } catch (_) { /* field optional */ }

const CHECKER_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx']);
const DEFAULT_MAX_CHECKER_FILES = 400;
const DEFAULT_MAX_FINDINGS = 60;

function _isGitUrl(target) {
  return /^(https?:\/\/|git@|ssh:\/\/)/.test(target) || /\.git$/.test(target);
}

function _walkSources(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (_e) { continue; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (CHECKER_EXTENSIONS.has(path.extname(e.name))) out.push(p);
    }
  }
  return out;
}

/**
 * Audit a repository.
 *
 * @param {string} target — git URL (cloned --depth 1 to a temp dir,
 *   removed afterwards) or a local directory path
 * @param {object} [opts]
 *   maxCheckerFiles?: number = 400 — cap on files run through the
 *     correctness checkers (largest-first once sorted by size)
 *   maxFindings?:     number = 60  — cap on findings in the report
 *   keepClone?:       boolean = false — keep the temp clone (debugging)
 * @returns {object} the audit report
 */
function auditRepo(target, opts = {}) {
  const t0 = Date.now();
  const maxCheckerFiles = opts.maxCheckerFiles || DEFAULT_MAX_CHECKER_FILES;
  const maxFindings = opts.maxFindings || DEFAULT_MAX_FINDINGS;

  let dir = target;
  let cloned = false;
  if (_isGitUrl(target)) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remembrance-audit-'));
    execFileSync('git', ['clone', '--depth', '1', target, dir], { stdio: 'pipe', timeout: 300000 });
    cloned = true;
  }
  if (!fs.existsSync(dir)) {
    return { ok: false, error: `target not found: ${target}` };
  }

  try {
    // 1. The macro map — structure, wiring, duplication, bridges.
    const map = mapProjectCoherency(dir, { sourceTag: 'repo-audit:read' });

    // 2. The correctness axis — parse-channel checkers over source files.
    const sources = _walkSources(dir)
      .map((f) => ({ f, size: (() => { try { return fs.statSync(f).size; } catch (_e) { return 0; } })() }))
      .filter((s) => s.size > 0 && s.size < 512 * 1024)
      .sort((a, b) => b.size - a.size)
      .slice(0, maxCheckerFiles)
      .map((s) => s.f);
    const checked = auditFiles(sources, {});
    const findings = [];
    for (const r of checked.files || []) {
      for (const f of r.findings || []) {
        findings.push({
          file: path.relative(dir, r.file || r.filePath || ''),
          line: f.line,
          severity: f.severity,
          bugClass: f.bugClass,
          issue: f.reality || f.assumption || '',
          fix: f.suggestion || null,
        });
      }
    }
    const sevRank = { high: 0, medium: 1, low: 2 };
    findings.sort((a, b) => (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3) || a.file.localeCompare(b.file));

    const cohs = (map.files || []).map((x) => x.coherence).filter((c) => typeof c === 'number').sort((a, b) => a - b);
    const weakest = (map.files || [])
      .filter((x) => typeof x.coherence === 'number')
      .sort((a, b) => a.coherence - b.coherence)
      .slice(0, 5)
      .map((x) => ({ file: x.rel, coherence: +x.coherence.toFixed(3) }));

    const report = {
      ok: true,
      target,
      audited: {
        files: map.filesAudited,
        checkerFiles: sources.length,
        checkerFilesTotal: _walkSources(dir).length,
      },
      structure: {
        meanCoherence: +(map.meanCoherence || 0).toFixed(3),
        medianCoherence: cohs.length ? +cohs[Math.floor(cohs.length / 2)].toFixed(3) : null,
        weakest,
        perCategory: map.perCategory,
        duplicatePairs: (map.buckets && map.buckets.D_duplicate_pairs || []).length,
        orphans: (map.files || []).filter((x) => (x.flags || []).includes('ORPHAN')).length,
      },
      bridges: (map.bridges || []).slice(0, 5),
      correctness: {
        totalFindings: findings.length,
        bySeverity: findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {}),
        findings: findings.slice(0, maxFindings),
        truncated: Math.max(0, findings.length - maxFindings),
      },
      confidentiality: 'client code did not grow the substrate (growSubstrate: false throughout)',
      durationMs: Date.now() - t0,
    };

    // A completed audit is a COHERENT event; only counts reach the field.
    if (fc) {
      try {
        const bucket = findings.some((f) => f.severity === 'high') ? 'findings-high'
          : findings.length ? 'findings' : 'clean';
        fc.contribute({ cost: 1.0, coherence: 0.9, source: 'oracle:repo-audit:' + bucket });
      } catch (_) { /* field optional */ }
    }

    return report;
  } finally {
    if (cloned && !opts.keepClone) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* temp cleanup best-effort */ }
    }
  }
}

function formatReport(r) {
  if (!r.ok) return 'audit failed: ' + r.error;
  const lines = [];
  lines.push('═══ REMEMBRANCE AUDIT — ' + r.target + ' ═══');
  lines.push(`  files mapped: ${r.audited.files} · checker files: ${r.audited.checkerFiles}/${r.audited.checkerFilesTotal} · ${(r.durationMs / 1000).toFixed(1)}s`);
  lines.push(`  structure: mean ${r.structure.meanCoherence} · median ${r.structure.medianCoherence} · duplicates ${r.structure.duplicatePairs} · orphans ${r.structure.orphans}`);
  if (r.structure.weakest.length) {
    lines.push('  weakest structure:');
    for (const w of r.structure.weakest) lines.push(`    ${w.coherence.toFixed(3)}  ${w.file}`);
  }
  const sev = r.correctness.bySeverity;
  lines.push(`  correctness: ${r.correctness.totalFindings} findings (high ${sev.high || 0} · medium ${sev.medium || 0} · low ${sev.low || 0})`);
  for (const f of r.correctness.findings.slice(0, 15)) {
    lines.push(`    [${f.severity}/${f.bugClass}] ${f.file}:${f.line} — ${String(f.issue).slice(0, 90)}`);
    if (f.fix) lines.push(`        → ${String(f.fix).slice(0, 90)}`);
  }
  if (r.correctness.truncated) lines.push(`    …and ${r.correctness.truncated} more`);
  lines.push('  ' + r.confidentiality);
  return lines.join('\n');
}

module.exports = { auditRepo, formatReport };
