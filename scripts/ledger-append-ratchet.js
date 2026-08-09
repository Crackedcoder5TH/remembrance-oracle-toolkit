#!/usr/bin/env node
'use strict';

/**
 * ledger-append-ratchet — history physically cannot rewrite.
 *
 * The law: ledgers are append-only. Catches, traps, integrals, archives —
 * cleaning removes labels, never memory. Until 2026-08-09 only convention
 * enforced it; this gate makes an edit or deletion of an existing ledger
 * entry impossible to commit. It is, deliberately, the gate that catches
 * the AI "tidying up" a catch entry it starred in.
 *
 * THE INVARIANT — for every governed ledger staged in a commit:
 *   - every entry present in HEAD must appear in the staged version
 *     byte-identical (deep-equal), in the same order, as a prefix
 *   - appends after the last HEAD entry pass
 *   - anything else blocks; there is no --save-baseline and no acceptance
 *     path, because HEAD is the baseline and history is the invariant
 *
 *   node scripts/ledger-append-ratchet.js           check staged ledgers
 *   node scripts/ledger-append-ratchet.js --json    machine-readable
 *
 * Census only — nothing here feeds the field.
 */

const path = require('node:path');
const { execSync, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

// Governed ledgers and the JSON path of their append-only array.
const LEDGERS = [
  { file: 'seeds/catches.seed.json', arrayKey: 'catches' },
  { file: 'seeds/traps.seed.json', arrayKey: 'traps' },
];

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}
stableStringify.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.4, group: 16, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/** Read a ledger's entry array at a git revision ('' = staged index). */
function entriesAt(rev, file, arrayKey) {
  let raw;
  try {
    raw = rev === ':staged'
      ? execFileSync('git', ['show', `:${file}`], { cwd: ROOT, encoding: 'utf8' })
      : execFileSync('git', ['show', `${rev}:${file}`], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return null; // absent at this revision
  }
  try {
    const parsed = JSON.parse(raw);
    const arr = parsed[arrayKey];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return { parseError: true };
  }
}
entriesAt.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.4, group: 11, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/** HEAD entries must be a byte-identical ordered prefix of staged entries. */
function verifyAppendOnly(headEntries, stagedEntries) {
  if (stagedEntries && stagedEntries.parseError) return { ok: false, reason: 'staged ledger is not valid JSON' };
  if (!headEntries || headEntries.parseError) return { ok: true, appended: (stagedEntries || []).length };
  if (!stagedEntries) return { ok: false, reason: 'ledger deleted' };
  if (stagedEntries.length < headEntries.length) {
    return { ok: false, reason: `entries deleted: ${headEntries.length} -> ${stagedEntries.length}` };
  }
  for (let i = 0; i < headEntries.length; i++) {
    if (stableStringify(headEntries[i]) !== stableStringify(stagedEntries[i])) {
      return { ok: false, reason: `entry ${i + 1} modified (history is append-only)` };
    }
  }
  return { ok: true, appended: stagedEntries.length - headEntries.length };
}
verifyAppendOnly.atomicProperties = {
  charge: 1, valence: 2, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.7, group: 18, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function main() {
  const argv = process.argv.slice(2);
  let staged = [];
  try {
    staged = execSync('git diff --cached --name-only', { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch { /* not a repo? nothing to guard */ }

  const results = [];
  for (const { file, arrayKey } of LEDGERS) {
    if (!staged.includes(file)) continue;
    const head = entriesAt('HEAD', file, arrayKey);
    const idx = entriesAt(':staged', file, arrayKey);
    const v = verifyAppendOnly(head, idx);
    results.push({ file, ...v });
  }
  const ok = results.every((r) => r.ok);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ok, checked: results }, null, 1));
    return ok ? 0 : 1;
  }
  if (!results.length) {
    console.log('[ledger-append] ✓ no governed ledgers staged');
    return 0;
  }
  for (const r of results) {
    if (r.ok) console.log(`[ledger-append] ✓ ${r.file} — append-only holds (${r.appended} appended)`);
    else console.error(`[ledger-append] ✗ BLOCKED — ${r.file}: ${r.reason}`);
  }
  if (!ok) console.error('  ledgers are memory. Append a correction entry; never edit the past.');
  return ok ? 0 : 1;
}
main.atomicProperties = {
  charge: 1, valence: 2, mass: 'light', spin: 'odd', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.7, group: 18, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

if (require.main === module) process.exit(main());
module.exports = { verifyAppendOnly, entriesAt, LEDGERS };
