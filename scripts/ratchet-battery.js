#!/usr/bin/env node
'use strict';

/**
 * ratchet-battery — the whole gate family from one surface.
 *
 * Runs every ratchet in check mode and reports one verdict line each.
 * Routed through the goggles as `--do ratchets`, so seeing the gates and
 * running them are the same surface. Check-only: nothing here saves a
 * baseline, nothing writes, nothing feeds the field.
 *
 *   node scripts/ratchet-battery.js          all verdicts, exit 1 if any gate fails
 *   node scripts/ratchet-battery.js --json   machine-readable battery state
 */

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

const RATCHETS = [
  { name: 'covenant', script: 'scripts/covenant-ratchet.js' },
  { name: 'exemption', script: 'scripts/exemption-ratchet.js' },
  { name: 'size', script: 'scripts/size-ratchet.js' },
  { name: 'cycle', script: 'scripts/cycle-ratchet.js' },
  { name: 'suite-reachability', script: 'scripts/suite-reachability-ratchet.js' },
  { name: 'field-source', script: 'scripts/field-source-ratchet.js' },
  { name: 'ledger-append', script: 'scripts/ledger-append-ratchet.js' },
  { name: 'orphan', script: 'scripts/orphan-ratchet.js' },
  { name: 'silent-catch', script: 'scripts/silent-catch-ratchet.js' },
  { name: 'console', script: 'scripts/console-ratchet.js' },
  { name: 'atomic-drift', script: 'scripts/atomic-drift-ratchet.js' },
];

function runOne(r) {
  try {
    const out = execFileSync('node', [path.join(ROOT, r.script)], {
      cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000,
    });
    return { name: r.name, ok: true, line: (out.trim().split('\n')[0] || 'ok') };
  } catch (e) {
    const out = ((e.stdout || '') + (e.stderr || '')).toString();
    return { name: r.name, ok: false, line: (out.trim().split('\n').find((l) => l.includes('✗')) || out.trim().split('\n')[0] || e.message) };
  }
}
runOne.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.4, group: 12, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function main() {
  const results = RATCHETS.map(runOne);
  const ok = results.every((r) => r.ok);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ok, gates: results }, null, 1));
    return ok ? 0 : 1;
  }
  console.log('══ RATCHET BATTERY — the gate family, one read ══');
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(18)} ${r.line}`);
  console.log(ok ? '  all gates hold' : '  A GATE IS OPEN — fix the code, never the gate');
  return ok ? 0 : 1;
}
main.atomicProperties = {
  charge: 1, valence: 2, mass: 'light', spin: 'odd', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.6, group: 18, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

if (require.main === module) process.exit(main());
module.exports = { RATCHETS };
