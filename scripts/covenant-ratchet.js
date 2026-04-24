#!/usr/bin/env node
/**
 * Covenant Ratchet — enforces "quality floor only rises" on the cathedral.
 *
 * Reads .remembrance/diagnostics/cathedral-latest.json (produced by
 * scripts/cathedral-diagnostic.js) and compares it to
 * .remembrance/diagnostics/cathedral-baseline.json.
 *
 *   - High-severity count cannot go up.
 *   - Total finding count cannot go up by more than --tolerance (default 5).
 *   - AST-source findings cannot go up at all (AST is precise — any increase
 *     is likely a real new bug).
 *
 * Non-zero exit on any violation. Intended for use in pre-commit hooks and
 * CI. To reset the baseline after intentional work, run with --save-baseline.
 *
 * Usage:
 *   node scripts/covenant-ratchet.js
 *   node scripts/covenant-ratchet.js --tolerance 10
 *   node scripts/covenant-ratchet.js --save-baseline
 *   node scripts/covenant-ratchet.js --json   # machine-readable verdict
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DIAG_DIR = path.join(REPO_ROOT, '.remembrance', 'diagnostics');
const LATEST = path.join(DIAG_DIR, 'cathedral-latest.json');
const BASELINE = path.join(DIAG_DIR, 'cathedral-baseline.json');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return null; }
}

function summarize(report) {
  const s = report?.summary ?? {};
  return {
    total: s.totalFindings ?? 0,
    high: s.bySeverity?.high ?? 0,
    medium: s.bySeverity?.medium ?? 0,
    low: s.bySeverity?.low ?? 0,
    ast: s.bySource?.ast ?? 0,
    filesScanned: report?.filesScanned ?? 0,
  };
}

function main() {
  const args = process.argv.slice(2);
  const save = args.includes('--save-baseline');
  const asJson = args.includes('--json');
  const tolIdx = args.indexOf('--tolerance');
  const tolerance = tolIdx >= 0 ? Number.parseInt(args[tolIdx + 1], 10) || 5 : 5;

  const latest = readJson(LATEST);
  if (!latest) {
    const msg = 'no cathedral-latest.json — run `node scripts/cathedral-diagnostic.js` first';
    if (asJson) { console.log(JSON.stringify({ ok: false, reason: msg })); process.exit(2); }
    console.error(`[ratchet] ${msg}`);
    process.exit(2);
  }

  if (save) {
    fs.writeFileSync(BASELINE, fs.readFileSync(LATEST));
    console.log(`[ratchet] baseline saved from current: ${path.relative(REPO_ROOT, BASELINE)}`);
    process.exit(0);
  }

  const cur = summarize(latest);
  const base = readJson(BASELINE);
  if (!base) {
    // No baseline yet — write the current as the starting baseline.
    fs.writeFileSync(BASELINE, fs.readFileSync(LATEST));
    const msg = 'no baseline existed — current run stored as the initial baseline. Pass after this run.';
    if (asJson) { console.log(JSON.stringify({ ok: true, initialized: true, current: cur })); process.exit(0); }
    console.log(`[ratchet] ${msg}`);
    console.log(`[ratchet] baseline: high=${cur.high} total=${cur.total} ast=${cur.ast}`);
    process.exit(0);
  }

  const bs = summarize(base);
  const violations = [];
  if (cur.high > bs.high) {
    violations.push(`high severity: ${bs.high} → ${cur.high} (+${cur.high - bs.high})`);
  }
  if (cur.ast > bs.ast) {
    violations.push(`AST findings: ${bs.ast} → ${cur.ast} (+${cur.ast - bs.ast})`);
  }
  if (cur.total > bs.total + tolerance) {
    violations.push(`total findings: ${bs.total} → ${cur.total} (+${cur.total - bs.total}, tolerance=${tolerance})`);
  }

  const result = {
    ok: violations.length === 0,
    baseline: bs,
    current: cur,
    violations,
    tolerance,
  };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  console.log(`[ratchet] baseline: high=${bs.high} total=${bs.total} ast=${bs.ast}`);
  console.log(`[ratchet] current:  high=${cur.high} total=${cur.total} ast=${cur.ast}`);
  if (violations.length === 0) {
    console.log('[ratchet] ✓ covenant holds — quality floor did not drop');
    process.exit(0);
  }
  console.error('[ratchet] ✗ covenant violation:');
  for (const v of violations) console.error(`  - ${v}`);
  console.error('');
  console.error('[ratchet] options:');
  console.error('  1. fix the regression, or');
  console.error('  2. run `node scripts/covenant-ratchet.js --save-baseline` if intentional');
  process.exit(1);
}

main();
