#!/usr/bin/env node
'use strict';

/**
 * orphan-ratchet — adjudication at birth.
 *
 * Trap #24's disease: zero callers plus intent to be called. The 2,635-
 * export sweep (2026-08-07) found 120 of them and every one needed a
 * verdict after the fact. This gate moves the verdict to the moment of
 * birth: an export ADDED by the staged commit must either have a
 * consumer somewhere (in-file call, src/scripts/bin reference) or an
 * entry in .map-adjudications.json under `exports`, keyed file#name with
 * {verdict, reason, date}. Silence is the one thing that cannot ship.
 *
 * Incremental by design: only STAGED src files are examined, so the
 * pre-commit cost stays proportional to the commit, not the repo.
 *
 *   node scripts/orphan-ratchet.js           check staged src files
 *   node scripts/orphan-ratchet.js --json    machine-readable verdict
 *
 * No baseline file — the adjudication store IS the baseline, and it is
 * governed for additions by review like every adjudication before it.
 * Census only — nothing here feeds the field.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ADJUDICATIONS_PATH = path.join(ROOT, '.map-adjudications.json');

/** Export names in module.exports = { ... } shorthand / key form. */
function exportNames(code) {
  const m = code.match(/module\.exports\s*=\s*\{([\s\S]*?)\}/);
  if (!m) return [];
  const names = [];
  // shorthand `foo,` and key `foo: bar` forms; spreads and computed keys
  // are consumer-visible through other means and are skipped honestly
  const re = /(?:^|,)\s*(?:\/\/[^\n]*\n\s*)*([A-Za-z_$][\w$]*)(?=\s*(?:[,:}\n]|$))/g;
  for (const t of m[1].matchAll(re)) names.push(t[1]);
  return [...new Set(names)];
}
exportNames.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.4, group: 11, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/** Names newly exported by the staged version of a file vs HEAD. */
function addedExports(file) {
  let headCode = '';
  try { headCode = execFileSync('git', ['show', `HEAD:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch { /* new file: every export is newly added */ }
  let stagedCode;
  try { stagedCode = execFileSync('git', ['show', `:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch { return []; }
  const before = new Set(exportNames(headCode));
  return exportNames(stagedCode).filter((n) => !before.has(n)).map((n) => ({ name: n, code: stagedCode }));
}
addedExports.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.4, group: 11, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/** Does anything consume this name? In-file calls or cross-file references. */
function hasConsumer(file, name, code) {
  // in-file: any use of the name beyond its definition and the export line
  const uses = [...code.matchAll(new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`, 'g'))].length;
  const defs = [...code.matchAll(new RegExp(
    `(?:function\\s+${name}\\b|(?:const|let|var)\\s+${name}\\b|${name}\\s*[,:}]|${name}\\s*:)`, 'g'))].length;
  if (uses > defs) return 'in-file';
  // cross-file: any tracked consumer surface mentioning the name.
  // Argument array, never an interpolated shell string — the covenant
  // blocked the first version of this exact line (catch #11).
  try {
    const hits = execFileSync('git',
      ['grep', '-l', '-w', name, '--', 'src', 'scripts', 'bin', 'packages', 'remembrance-plugin', '.github'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).split('\n').filter((f) => f && f !== file);
    if (hits.length) return hits[0];
  } catch { /* no hits */ }
  return null;
}
hasConsumer.atomicProperties = {
  charge: 0, valence: 2, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 12, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function loadExportAdjudications() {
  try {
    const store = JSON.parse(fs.readFileSync(ADJUDICATIONS_PATH, 'utf8'));
    return store.exports || {};
  } catch { return {}; }
}
loadExportAdjudications.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

function main() {
  const argv = process.argv.slice(2);
  let staged = [];
  try {
    staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      .split('\n').filter((f) => /^src\/.*\.js$/.test(f));
  } catch { /* nothing staged */ }

  const adjudicated = loadExportAdjudications();
  const orphansAtBirth = [];
  let born = 0;
  for (const file of staged) {
    for (const { name, code } of addedExports(file)) {
      born++;
      const consumer = hasConsumer(file, name, code);
      if (consumer) continue;
      if (adjudicated[`${file}#${name}`]) continue;
      orphansAtBirth.push({ file, name });
    }
  }
  const ok = orphansAtBirth.length === 0;
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ok, staged: staged.length, newExports: born, orphansAtBirth }, null, 1));
    return ok ? 0 : 1;
  }
  if (ok) {
    console.log(`[orphan-ratchet] ✓ holds — ${staged.length} staged src files, ${born} new exports, all consumed or adjudicated`);
    return 0;
  }
  console.error('[orphan-ratchet] ✗ BLOCKED — export born with zero consumers and no verdict:');
  for (const o of orphansAtBirth) console.error(`  ${o.file}#${o.name}`);
  console.error('  wire a consumer, or adjudicate it in .map-adjudications.json under `exports`');
  console.error('  ("src/foo.js#barFn": {verdict, reason, date}). A capability is only real when a consumer reaches it.');
  return 1;
}
main.atomicProperties = {
  charge: 1, valence: 3, mass: 'medium', spin: 'odd', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.7, group: 18, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

if (require.main === module) process.exit(main());
module.exports = { exportNames, addedExports, hasConsumer };
