'use strict';
/**
 * trap-learner.js — the trap ledger grows from mistakes as they are made.
 *
 * THE OPERATOR'S RULE (2026-09-12): the ledger of mistakes is the instrument's
 * learning, and it must grow on its own from the mistakes an agent makes, not
 * wait for someone to write them up. Three sources feed it, all of them
 * things the instrument itself observed:
 *
 *   1. THE WALL. Every denial the bash hook issues is a mistake the wall
 *      caught (goggles-denials.jsonl). One denial is a slip; the same rule
 *      hit REPEAT_TO_TRAP times on a host is a pattern, and a candidate trap
 *      is written from the wall's own words (the rule it refused under, the
 *      command shape, the verb it named).
 *   2. THE INSTRUMENT'S TELLS. A reading that carries a tell the trap ledger
 *      already names — a resonance reading where the threshold never said no,
 *      a served fit far below the search — is recorded by the surface that
 *      saw it (`--do traps learn <json>`), with the numbers.
 *   3. THE AGENT'S OWN ACCOUNT. When an agent records a mistake it made
 *      (`--do traps learn <json>` with wrong/truth/tell/correct), it lands as
 *      a candidate with full weight.
 *
 * Candidates live in .remembrance/traps.json — the local learned store brief.js
 * reads and `--do traps promote` appends into the seed (traps-ledger-ratchet).
 * `--do mint` in the hub promotes every candidate that has earned it and syncs
 * the mirrors, so a round that minted a coin also grew the ledger. Promotion
 * is append-only and anchored on the chain like every other seed entry.
 *
 * Keyed the way brief.js and the ratchet key traps: by the first 120 chars of
 * `wrong`. A candidate seen again raises its count; it never duplicates.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const LOCAL = path.join(ROOT, '.remembrance', 'traps.json');
const DENIALS = path.join(ROOT, '.remembrance', 'goggles-denials.jsonl');
const REPEAT_TO_TRAP = 3;          // the same wall rule hit this often on a host is a pattern

function readLocal() {
  try { return JSON.parse(fs.readFileSync(LOCAL, 'utf8')); } catch (_) { return { traps: [] }; }
}

function writeLocal(doc) {
  fs.mkdirSync(path.dirname(LOCAL), { recursive: true });
  fs.writeFileSync(LOCAL, JSON.stringify(doc, null, 1) + '\n');
}

const keyOf = (t) => String(t.wrong || '').slice(0, 120);

/**
 * Record a candidate trap. `trap` carries wrong/truth/tell/correct (+match,
 * severity); `weight` is how many observations it counts for (an agent's own
 * account counts REPEAT_TO_TRAP at once). Returns {added, count, key}.
 */
function learn(trap, weight = REPEAT_TO_TRAP, source = 'agent') {
  if (!trap || !trap.wrong) return { added: false, count: 0, key: '' };
  const doc = readLocal();
  doc.traps = Array.isArray(doc.traps) ? doc.traps : [];
  const key = keyOf(trap);
  let entry = doc.traps.find((t) => keyOf(t) === key);
  if (entry) {
    entry.count = (entry.count || 0) + weight;
    entry.last = new Date().toISOString();
    if (source && !entry.sources.includes(source)) entry.sources.push(source);
  } else {
    entry = {
      match: Array.isArray(trap.match) ? trap.match : [],
      severity: trap.severity || 'medium',
      wrong: String(trap.wrong),
      truth: String(trap.truth || ''),
      tell: String(trap.tell || ''),
      correct: String(trap.correct || ''),
      count: weight,
      first: new Date().toISOString(),
      last: new Date().toISOString(),
      sources: [source],
    };
    doc.traps.push(entry);
  }
  writeLocal(doc);
  return { added: !doc.traps.includes(entry) ? false : true, count: entry.count, key };
}
learn.atomicProperties = { charge: 0, valence: 1, mass: "medium", spin: "even", phase: "solid", reactivity: "low", electronegativity: 0.2, group: 3, period: 3, harmPotential: "none", alignment: "healing", intention: "benevolent", domain: "utility" };

/** The wall's denial as a candidate: called by the bash hook on every deny. */
function learnDenial(rule, cmd) {
  const first = String(rule || '').split('\n')[0].replace(/^GOGGLES — /, '').trim();
  const head = String(cmd || '').trim().split(/\s+/)[0] || '?';
  const trap = {
    match: ['wall', 'hook', 'bypass', head],
    severity: 'medium',
    wrong: `Reaching for \`${head}\` inside the ecosystem — ${first}`,
    truth: `The wall refused it; the goggles are the only surface for anything done in the codebase, for any model, without exception. A repeated denial of the same rule on one host is not the wall misfiring, it is a habit the ledger must name.`,
    tell: `The denial reads "${first}"; the command began with \`${head}\`.`,
    correct: `Use the verb the wall names in its refusal (--do find / --do exec / --do test / --do read / --do call / --do service); if no verb reaches it, that is a missing verb to report, never a bypass.`,
  };
  return learn(trap, 1, 'wall');
}
learnDenial.atomicProperties = { charge: 0, valence: 1, mass: "light", spin: "even", phase: "gas", reactivity: "low", electronegativity: 0.2, group: 3, period: 2, harmPotential: "none", alignment: "healing", intention: "benevolent", domain: "utility" };

