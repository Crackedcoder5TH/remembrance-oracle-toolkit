#!/usr/bin/env node
/**
 * Ecosystem Ratchet — cross-repo covenant enforcement.
 *
 * Compares .remembrance/diagnostics/ecosystem-latest.json to
 * .remembrance/diagnostics/ecosystem-baseline.json and enforces:
 *
 *   - Per-repo wiring-gap count cannot increase.
 *   - Per-repo high-severity finding count cannot increase.
 *   - If a primitive was wired (found=true) in the baseline for any repo,
 *     it must still be wired in the current run. A repo can't un-wire
 *     from the ecosystem.
 *
 * Non-zero exit on violation. Same --save-baseline / --json / --tolerance
 * flags as covenant-ratchet for ergonomics parity.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DIAG_DIR = path.join(REPO_ROOT, '.remembrance', 'diagnostics');
const LATEST = path.join(DIAG_DIR, 'ecosystem-latest.json');
const BASELINE = path.join(DIAG_DIR, 'ecosystem-baseline.json');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return null; }
}

function buildRepoIndex(report) {
  const out = new Map();
  for (const r of (report?.repos ?? [])) {
    if (!r.found) continue;
    out.set(r.repo, {
      findings: r.counts?.findings ?? 0,
      high: r.bySeverity?.high ?? 0,
      wiringGaps: r.wiringGaps ?? [],
      primitives: r.primitives ?? {},
    });
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const save = args.includes('--save-baseline');
  const asJson = args.includes('--json');
  const tolIdx = args.indexOf('--tolerance');
  const tolerance = tolIdx >= 0 ? Number.parseInt(args[tolIdx + 1], 10) || 10 : 10;

  const latest = readJson(LATEST);
  if (!latest) {
    const msg = 'no ecosystem-latest.json — run `node scripts/ecosystem-diagnostic.js` first';
    if (asJson) { console.log(JSON.stringify({ ok: false, reason: msg })); process.exit(2); }
    console.error(`[eco-ratchet] ${msg}`);
    process.exit(2);
  }

  if (save) {
    fs.writeFileSync(BASELINE, fs.readFileSync(LATEST));
    console.log(`[eco-ratchet] baseline saved from current: ${path.relative(REPO_ROOT, BASELINE)}`);
    process.exit(0);
  }

  const base = readJson(BASELINE);
  if (!base) {
    fs.writeFileSync(BASELINE, fs.readFileSync(LATEST));
    const msg = 'no baseline — current run stored as the initial baseline. Pass after this run.';
    if (asJson) { console.log(JSON.stringify({ ok: true, initialized: true })); process.exit(0); }
    console.log(`[eco-ratchet] ${msg}`);
    process.exit(0);
  }

  const curIdx = buildRepoIndex(latest);
  const baseIdx = buildRepoIndex(base);

  const violations = [];
  for (const [repo, bs] of baseIdx.entries()) {
    const cs = curIdx.get(repo);
    if (!cs) {
      violations.push(`${repo}: disappeared from the current scan (was audited in baseline)`);
      continue;
    }
    if (cs.high > bs.high) {
      violations.push(`${repo}: high severity ${bs.high} → ${cs.high} (+${cs.high - bs.high})`);
    }
    if (cs.findings > bs.findings + tolerance) {
      violations.push(`${repo}: total findings ${bs.findings} → ${cs.findings} (+${cs.findings - bs.findings}, tolerance=${tolerance})`);
    }
    if (cs.wiringGaps.length > bs.wiringGaps.length) {
      const added = cs.wiringGaps.filter((g) => !bs.wiringGaps.includes(g));
      violations.push(`${repo}: wiring gaps grew — newly missing: ${added.join(', ') || '(see report)'}`);
    }
    // Un-wiring: any primitive that was found in baseline must still be found now.
    for (const [primId, primInfo] of Object.entries(bs.primitives)) {
      if (!primInfo.found) continue;
      const cur = cs.primitives[primId];
      if (!cur || !cur.found) {
        violations.push(`${repo}: un-wired primitive "${primId}" that was previously present`);
      }
    }
  }

  const result = {
    ok: violations.length === 0,
    violations,
    repoCount: curIdx.size,
    tolerance,
  };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (violations.length === 0) {
    console.log(`[eco-ratchet] ✓ ecosystem covenant holds across ${curIdx.size} repos`);
    process.exit(0);
  }
  console.error(`[eco-ratchet] ✗ ${violations.length} ecosystem covenant violation(s):`);
  for (const v of violations) console.error(`  - ${v}`);
  console.error('');
  console.error('[eco-ratchet] options:');
  console.error('  1. fix the regressions, or');
  console.error('  2. run `node scripts/ecosystem-ratchet.js --save-baseline` if intentional');
  process.exit(1);
}

main();
