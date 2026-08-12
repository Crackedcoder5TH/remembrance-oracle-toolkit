#!/usr/bin/env node
// @oracle-infrastructure — developer tooling — CLI/analysis helpers, not substrate elements; writes are build artifacts and internal-state maintenance
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
// The tracked floor. `.remembrance/` is gitignored in full, so the baseline
// lived only on the host that measured it: a fresh clone had no floor, stored
// whatever it happened to measure as the new one, and a quality level someone
// worked to reach was silently re-seeded at whatever came next. seeds/ is the
// same answer traps.seed.json already gives for traps — a tracked floor that
// ships with the repo, with the local store still winning where it is
// STRICTER, so a host that has improved further keeps its gain.
const SEED = path.join(REPO_ROOT, 'seeds', 'cathedral-baseline.seed.json');

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

/**
 * The floor actually enforced: the STRICTER of the tracked seed and the local
 * baseline, metric by metric. A ratchet only tightens, so taking the minimum is
 * the only merge that cannot loosen the gate — a looser local baseline can
 * never raise the ceiling above what the repo ships, and a stricter one is kept.
 *
 * @returns {{bs: object, source: string}|null} null when neither exists.
 */
function effectiveBaseline() {
  const local = readJson(BASELINE);
  const seed = readJson(SEED);
  if (!local && !seed) return null;
  if (!local) return { bs: summarize(seed), source: 'seed' };
  if (!seed) return { bs: summarize(local), source: 'local' };

  const l = summarize(local);
  const s = summarize(seed);
  const bs = {
    total: Math.min(l.total, s.total),
    high: Math.min(l.high, s.high),
    medium: Math.min(l.medium, s.medium),
    low: Math.min(l.low, s.low),
    ast: Math.min(l.ast, s.ast),
    filesScanned: l.filesScanned || s.filesScanned,
  };
  const same = bs.high === s.high && bs.total === s.total && bs.ast === s.ast;
  return { bs, source: same ? 'seed' : 'local+seed (strictest of each)' };
}

/**
 * Tighten the tracked floor — never loosen it. Writing the seed on every save
 * would let one bad run ship a weaker floor to every future clone, which is the
 * failure this file exists to prevent.
 *
 * @returns {boolean} true when the seed was tightened.
 */
function tightenSeed(cur) {
  const seed = readJson(SEED);
  const s = seed ? summarize(seed) : null;
  if (s && !(cur.high < s.high || cur.total < s.total || cur.ast < s.ast)) return false;
  const next = s
    ? { total: Math.min(cur.total, s.total), high: Math.min(cur.high, s.high),
        medium: Math.min(cur.medium, s.medium), low: Math.min(cur.low, s.low),
        ast: Math.min(cur.ast, s.ast) }
    : cur;
  const body = {
    _comment: 'Tracked quality floor for the covenant ratchet. Only ever tightens. '
      + 'The local baseline in .remembrance/diagnostics/ is gitignored; this is what a fresh clone enforces.',
    generatedAt: new Date().toISOString(),
    summary: {
      totalFindings: next.total,
      bySeverity: { high: next.high, medium: next.medium, low: next.low },
      bySource: { ast: next.ast },
    },
  };
  fs.mkdirSync(path.dirname(SEED), { recursive: true });
  fs.writeFileSync(SEED, JSON.stringify(body, null, 2) + '\n');
  return true;
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
    fs.mkdirSync(DIAG_DIR, { recursive: true });
    fs.writeFileSync(BASELINE, fs.readFileSync(LATEST));
    console.log(`[ratchet] baseline saved from current: ${path.relative(REPO_ROOT, BASELINE)}`);
    // Carry the gain into the tracked floor, so the next fresh clone starts
    // where this host ended rather than wherever its first run happened to land.
    if (tightenSeed(summarize(latest))) {
      console.log(`[ratchet] tracked floor tightened: ${path.relative(REPO_ROOT, SEED)}`);
    }
    process.exit(0);
  }

  const cur = summarize(latest);
  const eff = effectiveBaseline();
  if (!eff) {
    // Nothing tracked and nothing local — write both, so this never happens twice.
    fs.mkdirSync(DIAG_DIR, { recursive: true });
    fs.writeFileSync(BASELINE, fs.readFileSync(LATEST));
    tightenSeed(cur);
    const msg = 'no baseline existed — current run stored as the initial baseline. Pass after this run.';
    if (asJson) { console.log(JSON.stringify({ ok: true, initialized: true, current: cur })); process.exit(0); }
    console.log(`[ratchet] ${msg}`);
    console.log(`[ratchet] baseline: high=${cur.high} total=${cur.total} ast=${cur.ast}`);
    process.exit(0);
  }

  const bs = eff.bs;
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

  console.log(`[ratchet] baseline: high=${bs.high} total=${bs.total} ast=${bs.ast} [${eff.source}]`);
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
