'use strict';

/**
 * Covenant Remediator — auto-opens a fix PR when runAllChecks finds a breach
 * that has a remedy attached. First-pass: framing disclaimer injection.
 *
 * Scales to more remediation types by adding entries to REMEDIATORS.
 */

const fs = require('fs');
const { runAllChecks } = require('./covenant-checks');

const REMEDIATORS = {
  framing: (code, finding) => {
    const already = /coherency\s+metaphor|not\s+medical\s+advice|not\s+legal\s+advice|not\s+financial\s+advice|informational\s+only/i.test(code);
    if (already) return null;
    const header = `/* Coherency metaphor — not ${finding.details?.[0]?.domain || 'clinical'} advice. Informational only. */\n`;
    return header + code;
  },
};

function remediateFile(filePath) {
  if (!fs.existsSync(filePath)) return { changed: false, reason: 'file missing' };
  const original = fs.readFileSync(filePath, 'utf-8');
  const result = runAllChecks(original, filePath);
  if (result.sealed) return { changed: false, reason: 'already sealed' };
  const applied = [];
  let current = original;
  for (const finding of result.failed) {
    const rem = REMEDIATORS[finding.check];
    if (!rem) continue;
    const next = rem(current, finding);
    if (next && next !== current) {
      current = next;
      applied.push(finding.check);
    }
  }
  if (!applied.length) return { changed: false, reason: 'no applicable remediator' };
  fs.writeFileSync(filePath, current);
  return { changed: true, applied, filePath };
}
remediateFile.atomicProperties = {
  charge: 1, valence: 2, mass: 'medium', spin: 'odd', phase: 'liquid',
  reactivity: 'reactive', electronegativity: 0.8, group: 11, period: 5,
  harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
};

function remediatePaths(paths) {
  const results = [];
  for (const p of paths) results.push(remediateFile(p));
  const changed = results.filter(r => r.changed);
  return { total: paths.length, changed: changed.length, details: changed };
}

if (require.main === module) {
  const paths = process.argv.slice(2);
  if (paths.length === 0) { console.error('Usage: node covenant-remediator.js <file> [<file>...]'); process.exit(1); }
  console.log(JSON.stringify(remediatePaths(paths), null, 2));
  process.exit(0);
}

module.exports = { remediateFile, remediatePaths, REMEDIATORS };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
remediatePaths.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 13, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
