#!/usr/bin/env node
'use strict';

/**
 * covenant-audit — run the ENTANGLED covenant gates over a file and report
 * whether it is clean on BOTH scales. This is the shed-decision surface:
 * an exemption is only sheddable when this prints CLEAN, because it crosses
 * the fractal audit (byte + atomic) against the covenant scanner (SQL /
 * injection / harm) — the pair trap 27 showed must never be judged apart.
 *
 *   node scripts/covenant-audit.js <file> [<file> ...]
 *   node scripts/covenant-audit.js --json <file>
 *
 * Read-only: nothing is written, nothing touches the field.
 */

const fs = require('node:fs');
const path = require('node:path');
const { fullCovenantAudit } = require('../src/core/covenant-entangled');

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const files = argv.filter((a) => !a.startsWith('--'));
  if (!files.length) {
    console.error('usage: covenant-audit.js [--json] <file> [<file> ...]');
    return 1;
  }
  const results = [];
  for (const f of files) {
    let code;
    try { code = fs.readFileSync(path.resolve(f), 'utf8'); }
    catch (e) { results.push({ file: f, error: e.message }); continue; }
    const v = fullCovenantAudit({ code, filePath: f });
    results.push({ file: f, clean: v.clean, fractalHealth: v.fractalHealth, sealed: v.sealed, reasons: v.reasons });
  }
  if (json) { console.log(JSON.stringify(results, null, 1)); return results.every((r) => r.clean) ? 0 : 1; }
  console.log('══ ENTANGLED COVENANT AUDIT — fractal ⊗ covenant ══');
  let allClean = true;
  for (const r of results) {
    if (r.error) { console.log(`  ? ${r.file} — ${r.error}`); allClean = false; continue; }
    if (r.clean) { console.log(`  ✓ ${r.file} — CLEAN on both scales (sheddable if exempt)`); continue; }
    allClean = false;
    console.log(`  ✗ ${r.file} — fractal:${r.fractalHealth ? 'ok' : 'FAIL'} covenant:${r.sealed ? 'ok' : 'FAIL'}`);
    for (const reason of r.reasons) console.log(`      ${reason}`);
  }
  console.log(allClean ? '  both gates clean' : '  a gate blocks — the exemption is load-bearing for the failing scale');
  return allClean ? 0 : 1;
}

main.atomicProperties = {
  charge: 1, valence: 2, mass: 'light', spin: 'odd', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.7, group: 18, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

if (require.main === module) process.exit(main());
module.exports = { main };
