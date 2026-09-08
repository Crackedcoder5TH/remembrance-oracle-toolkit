#!/usr/bin/env node
'use strict';
/**
 * contracts-ratchet — every falsifiable contract is a gate.
 *
 * Void's verify_capabilities.py is the truth-spine: 64 claims, each a
 * callable that returns (passed, observed). It ran behind a verb
 * (`goggles --do contracts`) and its last verdict travelled on every goggle
 * read — but nothing REFUSED on it. A contract that fell from pass to fail
 * was a line in a report, not a stopped commit. Measured 2026-09-07: C-62
 * (the goggles skill byte-identical across repos) had been failing on the
 * chain repo's drifted run.mjs through a whole round of coined commits, and
 * every gate held.
 *
 * THE LAW, same as every ratchet here (scripts/lib/ratchet-law.js):
 *   - the set of FAILING contracts is the debt. It only shrinks: a contract
 *     that passed at the baseline and fails now BLOCKS; a contract failing
 *     at the baseline is carried debt, named on every read.
 *   - a NEW contract (an id the baseline never saw) must pass — or be
 *     carried in by name with --save-baseline --accept-debt --reason.
 *   - a contract that DISAPPEARS blocks: the truth-spine does not lose
 *     claims silently (retiring one is an owner act, saved with a reason).
 *   - the verdict must be CURRENT. The battery reads the persisted verdict
 *     (.remembrance/contracts-latest.json, written only by a FULL run) and
 *     refuses when it was taken at a different Void HEAD than the one
 *     checked out, or is older than MAX_AGE_H — a stale verdict is not a
 *     verdict. `--run` takes the suite fresh through the same script the
 *     goggles verb runs.
 *   - UNREAD is not PASS: on a host without Void (the hub's own CI runner)
 *     the gate prints one loud UNREAD line and does not block — it cannot
 *     see its subject and says so, claiming neither health nor breakage.
 *     Where Void is present, a missing or stale verdict blocks.
 *
 *   node scripts/contracts-ratchet.js                  check the persisted verdict
 *   node scripts/contracts-ratchet.js --run            run the suite, then check
 *   node scripts/contracts-ratchet.js --json           machine-readable
 *   node scripts/contracts-ratchet.js --save-baseline  ratchet the failing set down
 *
 * Reached through the goggles: `--do gate contracts [--run]`.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createGate, requireGate } = require('../src/core/covenant-fractal');
const { refuseIfLoosening } = require('./lib/ratchet-law');

const ROOT = path.resolve(__dirname, '..');
const VOID = process.env.VOID_DIR || path.join(path.dirname(ROOT), 'Void-Data-Compressor');
const LATEST = process.env.CONTRACTS_LATEST || path.join(VOID, '.remembrance', 'contracts-latest.json');
const BASELINE_PATH = process.env.CONTRACTS_BASELINE || path.join(ROOT, '.contracts-baseline.json');
const MAX_AGE_H = 48;

const _writeBaseline = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
});

/** Void's HEAD on this host, or null outside a checkout. */
function voidHead() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: VOID, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; }
  catch (_) { return null; }
}
voidHead.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 9, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Take the suite fresh — the same script the goggles verb runs, full, so the verdict is persisted. */
function runSuite() {
  try {
    execFileSync('python3', ['verify_capabilities.py', '--json'], { cwd: VOID, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
    return true;
  } catch (e) {
    // --strict is not passed, so a non-zero exit is the harness itself dying, not a failing claim
    console.error(`[contracts] the suite did not complete: ${(e.stderr || e.message || '').toString().split('\n').slice(-3).join(' ')}`);
    return false;
  }
}
runSuite.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** The persisted verdict, with its currency judged against Void's HEAD and the clock. */
function readLatest() {
  if (!fs.existsSync(LATEST)) return { error: `no persisted verdict at ${LATEST} — run goggles --do contracts (or --run here)` };
  let doc;
  try { doc = JSON.parse(fs.readFileSync(LATEST, 'utf8')); }
  catch (e) { return { error: `unreadable verdict: ${e.message}` }; }
  if (!Array.isArray(doc.failing) || typeof doc.total !== 'number') return { error: 'verdict carries no failing list / total' };
  const head = voidHead();
  const ageH = doc.ran_at ? (Date.now() - Date.parse(doc.ran_at)) / 3.6e6 : Infinity;
  const stale = [];
  if (head && doc.head && doc.head !== head) stale.push(`taken at Void ${doc.head}, Void is at ${head}`);
  if (!(ageH <= MAX_AGE_H)) stale.push(`taken ${Number.isFinite(ageH) ? ageH.toFixed(1) + ' h' : 'an unknown time'} ago (max ${MAX_AGE_H} h)`);
  return { doc, head, ageH, stale };
}
readLatest.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "liquid", reactivity: "medium", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function loadBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); } catch (_) { return null; }
}
loadBaseline.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 6, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Judge a current verdict against the baseline: the failing set only shrinks, the claim set never silently changes. */
function judge(doc, baseline) {
  const failing = new Set(doc.failing);
  const baseFailing = new Set(baseline.failing || []);
  const regressed = [...failing].filter((id) => !baseFailing.has(id) && (baseline.ids || []).includes(id));
  const fresh = [...failing].filter((id) => !(baseline.ids || []).includes(id));   // a new contract that fails
  const carried = [...failing].filter((id) => baseFailing.has(id));
  const paid = [...baseFailing].filter((id) => !failing.has(id));
  const lost = typeof baseline.total === 'number' && doc.total < baseline.total ? baseline.total - doc.total : 0;
  const ok = regressed.length === 0 && fresh.length === 0 && lost === 0;
  return { ok, regressed, fresh, carried, paid, lost };
}
judge.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Every claim id the suite knows, read from the harness itself (the baseline keeps them so a vanished claim is seen). */
function claimIds() {
  try {
    const src = fs.readFileSync(path.join(VOID, 'verify_capabilities.py'), 'utf8');
    return [...new Set([...src.matchAll(/^\s*\('(C-\d+)',/gm)].map((m) => m[1]))];
  } catch (_) { return []; }
}
claimIds.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 6, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  if (argv.includes('--run') && !runSuite()) return 1;

  // UNREAD is not PASS. On a host without Void (the hub's own CI runner
  // checks out the hub alone) the truth-spine cannot be read at all; the
  // gate says so in one loud line and does not block, because a gate that
  // cannot see its subject must not claim the subject is fine — nor that it
  // is broken. Where Void is present, a missing or stale verdict BLOCKS.
  if (!fs.existsSync(path.join(VOID, 'verify_capabilities.py'))) {
    const line = `[contracts] UNREAD — Void is not on this host (${VOID}); the truth-spine is read where Void is checked out`;
    if (json) console.log(JSON.stringify({ ok: true, unread: true, why: line }, null, 1)); else console.log(line);
    return 0;
  }
  const latest = readLatest();
  if (latest.error) { console.error(`[contracts] ✗ ${latest.error}`); return 1; }
  const { doc, stale } = latest;
  const ids = claimIds();

  if (argv.includes('--save-baseline')) {
    if (stale.length) { console.error(`[contracts] ✗ save REFUSED — the verdict is STALE (${stale.join('; ')}); a floor is saved from a current reading only`); return 1; }
    const prev = loadBaseline();
    if (prev) {
      const j = judge(doc, prev);
      const debt = [
        ...j.regressed.map((id) => `REGRESSED: ${id} passed at the baseline and fails now`),
        ...j.fresh.map((id) => `NEW contract fails: ${id}`),
        ...(j.lost ? [`LOST: ${j.lost} claim(s) vanished from the suite (${prev.total} -> ${doc.total})`] : []),
      ];
      if (refuseIfLoosening('contracts', debt, argv)) return 1;
    }
    const data = JSON.stringify({
      note: 'contracts baseline — the set of FAILING falsifiable contracts (Void verify_capabilities.py) the code still owes. Shrink-only: a contract that passes here may never fail again; a new contract must pass; a vanished claim is an owner act.',
      savedAt: new Date().toISOString(),
      head: doc.head || null,
      total: doc.total,
      ids: ids.length ? ids : undefined,
      failing: [...doc.failing].sort(),
    }, null, 1) + '\n';
    _writeBaseline(_sealedGate(), BASELINE_PATH, data);
    console.log(`[contracts] baseline saved: ${prev ? prev.failing.length : 'none'} -> ${doc.failing.length} failing of ${doc.total} (at Void ${doc.head})`);
    return 0;
  }

  const baseline = loadBaseline();
  if (!baseline) { console.error('[contracts] no baseline — run --save-baseline first'); return 1; }
  const j = judge(doc, baseline);
  const ok = j.ok && stale.length === 0;
  if (json) { console.log(JSON.stringify({ ok, stale, total: doc.total, passed: doc.passed, head: doc.head, ...j }, null, 1)); return ok ? 0 : 1; }
  if (stale.length) {
    console.error(`[contracts] ✗ STALE verdict — ${stale.join('; ')} — goggles --do contracts (a stale verdict is not a verdict)`);
    return 1;
  }
  if (ok) {
    console.log(`[contracts] ✓ holds — ${doc.passed}/${doc.total} contracts pass at Void ${doc.head}; debt ${j.carried.length} carried [${j.carried.join(', ') || '—'}]`);
    if (j.paid.length) console.log(`  paid: ${j.paid.join(', ')} — run --save-baseline to ratchet down`);
    return 0;
  }
  console.error('[contracts] ✗ BLOCKED — the truth-spine regressed:');
  for (const id of j.regressed) console.error(`  REGRESSED: ${id} passed at the baseline and fails now`);
  for (const id of j.fresh) console.error(`  NEW contract fails: ${id}`);
  if (j.lost) console.error(`  LOST: ${j.lost} claim(s) vanished from the suite (${baseline.total} -> ${doc.total})`);
  console.error('  fix the code, never the gate — goggles --do contracts --id <C-nn> to see one claim in full');
  return 1;
}
main.atomicProperties = { charge: 1, valence: 0, mass: "heavy", spin: "odd", phase: "liquid", reactivity: "low", electronegativity: 0, group: 3, period: 4, harmPotential: "minimal", alignment: "neutral", intention: "neutral", domain: "utility" };

if (require.main === module) process.exit(main());
module.exports = { judge, readLatest, claimIds, BASELINE_PATH, LATEST, MAX_AGE_H };
