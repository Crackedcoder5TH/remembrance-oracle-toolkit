'use strict';
// @oracle-infrastructure — mutations are confined to temporary test fixtures.
// The contracts gate: Void's falsifiable contracts as a ratchet. The failing
// set only shrinks, a new contract must pass, a vanished claim blocks, and a
// verdict taken at another Void HEAD (or too long ago) is not a verdict.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { judge, MAX_AGE_H } = require('../scripts/contracts-ratchet');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'contracts-ratchet.js');
const ids = ['C-01', 'C-02', 'C-03', 'C-04'];
const baseline = { total: 4, ids, failing: ['C-04'] };

test('holds when the failing set is unchanged or shrinks', () => {
  assert.equal(judge({ total: 4, failing: ['C-04'] }, baseline).ok, true);
  const paid = judge({ total: 4, failing: [] }, baseline);
  assert.equal(paid.ok, true);
  assert.deepEqual(paid.paid, ['C-04']);
});

test('a contract that passed at the baseline and fails now blocks', () => {
  const j = judge({ total: 4, failing: ['C-02', 'C-04'] }, baseline);
  assert.equal(j.ok, false);
  assert.deepEqual(j.regressed, ['C-02']);
  assert.deepEqual(j.carried, ['C-04']);
});

test('a new contract must pass; a vanished claim blocks', () => {
  assert.deepEqual(judge({ total: 5, failing: ['C-04', 'C-05'] }, baseline).fresh, ['C-05']);
  assert.equal(judge({ total: 5, failing: ['C-04'] }, baseline).ok, true, 'a new passing contract is fine');
  const lost = judge({ total: 3, failing: [] }, baseline);
  assert.equal(lost.ok, false);
  assert.equal(lost.lost, 1);
});

/** Run the gate against a fixture Void dir + verdict + baseline; returns {code, out}. */
function runGate(latestDoc, baselineDoc, extra = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-'));
  const voidDir = path.join(dir, 'void');
  fs.mkdirSync(path.join(voidDir, '.remembrance'), { recursive: true });
  // a verify_capabilities.py so the gate sees Void as PRESENT (its claim ids are read from it)
  fs.writeFileSync(path.join(voidDir, 'verify_capabilities.py'), ids.map((i) => `    ('${i}', 'claim', fn),\n`).join(''));
  const latest = path.join(voidDir, '.remembrance', 'contracts-latest.json');
  if (latestDoc) fs.writeFileSync(latest, JSON.stringify(latestDoc));
  const base = path.join(dir, 'baseline.json');
  if (baselineDoc) fs.writeFileSync(base, JSON.stringify(baselineDoc));
  try {
    const out = execFileSync('node', [SCRIPT, '--json', ...extra], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, VOID_DIR: voidDir, CONTRACTS_LATEST: latest, CONTRACTS_BASELINE: base },
    });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}

test('a verdict older than the window is STALE and blocks; a current one holds', () => {
  const stale = runGate({ ran_at: new Date(Date.now() - (MAX_AGE_H + 1) * 3.6e6).toISOString(), head: null, total: 4, passed: 3, failing: ['C-04'] }, baseline);
  assert.equal(stale.code, 1);
  assert.match(stale.out, /stale/i);
  const fresh = runGate({ ran_at: new Date().toISOString(), head: null, total: 4, passed: 3, failing: ['C-04'] }, baseline);
  assert.equal(fresh.code, 0, fresh.out);
  assert.equal(JSON.parse(fresh.out).ok, true);
});

test('a regression blocks through the CLI; UNREAD when Void is absent does not', () => {
  const r = runGate({ ran_at: new Date().toISOString(), head: null, total: 4, passed: 2, failing: ['C-02', 'C-04'] }, baseline);
  assert.equal(r.code, 1);
  assert.deepEqual(JSON.parse(r.out).regressed, ['C-02']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-'));
  const out = execFileSync('node', [SCRIPT, '--json'], { encoding: 'utf8', env: { ...process.env, VOID_DIR: path.join(dir, 'nowhere'), CONTRACTS_BASELINE: path.join(dir, 'b.json') } });
  assert.equal(JSON.parse(out).unread, true, 'no Void on the host → UNREAD, said loudly, not a pass on the merits');
});
