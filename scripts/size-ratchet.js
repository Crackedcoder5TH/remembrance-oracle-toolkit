#!/usr/bin/env node
'use strict';

/**
 * size-ratchet — the monolith surface can only shrink.
 *
 * Measured 2026-08: 70 of 407 src modules exceed 500 lines — 60,253
 * lines, 43% of src — and every one of the weakest structural readings
 * in the map belongs to one of them. Wanting smaller files does not
 * produce smaller files; a gate does. Same mechanism as the exemption
 * ratchet, same posture as the covenant ratchet: quality floor only
 * rises.
 *
 * THE INVARIANT
 *   - a module NOT in the baseline must be ≤ MAX_LINES (500)
 *   - a grandfathered module may not grow past its recorded size + SLACK
 *     (headroom for gate-mandated annotations, not for new features)
 *   - when a module drops to ≤ MAX_LINES, --save-baseline releases it —
 *     it can never re-enter. The list only shrinks: 70 → 0 is the road
 *     to professional file discipline, enforced rather than wished.
 *
 *   node scripts/size-ratchet.js                 check (exit 1 on growth)
 *   node scripts/size-ratchet.js --json          machine-readable verdict
 *   node scripts/size-ratchet.js --save-baseline accept current sizes
 *
 * Nothing here touches the field: a line count is a census, not a
 * coherency, and no number is invented to pretend otherwise.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { createGate, requireGate } = require('../src/core/covenant-fractal');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, '.covenant-size-baseline.json');
const MAX_LINES = 500;
const SLACK = 40;   // annotations/comments a gate may legitimately add
const SCOPE = /^src\/.*\.js$/;

const _writeBaseline = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
});

/** Census every in-scope module's line count. Sorted descending. */
function censusSizes() {
  const files = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => SCOPE.test(f));
  const out = [];
  for (const f of files) {
    let n = 0;
    try { n = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').length; } catch { continue; }
    out.push({ file: f, lines: n });
  }
  out.sort((a, b) => b.lines - a.lines);
  return out;
}
censusSizes.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 12, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
};

/**
 * Compare a census to the baseline. Pure — the test exercises this.
 * Violations: a non-grandfathered module over MAX_LINES, or a
 * grandfathered one grown past its recorded size + SLACK.
 */
function compareSizes(census, baselineMap) {
  const over = census.filter((e) => e.lines > MAX_LINES);
  const newMonoliths = [], grown = [], shrunkOut = [];
  for (const e of over) {
    const base = baselineMap[e.file];
    if (base === undefined) newMonoliths.push(e);
    else if (e.lines > base + SLACK) grown.push({ ...e, baseline: base });
  }
  const now = new Set(over.map((e) => e.file));
  for (const f of Object.keys(baselineMap)) {
    if (!now.has(f)) shrunkOut.push(f);
  }
  return { newMonoliths, grown, shrunkOut, overCount: over.length, baselineCount: Object.keys(baselineMap).length };
}
compareSizes.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.2, group: 12, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'covenant',
};

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const save = argv.includes('--save-baseline');

  const census = censusSizes();
  let baseline = null;
  try { baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); } catch (_) { /* first run */ }
  const baseMap = baseline ? baseline.modules : {};
  const cmp = compareSizes(census, baseMap);

  if (save) {
    const modules = {};
    for (const e of census) if (e.lines > MAX_LINES) modules[e.file] = e.lines;
    const doc = {
      note: 'Covenant size baseline — grandfathered monoliths (> ' + MAX_LINES + ' lines). '
        + 'The ratchet allows this list to SHRINK only: no new module may exceed the cap, '
        + 'no listed module may grow past its recorded size + ' + SLACK + ', and a module '
        + 'that drops under the cap leaves forever.',
      savedAt: new Date().toISOString(),
      maxLines: MAX_LINES,
      slack: SLACK,
      count: Object.keys(modules).length,
      totalLines: Object.values(modules).reduce((a, b) => a + b, 0),
      modules,
    };
    _writeBaseline(_sealedGate(), BASELINE_PATH, JSON.stringify(doc, null, 1) + '\n');
    console.log(`[size-ratchet] baseline ${baseline ? 're-' : ''}saved: ${doc.count} grandfathered monoliths, ${doc.totalLines} lines.`);
    if (baseline && cmp.shrunkOut.length) {
      console.log(`  RELEASED (dropped under ${MAX_LINES} — can never re-enter):`);
      for (const f of cmp.shrunkOut) console.log(`    freed: ${f}`);
    }
    return;
  }

  const ok = cmp.newMonoliths.length === 0 && cmp.grown.length === 0;
  if (asJson) {
    console.log(JSON.stringify({ ok, ...cmp }, null, 1));
    process.exitCode = ok ? 0 : 1;
    return;
  }
  if (!baseline) {
    console.log('[size-ratchet] no baseline yet — run with --save-baseline to freeze the current surface.');
    process.exitCode = 1;
    return;
  }
  if (ok) {
    console.log(`[size-ratchet] ✓ holds — ${cmp.overCount} grandfathered monoliths (baseline ${cmp.baselineCount}), none grown, none new`);
    if (cmp.shrunkOut.length) {
      console.log(`  ${cmp.shrunkOut.length} module(s) dropped under ${MAX_LINES} — run --save-baseline to release them for good:`);
      for (const f of cmp.shrunkOut) console.log(`    ${f}`);
    }
  } else {
    for (const e of cmp.newMonoliths) {
      console.log(`[size-ratchet] ✗ NEW monolith: ${e.file} is ${e.lines} lines (cap ${MAX_LINES})`);
    }
    for (const e of cmp.grown) {
      console.log(`[size-ratchet] ✗ GREW: ${e.file} ${e.baseline} -> ${e.lines} lines (+${e.lines - e.baseline}, slack ${SLACK})`);
    }
    console.log('  Split the module (see src/core/walk-files.js and the mapper decomposition');
    console.log('  for the house pattern), or shrink it back. The cap does not move.');
    process.exitCode = 1;
  }
}
main.atomicProperties = {
  charge: 1, valence: 2, mass: 'medium', spin: 'odd', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.7, group: 18, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
};

if (require.main === module) main();
module.exports = { censusSizes, compareSizes, BASELINE_PATH, MAX_LINES, SLACK };
