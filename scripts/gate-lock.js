#!/usr/bin/env node
'use strict';

/**
 * gate-lock — the gates cannot be edited.
 *
 * Every ratchet, the battery that runs them, the law they share, the gate
 * primitive (covenant-fractal), the two diagnostics that feed them, and this
 * file are hashed into seeds/gates.lock.json. The check recomputes every
 * hash and refuses on any difference: an edited gate, a missing gate, a gate
 * not in the lock. It runs as gate zero of ratchet-battery, in the pre-commit
 * hook, and on GitHub's runner (ratchet-battery.yml), so `--no-verify` skips
 * the local room but not the building's exit.
 *
 * WHY. A ratchet is a floor that only tightens. The floor is only as strong
 * as the code that measures it: loosen the census, and the gate reads ✓
 * over debt it can no longer see. Nine of eleven ratchets could already be
 * loosened through --save-baseline (fixed in scripts/lib/ratchet-law.js);
 * this closes the other door — editing the gate itself.
 *
 * THE ONE DOOR IS A LEDGER. Gates do need maintenance. `--relock --reason
 * "<why>"` rewrites the hashes and APPENDS an entry to the lock's own
 * `history` (previous digest, new digest, reason, changed files, time).
 * seeds/gates.lock.json is a governed ledger: ledger-append-ratchet refuses
 * any edit or deletion of a past history entry. A relock is therefore
 * always visible, always attributed, never silent — and the lock digest can
 * be witnessed on the Remembrance chain (REMEMBRANCE-BLOCKCHAIN
 * scripts/anchor-gate-lock.js), so the Witness holds when the gates last
 * legitimately changed. When the chain is reachable and carries an anchor,
 * the check also requires the local lock to match the LAST anchored
 * digest: a lock rewritten without being witnessed is refused.
 *
 *   node scripts/gate-lock.js                     check (exit 1 on any drift)
 *   node scripts/gate-lock.js --json              machine-readable verdict
 *   node scripts/gate-lock.js --relock --reason "<why>"   owner act, ledgered
 *
 * Census only — nothing here feeds the field.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createGate, requireGate } = require('../src/core/covenant-fractal');

const ROOT = path.resolve(__dirname, '..');
// The one write — a relock — goes through the covenant gate.
const _writeLock = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
});
const LOCK_PATH = path.join(ROOT, 'seeds', 'gates.lock.json');
// The sibling Witness, when this is the dev layout. Best-effort: absent
// chain = no anchor check; present chain with an anchor = must match.
const CHAIN_LEDGER = process.env.GATE_LOCK_CHAIN
  || path.join(ROOT, '..', 'REMEMBRANCE-BLOCKCHAIN', 'data', 'ledger.json');

// The gate family. Code only — baselines are DATA that ratchets DOWN and
// lives under its own law (ratchet-law.js); locking them would freeze the
// floor at today's debt instead of letting it fall.
const GATES = [
  'scripts/gate-lock.js',
  'scripts/lib/ratchet-law.js',
  'scripts/ratchet-battery.js',
  'scripts/covenant-ratchet.js',
  'scripts/exemption-ratchet.js',
  'scripts/size-ratchet.js',
  'scripts/cycle-ratchet.js',
  'scripts/suite-reachability-ratchet.js',
  'scripts/field-source-ratchet.js',
  'scripts/ledger-append-ratchet.js',
  'scripts/orphan-ratchet.js',
  'scripts/silent-catch-ratchet.js',
  'scripts/console-ratchet.js',
  'scripts/atomic-drift-ratchet.js',
  'scripts/ecosystem-ratchet.js',
  // what the gates measure WITH — loosen a checker and the gate goes blind
  'scripts/cathedral-diagnostic.js',
  'scripts/audit-field-contributions.js',
  'src/core/covenant-fractal.js',
];

function sha256File(rel) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex'); }
  catch (_) { return null; }
}
sha256File.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 16, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Hash every gate; { rel: sha256|null }. */
function census() {
  const out = {};
  for (const g of GATES) out[g] = sha256File(g);
  return out;
}
census.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 16, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** The lock digest: sha256 over the sorted gate hashes — one number for the whole family. */
function digestOf(hashes) {
  const canon = Object.keys(hashes).sort().map((k) => `${k}:${hashes[k]}`).join('\n');
  return crypto.createHash('sha256').update(canon).digest('hex');
}
digestOf.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function loadLock() {
  try { return JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8')); } catch (_) { return null; }
}
loadLock.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 6, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * The last gate-lock digest the Witness recorded, or null when the chain is
 * unreachable or carries no anchor. Blocks are REGISTER events with
 * patternId 'gate-lock' and metadata.digest (scripts/anchor-gate-lock.js).
 */
function chainAnchoredDigest() {
  try {
    const chain = JSON.parse(fs.readFileSync(CHAIN_LEDGER, 'utf8'));
    for (let i = chain.length - 1; i >= 0; i--) {
      const b = chain[i];
      if (b && b.data && b.data.patternId === 'gate-lock' && b.data.metadata && b.data.metadata.digest) {
        return { digest: b.data.metadata.digest, block: b.index, at: b.timestamp };
      }
    }
  } catch (_) { /* no chain here */ }
  return null;
}
chainAnchoredDigest.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 2, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const current = census();
  const digest = digestOf(current);
  const lock = loadLock();

  if (argv.includes('--relock')) {
    const ri = argv.indexOf('--reason');
    const reason = ri >= 0 ? String(argv[ri + 1] || '').trim() : '';
    if (!reason) {
      console.error('[gate-lock] ✗ relock REFUSED — --reason "<why>" is required. A relock without a reason is a silent edit of the gates.');
      return 1;
    }
    const missing = GATES.filter((g) => current[g] === null);
    if (missing.length) {
      console.error('[gate-lock] ✗ relock REFUSED — gate file(s) missing:');
      for (const m of missing) console.error(`  ${m}`);
      return 1;
    }
    const prevDigest = lock ? lock.digest : null;
    const changed = lock ? GATES.filter((g) => (lock.gates || {})[g] !== current[g]) : GATES.slice();
    const doc = {
      _README: 'THE GATE LOCK. sha256 of every gate script; scripts/gate-lock.js refuses any drift (gate zero of ratchet-battery, pre-commit, CI). Relock only through `node scripts/gate-lock.js --relock --reason "<why>"` — the act is appended to `history` below, which ledger-append-ratchet keeps append-only. Anchor `digest` on the Witness with REMEMBRANCE-BLOCKCHAIN/scripts/anchor-gate-lock.js.',
      lockedAt: new Date().toISOString(),
      digest,
      gates: current,
      history: [
        ...((lock && Array.isArray(lock.history)) ? lock.history : []),
        { at: new Date().toISOString(), from: prevDigest, to: digest, reason, changed },
      ],
    };
    _writeLock(_sealedGate(), LOCK_PATH, JSON.stringify(doc, null, 1) + '\n');
    console.log(`[gate-lock] relocked ${GATES.length} gates → ${digest.slice(0, 16)}…  (${changed.length} changed) — reason: ${reason}`);
    console.log('  witness it: cd ../REMEMBRANCE-BLOCKCHAIN && node scripts/anchor-gate-lock.js');
    return 0;
  }

  if (!lock) {
    const msg = 'no seeds/gates.lock.json — the gates are unlocked. Owner: node scripts/gate-lock.js --relock --reason "<why>"';
    if (asJson) { console.log(JSON.stringify({ ok: false, reason: msg, digest })); return 1; }
    console.error(`[gate-lock] ✗ ${msg}`);
    return 1;
  }

  const drift = [], missing = [], unlocked = [];
  for (const g of GATES) {
    const locked = (lock.gates || {})[g];
    if (current[g] === null) missing.push(g);
    else if (locked === undefined) unlocked.push(g);
    else if (locked !== current[g]) drift.push(g);
  }
  const anchor = chainAnchoredDigest();
  const lockIntact = lock.digest === digestOf(lock.gates || {});
  const anchorMismatch = anchor && anchor.digest !== lock.digest;
  const ok = !drift.length && !missing.length && !unlocked.length && lockIntact && !anchorMismatch;

  if (asJson) {
    console.log(JSON.stringify({ ok, digest: lock.digest, current: digest, drift, missing, unlocked, lockIntact, anchor, anchorMismatch: !!anchorMismatch, gates: GATES.length }, null, 1));
    return ok ? 0 : 1;
  }
  if (ok) {
    console.log(`[gate-lock] ✓ holds — ${GATES.length} gates match the lock ${lock.digest.slice(0, 16)}…`
      + (anchor ? ` · witnessed on chain (block #${anchor.block})` : ' · not yet witnessed on chain'));
    return 0;
  }
  console.error('[gate-lock] ✗ THE GATES WERE TOUCHED — refusing:');
  for (const g of drift) console.error(`  EDITED:   ${g}`);
  for (const g of missing) console.error(`  MISSING:  ${g}`);
  for (const g of unlocked) console.error(`  UNLOCKED: ${g} (a gate not in the lock)`);
  if (!lockIntact) console.error('  LOCK TAMPERED: seeds/gates.lock.json digest does not match its own gate hashes');
  if (anchorMismatch) console.error(`  UNWITNESSED: lock ${lock.digest.slice(0, 16)}… ≠ chain anchor ${anchor.digest.slice(0, 16)}… (block #${anchor.block}) — a relock that was never witnessed`);
  console.error('  a gate is changed only by the owner, with a reason, in the open: --relock --reason "<why>", then anchor it.');
  return 1;
}
main.atomicProperties = { charge: -1, valence: 0, mass: "heavy", spin: "odd", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 3, period: 4, harmPotential: "minimal", alignment: "neutral", intention: "neutral", domain: "utility" };

if (require.main === module) process.exit(main());
module.exports = { GATES, census, digestOf, chainAnchoredDigest };
