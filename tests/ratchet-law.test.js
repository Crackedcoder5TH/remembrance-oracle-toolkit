'use strict';
// @oracle-infrastructure — helper functions exercise the gate in isolated tests.
/**
 * ratchet-law.test.js — a gate only ratchets down.
 *
 * refuseIfLoosening: no debt → proceed; debt → refuse; debt + --accept-debt
 * without a reason → refuse; debt + --accept-debt --reason → proceed AND the
 * acceptance is appended to the governed debt ledger (never overwritten).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-law-'));
process.env.DEBT_LEDGER_PATH = path.join(tmp, 'debt.json');
const { refuseIfLoosening, debtLine, DEBT_LEDGER } = require('../scripts/lib/ratchet-law');

function quiet(fn) {
  const orig = console.error; const lines = [];
  console.error = (...a) => lines.push(a.join(' '));
  try { return { out: fn(), lines }; } finally { console.error = orig; }
}

test('no debt: the save proceeds silently', () => {
  const { out, lines } = quiet(() => refuseIfLoosening('x-ratchet', [], ['--save-baseline']));
  assert.equal(out, false);
  assert.equal(lines.length, 0);
});

test('debt: the save is refused and every item is named with ✗', () => {
  const { out, lines } = quiet(() => refuseIfLoosening('x-ratchet', ['NEW monolith: a.js', 'GREW: b.js 10 -> 12'], ['--save-baseline']));
  assert.equal(out, true);
  assert.ok(lines[0].includes('✗ save REFUSED'));
  assert.ok(lines[0].includes('DEBT: 2'));
  assert.ok(lines.some((l) => l.includes('NEW monolith: a.js')));
  assert.ok(lines.some((l) => l.includes('GREW: b.js 10 -> 12')));
  assert.ok(!fs.existsSync(DEBT_LEDGER), 'a refusal writes nothing');
});

test('--accept-debt without --reason is still refused', () => {
  const { out, lines } = quiet(() => refuseIfLoosening('x-ratchet', ['NEW: c.js'], ['--save-baseline', '--accept-debt']));
  assert.equal(out, true);
  assert.ok(lines.some((l) => l.includes('--reason')));
});

test('--accept-debt --reason proceeds and is witnessed in the append-only ledger', () => {
  const r1 = quiet(() => refuseIfLoosening('x-ratchet', ['NEW: c.js'], ['--accept-debt', '--reason', 'owner decision one']));
  assert.equal(r1.out, false);
  const r2 = quiet(() => refuseIfLoosening('y-ratchet', ['GREW: d.js 1 -> 3'], ['--accept-debt', '--reason', 'owner decision two']));
  assert.equal(r2.out, false);
  const ledger = JSON.parse(fs.readFileSync(DEBT_LEDGER, 'utf8'));
  assert.equal(ledger.accepted.length, 2, 'appended, not overwritten');
  assert.equal(ledger.accepted[0].gate, 'x-ratchet');
  assert.equal(ledger.accepted[0].reason, 'owner decision one');
  assert.deepEqual(ledger.accepted[1].items, ['GREW: d.js 1 -> 3']);
  assert.match(ledger.accepted[1].at, /^\d{4}-\d{2}-\d{2}T/);
});

test('debtLine names the count', () => {
  assert.equal(debtLine('z', 3), '[z] DEBT 3 — the gate holds its floor; the code owes 3 item(s)');
});
