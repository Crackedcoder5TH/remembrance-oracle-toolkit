#!/usr/bin/env node
'use strict';

/**
 * silent-catch-ratchet — swallowed failure can only shrink.
 *
 * The plain-engineering audit (2026-08-09) counted 475 catch blocks in
 * src/ whose body holds zero executable tokens — empty, or comments
 * only. Each one makes a real failure structurally invisible: corrupted
 * state, permission errors, broken requires all vanish into the same
 * silence. Best-effort is a legitimate design stance; an UNCOUNTED
 * best-effort surface is a bound nobody watches.
 *
 * THE INVARIANT (per-file counts, like the size ratchet)
 *   - a file's swallow count can only fall
 *   - a NEW file with swallowed catches blocks
 *   - the healing move is naming the failure — a counter, a debug line,
 *     a rethrow — never deleting the try
 *
 *   node scripts/silent-catch-ratchet.js                 check
 *   node scripts/silent-catch-ratchet.js --json          verdict
 *   node scripts/silent-catch-ratchet.js --save-baseline accept counts
 *
 * Tokenizer-backed census — comment-only bodies count as swallowed
 * because a comment executes nothing. Counts only; nothing here touches
 * the coherence channel.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { createGate, requireGate } = require('../src/core/covenant-fractal');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, '.silent-catch-baseline.json');

const _writeBaseline = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
});

/** Count catch clauses with zero executable body tokens in one source. */
function countSwallowedCatches(code) {
  const { tokenize } = require('../src/audit/parser');
  let toks;
  try { toks = tokenize(code); } catch { return null; }
  const exec = toks.filter((t) => t.type !== 'comment');
  let swallowed = 0;
  for (let i = 0; i < exec.length; i++) {
    const t = exec[i];
    if (!(t.type === 'keyword' && t.value === 'catch')) continue;
    let j = i + 1;
    if (exec[j] && exec[j].value === '(') {
      let d = 0;
      for (; j < exec.length; j++) {
        if (exec[j].value === '(') d++;
        else if (exec[j].value === ')') { d--; if (d === 0) { j++; break; } }
      }
    }
    if (!exec[j] || exec[j].value !== '{') continue;
    let d = 0, body = 0, k = j;
    for (; k < exec.length; k++) {
      if (exec[k].value === '{') d++;
      else if (exec[k].value === '}') { d--; if (d === 0) break; }
      else if (d >= 1) body++;
    }
    if (body === 0) swallowed++;
  }
  return swallowed;
}
countSwallowedCatches.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 12, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

/** Census src/: { file: count } for every file with swallowed catches. */
function censusSwallowed() {
  const files = execSync('git ls-files src', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => f.endsWith('.js'));
  const out = {};
  let total = 0;
  for (const f of files) {
    let code;
    try { code = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    const n = countSwallowedCatches(code);
    if (n) { out[f] = n; total += n; }
  }
  return { byFile: out, total };
}
censusSwallowed.atomicProperties = {
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
  const current = censusSwallowed();

  if (argv.includes('--save-baseline')) {
    const prev = loadBaseline();
    const data = JSON.stringify({
      note: 'silent-catch baseline — catch blocks with zero executable body tokens, per file. Shrink-only: name the failure, never delete the try.',
      savedAt: new Date().toISOString(),
      total: current.total,
      byFile: current.byFile,
    }, null, 1) + '\n';
    _writeBaseline(_sealedGate(), BASELINE_PATH, data);
    console.log(`[silent-catch] baseline saved: ${prev ? prev.total : 'none'} -> ${current.total} swallowed catches in ${Object.keys(current.byFile).length} files`);
    return 0;
  }

  const baseline = loadBaseline();
  if (!baseline) {
    console.error('[silent-catch] no baseline — run --save-baseline first');
    return 1;
  }
  const grown = [], fresh = [];
  for (const [f, n] of Object.entries(current.byFile)) {
    const base = baseline.byFile[f];
    if (base === undefined) fresh.push({ f, n });
    else if (n > base) grown.push({ f, n, base });
  }
  const shrunk = current.total < baseline.total;
  const ok = !grown.length && !fresh.length;
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ok, total: current.total, baseline: baseline.total, fresh, grown }, null, 1));
    return ok ? 0 : 1;
  }
  if (ok) {
    console.log(`[silent-catch] ✓ holds — ${current.total} swallowed catches (baseline ${baseline.total})`);
    if (shrunk) console.log('  the silence shrank — run --save-baseline to ratchet down');
    return 0;
  }
  console.error('[silent-catch] ✗ BLOCKED — swallowed failure grew:');
  for (const g of fresh) console.error(`  NEW file swallows: ${g.f} (${g.n})`);
  for (const g of grown) console.error(`  ${g.f}: ${g.base} -> ${g.n}`);
  console.error('  name the failure (counter, debug line, rethrow) — silence is not error handling.');
  return 1;
}
main.atomicProperties = {
  charge: 1, valence: 2, mass: 'medium', spin: 'odd', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.7, group: 18, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

if (require.main === module) process.exit(main());
module.exports = { countSwallowedCatches, censusSwallowed };
