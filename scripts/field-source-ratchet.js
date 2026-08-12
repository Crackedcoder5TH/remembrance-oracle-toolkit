#!/usr/bin/env node
'use strict';

/**
 * field-source-ratchet — the write surface of the coherency law.
 *
 * The law: every coherency reading in the field originated in the Void
 * compressor. The field audit (scripts/audit-field-contributions.js)
 * classifies every contribute({coherence}) call site in src/ as MEASURED
 * or SUBSTITUTED. Measured 2026-08-09: 29 sites, 29 MEASURED, 0
 * SUBSTITUTED. Nothing blocked a 30th site from appearing silently —
 * this gate does.
 *
 * THE INVARIANT
 *   - a SUBSTITUTED site blocks UNCONDITIONALLY. There is no acceptance
 *     path: a quantity that is not a coherency does not become one by
 *     being approved. Fix the site, never the gate.
 *   - a NEW site (keyed file#source) blocks until explicitly accepted
 *     via --save-baseline — growth of the write surface is a decision,
 *     not a drift
 *   - sites that disappear pass, with a note to re-save
 *
 *   node scripts/field-source-ratchet.js                 check
 *   node scripts/field-source-ratchet.js --json          verdict
 *   node scripts/field-source-ratchet.js --save-baseline accept surface
 *
 * The census reads the audit's own classification — same data pipeline,
 * one instrument. Nothing here writes to the field; watching the write
 * surface is not a write.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createGate, requireGate } = require('../src/core/covenant-fractal');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, '.field-sources-baseline.json');

const _writeBaseline = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
});

/** Run the field audit and key every site file#source. */
function censusSites() {
  const out = execFileSync('node', [path.join(__dirname, 'audit-field-contributions.js'), '--json'],
    { cwd: ROOT, encoding: 'utf8' });
  const sites = JSON.parse(out);
  // Keys must be line-independent (lines drift) but unique — the same
  // file+source label can legitimately hold several sites, so duplicates
  // get an occurrence index. Sites are keyed in file order.
  const seen = new Map();
  return sites.map((s) => {
    const base = `${s.file}#${s.source || '(unlabeled)'}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { key: n === 1 ? base : `${base}#${n}`, kind: s.kind, why: s.why };
  }).sort((a, b) => (a.key < b.key ? -1 : 1));
}
censusSites.atomicProperties = {
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
  const current = censusSites();
  const nonMeasured = current.filter((s) => s.kind !== 'MEASURED');
  const baseline = loadBaseline();

  if (argv.includes('--save-baseline')) {
    // Grandfathering happens ONCE, at ratchet birth. After that, a save can
    // only carry grandfathered entries that still exist — it can never add
    // one. A new non-measured site cannot be baselined into legitimacy.
    if (baseline) {
      const gf = new Set((baseline.grandfathered || []).map((s) => s.key));
      const illegitimate = nonMeasured.filter((s) => !gf.has(s.key));
      if (illegitimate.length) {
        console.error('[field-source] ✗ save REFUSED — non-measured site not in the birth grandfather list:');
        for (const s of illegitimate) console.error(`  ${s.kind}  ${s.key}  (${s.why})`);
        console.error('  a coherency comes from the Void compressor or it is not a coherency. Fix the site.');
        return 1;
      }
    }
    const data = JSON.stringify({
      note: 'field-source baseline — every call site allowed to feed contribute({coherence}). New sites are a decision; the grandfathered non-measured list is shrink-only and each entry awaits owner adjudication.',
      savedAt: new Date().toISOString(),
      count: current.length,
      measured: current.filter((s) => s.kind === 'MEASURED'),
      grandfathered: nonMeasured,
    }, null, 1) + '\n';
    _writeBaseline(_sealedGate(), BASELINE_PATH, data);
    console.log(`[field-source] baseline saved: ${baseline ? baseline.count : 'none'} -> ${current.length} sites (${nonMeasured.length} grandfathered non-measured, shrink-only)`);
    return 0;
  }

  if (!baseline) {
    console.error('[field-source] no baseline — run --save-baseline first');
    return 1;
  }
  const knownMeasured = new Set((baseline.measured || []).map((s) => s.key));
  const knownGf = new Set((baseline.grandfathered || []).map((s) => s.key));
  const newNonMeasured = nonMeasured.filter((s) => !knownGf.has(s.key));
  const addedMeasured = current.filter((s) => s.kind === 'MEASURED' && !knownMeasured.has(s.key) && !knownGf.has(s.key));
  const gone = [...knownMeasured, ...knownGf].filter((k) => !current.some((s) => s.key === k));
  const gfHealed = (baseline.grandfathered || []).filter((g) => current.some((s) => s.key === g.key && s.kind === 'MEASURED')).length;
  const ok = newNonMeasured.length === 0 && addedMeasured.length === 0;

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      ok, sites: current.length, measured: current.length - nonMeasured.length,
      grandfathered: nonMeasured.length, newNonMeasured, addedMeasured, gone, gfHealed,
    }, null, 1));
    return ok ? 0 : 1;
  }
  if (ok) {
    console.log(`[field-source] ✓ holds — ${current.length} write sites: ${current.length - nonMeasured.length} MEASURED, ${nonMeasured.length} grandfathered awaiting adjudication (baseline ${baseline.count})`);
    if (gone.length || gfHealed) console.log(`  surface shrank (${gone.length} gone, ${gfHealed} healed to MEASURED) — run --save-baseline to follow it down`);
    return 0;
  }
  if (newNonMeasured.length) {
    console.error('[field-source] ✗ BLOCKED — NEW non-measured quantity feeding the coherency field:');
    for (const s of newNonMeasured) console.error(`  ${s.kind}  ${s.key}  (${s.why})`);
    console.error('  there is no acceptance path for this. A coherency comes from the Void compressor or it is not a coherency.');
  }
  if (addedMeasured.length) {
    console.error('[field-source] ✗ BLOCKED — new site writing to the coherency field:');
    for (const s of addedMeasured) console.error(`  ${s.key}`);
    console.error('  widening the write surface is a decision: accept with --save-baseline or remove the site.');
  }
  return 1;
}
main.atomicProperties = {
  charge: 1, valence: 3, mass: 'medium', spin: 'odd', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.75, group: 18, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

if (require.main === module) process.exit(main());
module.exports = { censusSites };
