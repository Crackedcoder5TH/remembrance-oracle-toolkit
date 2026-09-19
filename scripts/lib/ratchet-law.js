'use strict';

/**
 * ratchet-law — the one rule every gate obeys.
 *
 *   A GATE ONLY RATCHETS DOWN. A baseline may tighten. It may never loosen.
 *   Growth is not accepted, adjudicated, grandfathered or "intentional" —
 *   growth is DEBT, and the gate's job is to name it, count it, and refuse
 *   to move until the code pays it.
 *
 * Before this module, nine of the eleven ratchets would overwrite their
 * baseline with whatever the current census said when handed
 * --save-baseline. The flag existed to follow a floor DOWN after real
 * work, and it also quietly followed it UP: a new monolith, a new print
 * site, a new exempt file, a new tangle — saved, and the gate read ✓ on
 * the next run with the debt inside the floor. Only the covenant ratchet
 * had a tighten-only seed. This module makes every save path the same:
 *
 *   const debt = [...growth the check would have blocked...];
 *   if (refuseIfLoosening('name', debt, argv)) return 1;
 *   // only then write
 *
 * THE ONE DOOR, AND IT IS A LEDGER. There is no silent way to move a floor
 * up. `--accept-debt --reason "<why>"` lets the owner carry a named debt
 * into the floor, and the act is appended to seeds/debt-accepted.ledger.json
 * — tracked, append-only (ledger-append-ratchet refuses any edit or
 * deletion of a past entry), with the gate, the reason, and every item.
 * The floor moved, and the chain of custody says who moved it and why.
 *
 * The verdict lines carry '✗' so ratchet-battery surfaces them unchanged.
 * Nothing here contributes to the field. Watching the floor is not a
 * reading, and refusing to move it is not an event.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createGate, requireGate } = require('../../src/core/covenant-fractal');

const ROOT = path.resolve(__dirname, '..', '..');
// The one write — the append-only debt ledger — goes through the covenant gate.
const _writeLedger = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
});
// Tests point this elsewhere; the real ledger is tracked and governed.
const DEBT_LEDGER = process.env.DEBT_LEDGER_PATH || path.join(ROOT, 'seeds', 'debt-accepted.ledger.json');

function _argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}
_argValue.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Append one accepted-debt entry to the governed ledger. */
function _witnessAcceptedDebt(name, debt, reason) {
  let doc = { _README: 'Append-only. Every time an owner carried DEBT into a gate floor with --accept-debt, the gate, the reason and every item are recorded here. ledger-append-ratchet refuses any edit or deletion of a past entry.', accepted: [] };
  try { doc = JSON.parse(fs.readFileSync(DEBT_LEDGER, 'utf8')); } catch (_) { /* first entry */ }
  if (!Array.isArray(doc.accepted)) doc.accepted = [];
  doc.accepted.push({ at: new Date().toISOString(), gate: name, reason, items: debt });
  _writeLedger(_sealedGate(), DEBT_LEDGER, JSON.stringify(doc, null, 1) + '\n');
}
_witnessAcceptedDebt.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "liquid", reactivity: "low", electronegativity: 0, group: 6, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * Refuse a save that would loosen the floor — unless the owner accepts the
 * debt by name, with a reason, into the witnessed ledger.
 *
 * @param {string} name — the ratchet's tag, e.g. 'size-ratchet'
 * @param {string[]} debt — one line per growth item the check would block
 * @param {string[]} [argv=process.argv] — looked at for --accept-debt / --reason
 * @returns {boolean} true when the save must NOT proceed
 */
function refuseIfLoosening(name, debt, argv = process.argv) {
  if (!Array.isArray(debt) || debt.length === 0) return false;
  const accept = Array.isArray(argv) && argv.includes('--accept-debt');
  const reason = Array.isArray(argv) ? _argValue(argv, '--reason') : null;
  if (accept && reason && String(reason).trim()) {
    _witnessAcceptedDebt(name, debt, String(reason).trim());
    console.error(`[${name}] DEBT ACCEPTED by the owner — ${debt.length} item(s) carried into the floor and witnessed in seeds/debt-accepted.ledger.json`);
    for (const d of debt) console.error(`  ${d}`);
    return false;
  }
  console.error(`[${name}] ✗ save REFUSED — a gate only ratchets down. DEBT: ${debt.length} item(s) the code still owes:`);
  for (const d of debt) console.error(`  ${d}`);
  console.error('  pay the debt in the code, then save. The floor never rises to meet the code.');
  if (accept) console.error('  (--accept-debt needs --reason "<why>" — an unexplained acceptance is a silent edit)');
  return true;
}
refuseIfLoosening.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 3, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * One line that says how much debt a gate is carrying, for check output.
 * @param {string} name
 * @param {number} count
 * @returns {string}
 */
function debtLine(name, count) {
  return `[${name}] DEBT ${count} — the gate holds its floor; the code owes ${count} item(s)`;
}
debtLine.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 13, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = { refuseIfLoosening, debtLine, DEBT_LEDGER };
