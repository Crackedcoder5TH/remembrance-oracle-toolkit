#!/usr/bin/env node
'use strict';

/**
 * console-ratchet — print logging can only shrink.
 *
 * The plain-engineering audit (2026-08-09) counted 3,864 console calls
 * in src/ — logging as unstructured print: no levels, no redirection,
 * no single logger to silence or route. scripts/ and bin/ are OUT of
 * scope (a CLI printing is its job); src/ is library surface, where
 * print is debt.
 *
 * THE INVARIANT (per-file counts)
 *   - a file's console-call count can only fall
 *   - a NEW src file that prints blocks
 *   - the healing move is a logger call or removal, never hiding the
 *     print inside a helper that still prints
 *
 *   node scripts/console-ratchet.js                 check
 *   node scripts/console-ratchet.js --json          verdict
 *   node scripts/console-ratchet.js --save-baseline accept counts
 *
 * Token-verified census — console mentions inside strings and comments
 * do not count (the covenant lesson: the law reads code, not prose
 * about code). Counts only; nothing here touches the coherence channel.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { createGate, requireGate } = require('../src/core/covenant-fractal');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, '.console-baseline.json');
const METHODS = new Set(['log', 'info', 'warn', 'error', 'debug', 'trace']);

const _writeBaseline = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
});

/** Count console.<method>( call sites in one source, token-verified. */
function countConsoleCalls(code) {
  const { tokenize } = require('../src/audit/parser');
  let toks;
  try { toks = tokenize(code); } catch { return null; }
  const exec = toks.filter((t) => t.type !== 'comment');
  let count = 0;
  for (let i = 0; i < exec.length - 3; i++) {
    const [a, b, c, d] = [exec[i], exec[i + 1], exec[i + 2], exec[i + 3]];
    if (a.type === 'identifier' && a.value === 'console' &&
        b.value === '.' && c.type === 'identifier' && METHODS.has(c.value) &&
        d.value === '(') {
      const prev = exec[i - 1];
      if (prev && prev.value === '.') continue; // x.console.log — not the global
      count++;
    }
  }
  return count;
}
countConsoleCalls.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 12, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

/** Census src/: { file: count } for every printing file. */
function censusConsole() {
  const files = execSync('git ls-files src', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => f.endsWith('.js'));
  const out = {};
  let total = 0;
  for (const f of files) {
    let code;
    try { code = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    const n = countConsoleCalls(code);
    if (n) { out[f] = n; total += n; }
  }
  return { byFile: out, total };
}
censusConsole.atomicProperties = {
  charge: 0, valence: 1, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 12, period: 3,
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
  const current = censusConsole();

  if (argv.includes('--save-baseline')) {
    const prev = loadBaseline();
    const data = JSON.stringify({
      note: 'console baseline — token-verified console.<method>( call sites in src/, per file. Shrink-only: migrate to a logger or remove; new print surface blocks.',
      savedAt: new Date().toISOString(),
      total: current.total,
      byFile: current.byFile,
    }, null, 1) + '\n';
    _writeBaseline(_sealedGate(), BASELINE_PATH, data);
    console.log(`[console-ratchet] baseline saved: ${prev ? prev.total : 'none'} -> ${current.total} print sites in ${Object.keys(current.byFile).length} files`);
    return 0;
  }

  const baseline = loadBaseline();
  if (!baseline) {
    console.error('[console-ratchet] no baseline — run --save-baseline first');
    return 1;
  }
  const grown = [], fresh = [];
  for (const [f, n] of Object.entries(current.byFile)) {
    const base = baseline.byFile[f];
    if (base === undefined) fresh.push({ f, n });
    else if (n > base) grown.push({ f, n, base });
  }
  const ok = !grown.length && !fresh.length;
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ok, total: current.total, baseline: baseline.total, fresh, grown }, null, 1));
    return ok ? 0 : 1;
  }
  if (ok) {
    console.log(`[console-ratchet] ✓ holds — ${current.total} print sites (baseline ${baseline.total})`);
    if (current.total < baseline.total) console.log('  the print surface shrank — run --save-baseline to ratchet down');
    return 0;
  }
  console.error('[console-ratchet] ✗ BLOCKED — the print surface grew:');
  for (const g of fresh) console.error(`  NEW printing file: ${g.f} (${g.n})`);
  for (const g of grown) console.error(`  ${g.f}: ${g.base} -> ${g.n}`);
  console.error('  route it through a logger, or keep output in scripts/ and bin/ where print is the job.');
  return 1;
}
main.atomicProperties = {
  charge: 1, valence: 2, mass: 'medium', spin: 'odd', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.7, group: 18, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

if (require.main === module) process.exit(main());
module.exports = { countConsoleCalls, censusConsole };