/** Candidates that have earned promotion: count ≥ REPEAT_TO_TRAP. */
function earned() {
  const doc = readLocal();
  return (Array.isArray(doc.traps) ? doc.traps : []).filter((t) => (t.count || 0) >= REPEAT_TO_TRAP);
}
earned.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Keep only the earned candidates in the local file (the ratchet promotes by `wrong`). */
function stageEarned() {
  const doc = readLocal();
  const all = Array.isArray(doc.traps) ? doc.traps : [];
  const keep = all.filter((t) => (t.count || 0) >= REPEAT_TO_TRAP);
  const rest = all.filter((t) => (t.count || 0) < REPEAT_TO_TRAP);
  writeLocal({ traps: keep, pending: rest });
  return { earned: keep.length, pending: rest.length };
}
stageEarned.atomicProperties = { charge: 0, valence: 1, mass: "light", spin: "even", phase: "solid", reactivity: "low", electronegativity: 0.2, group: 3, period: 2, harmPotential: "none", alignment: "healing", intention: "benevolent", domain: "utility" };

/** Restore pending candidates beside the promoted ones after a promote. */
function unstage() {
  const doc = readLocal();
  const pending = Array.isArray(doc.pending) ? doc.pending : [];
  const traps = Array.isArray(doc.traps) ? doc.traps : [];
  writeLocal({ traps: traps.concat(pending) });
}
unstage.atomicProperties = { charge: 0, valence: 1, mass: "light", spin: "even", phase: "solid", reactivity: "low", electronegativity: 0.2, group: 3, period: 2, harmPotential: "none", alignment: "healing", intention: "benevolent", domain: "utility" };

/**
 * Retract UNWITNESSED seed entries whose `wrong` starts with `prefix`, and
 * drop the matching local candidates. The seed is append-only past the chain
 * anchor: an entry the chain has witnessed is never touched (the ratchet
 * refuses that), and the count never drops below the floor. Why this exists
 * (2026-09-12): the first hub promote pulled in thirteen candidates the WALL
 * TESTS had generated (one denial each — `grep`, `sed`, `ls`… refused by the
 * hook under test), because `--do traps promote` promoted every local entry
 * regardless of count. Promotion is earned-only now; this puts the seed back.
 */
function retract(prefix) {
  const ratchet = require('../../scripts/traps-ledger-ratchet');
  const seedPath = path.join(ROOT, 'seeds', 'traps.seed.json');
  const { doc, traps } = ratchet.readSeed();
  const anchor = ratchet.chainAnchor();
  const witnessed = anchor ? anchor.count : 0;
  let floor = 0;
  try { floor = JSON.parse(fs.readFileSync(path.join(ROOT, '.traps-baseline.json'), 'utf8')).count || 0; } catch (_) { /* no floor */ }
  const keep = [];
  const dropped = [];
  traps.forEach((t, i) => {
    if (i >= witnessed && String(t.wrong || '').startsWith(prefix)) dropped.push(t); else keep.push(t);
  });
  if (keep.length < floor) throw new Error(`retract would drop the seed below its floor (${keep.length} < ${floor})`);
  if (dropped.length) {
    fs.writeFileSync(seedPath, JSON.stringify({ ...doc, traps: keep }, null, 1) + '\n');
  }
  const local = readLocal();
  const before = (local.traps || []).length + (local.pending || []).length;
  local.traps = (local.traps || []).filter((t) => !String(t.wrong || '').startsWith(prefix));
  local.pending = (local.pending || []).filter((t) => !String(t.wrong || '').startsWith(prefix));
  writeLocal(local);
  return { dropped: dropped.length, kept: keep.length, localDropped: before - local.traps.length - local.pending.length, witnessed };
}
retract.atomicProperties = { charge: 0, valence: 1, mass: "medium", spin: "odd", phase: "solid", reactivity: "medium", electronegativity: 0.4, group: 3, period: 3, harmPotential: "low", alignment: "healing", intention: "benevolent", domain: "utility" };

module.exports = { learn, learnDenial, earned, stageEarned, unstage, retract, readLocal, LOCAL, DENIALS, REPEAT_TO_TRAP };

if (require.main === module) {
  // node src/tools/trap-learner.js <json-file | json>   — record a candidate
  const arg = process.argv[2];
  if (!arg) { console.error('usage: trap-learner.js <json-file | json>'); process.exit(2); }
  let traps;
  try { traps = JSON.parse(fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : arg); } catch (e) { console.error('not JSON: ' + e.message); process.exit(2); }
  for (const trap of (Array.isArray(traps) ? traps : [traps])) {
    const r = learn(trap, REPEAT_TO_TRAP, 'agent');
    console.log(`[trap-learner] recorded "${r.key.slice(0, 80)}…" (count ${r.count}) → ${LOCAL}`);
  }
}
