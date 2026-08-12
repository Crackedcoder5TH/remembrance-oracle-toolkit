#!/usr/bin/env node
'use strict';

/**
 * suite-reachability-ratchet — a test that never runs is not a test.
 *
 * Measured 2026-08-09: 7 test files sit in tests/pattern-tests/, outside
 * the runner glob (tests/*.test.js), and one of them had been failing
 * silently for an unknown span — the suite read green the whole time.
 * A test the runner cannot reach is an unwired capability wearing a
 * test's name: trap #24's disease class, in the one place it can hide
 * from every other gate.
 *
 * THE INVARIANT
 *   - every git-tracked *.test.js under tests/ must be reachable by the
 *     suite runner, OR carry an explicit adjudication in the baseline
 *     ({file, verdict, reason}) — standalone-by-design is a legitimate
 *     verdict, silence is not
 *   - a NEW unreachable test blocks the commit
 *   - the unreachable list only shrinks; --save-baseline follows it down
 *
 *   node scripts/suite-reachability-ratchet.js                 check
 *   node scripts/suite-reachability-ratchet.js --json          verdict
 *   node scripts/suite-reachability-ratchet.js --save-baseline accept
 *
 * Census only — nothing here feeds the field.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { createGate, requireGate } = require('../src/core/covenant-fractal');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, '.suite-reachability-baseline.json');
// The runner glob from package.json "test": tests/*.test.js — top level only.
const REACHABLE = /^tests\/[^/]+\.test\.js$/;
const SCOPE = /^tests\/.*\.test\.js$/;

const _writeBaseline = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
});

/** All tracked test files the runner glob cannot reach. */
function censusUnreachable() {
  const files = execSync('git ls-files tests', { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => SCOPE.test(f) && !REACHABLE.test(f));
  return files.sort();
}
censusUnreachable.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.4, group: 12, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function loadBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); }
  catch { return null; }
}
loadBaseline.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

function main() {
  const argv = process.argv.slice(2);
  const current = censusUnreachable();

  if (argv.includes('--save-baseline')) {
    const prev = loadBaseline();
    const prevByFile = new Map(((prev && prev.unreachable) || []).map((e) => [e.file, e]));
    const data = JSON.stringify({
      note: 'suite-reachability baseline — tracked *.test.js the runner glob cannot reach. Shrink-only; each entry needs a verdict to stay.',
      savedAt: new Date().toISOString(),
      unreachable: current.map((f) => prevByFile.get(f) || {
        file: f,
        verdict: 'grandfathered-unadjudicated',
        reason: 'present at ratchet birth; wire into the suite, run standalone in CI, or adjudicate standalone-by-design',
      }),
    }, null, 1) + '\n';
    _writeBaseline(_sealedGate(), BASELINE_PATH, data);
    console.log(`[suite-reachability] baseline saved: ${prev ? prev.unreachable.length : 'none'} -> ${current.length} unreachable`);
    return 0;
  }

  const baseline = loadBaseline();
  if (!baseline) {
    console.error('[suite-reachability] no baseline — run --save-baseline first');
    return 1;
  }
  const known = new Set(baseline.unreachable.map((e) => e.file));
  const added = current.filter((f) => !known.has(f));
  const removed = [...known].filter((f) => !current.includes(f));
  const ok = added.length === 0;
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ok, unreachable: current.length, baseline: known.size, added, removed }, null, 1));
    return ok ? 0 : 1;
  }
  if (ok) {
    console.log(`[suite-reachability] ✓ holds — ${current.length} unreachable test files (baseline ${known.size})`);
    if (removed.length) console.log(`  ${removed.length} became reachable — run --save-baseline to ratchet down`);
    return 0;
  }
  console.error('[suite-reachability] ✗ BLOCKED — new test file the suite runner cannot reach:');
  for (const f of added) console.error(`  ${f}`);
  console.error('  move it under tests/*.test.js, wire a runner for it, or adjudicate it in the baseline with a verdict.');
  return 1;
}
main.atomicProperties = {
  charge: 1, valence: 2, mass: 'light', spin: 'odd', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.6, group: 18, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

if (require.main === module) process.exit(main());
module.exports = { censusUnreachable };
