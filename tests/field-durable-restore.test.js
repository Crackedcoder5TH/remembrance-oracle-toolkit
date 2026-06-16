'use strict';

/**
 * field-durable-restore — the hub reads the blockchain's committed,
 * durable field artifacts (data/field-histogram.seed.json and
 * data/ledger.json) so a fresh container comes up holding the field it
 * last checkpointed, with no external storage.
 *
 * Env overrides are set BEFORE requiring field-memory so the
 * durable-witness resolvers point at temp artifacts (node --test runs
 * each file in its own process, so this never leaks to sibling files).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fielddur-'));
const seedPath = path.join(tmp, 'field-histogram.seed.json');
const ledgerPath = path.join(tmp, 'ledger.json');
process.env.FIELD_SEED_PATH = seedPath;
process.env.COMMITTED_LEDGER_PATH = ledgerPath;
process.env.LEDGER_PATH = path.join(tmp, 'no-local-ledger.json'); // no live working ledger

const fm = require('../src/core/field-memory');

function mkState(updateCount, coherence = 0.8) {
  return {
    coherence, coherenceIntegral: 100, globalEntropy: 1.0, cascadeFactor: 2.0,
    updateCount, timestamp: Date.now(),
    sources: { covenant: { count: updateCount, lastCoherence: coherence, lastTimestamp: Date.now() } },
  };
}

test('_restoreFromSeed reads the committed bootstrap snapshot', () => {
  fs.writeFileSync(seedPath, JSON.stringify(mkState(4242, 0.873)));
  const s = fm._restoreFromSeed();
  assert.ok(s, 'expected a restored state');
  assert.equal(s.updateCount, 4242);
  assert.ok(Math.abs(s.coherence - 0.873) < 1e-9);
  assert.equal(typeof s.sources, 'object');
});

test('_restoreFromSeed rejects empty / zero-history seeds', () => {
  fs.writeFileSync(seedPath, JSON.stringify(mkState(0)));
  assert.equal(fm._restoreFromSeed(), null);
});

test('_restoreFromLedger reads _entropy from the committed chain', () => {
  const chain = [
    { index: 0, timestamp: 't0', data: { type: 'GENESIS', patternId: null, metadata: {} }, previousHash: '0', hash: 'h0' },
    { index: 1, timestamp: 't1', data: { type: 'CHECKPOINT', patternId: 'field:histogram', metadata: { _entropy: mkState(5150, 0.91) } }, previousHash: 'h0', hash: 'h1' },
  ];
  fs.writeFileSync(ledgerPath, JSON.stringify(chain));
  const s = fm._restoreFromLedger();
  assert.ok(s);
  assert.equal(s.updateCount, 5150);
  assert.ok(Math.abs(s.coherence - 0.91) < 1e-9);
});

test('restoreLatest includes the committed seed as a witness (max history wins)', () => {
  // An astronomically high updateCount guarantees the seed dominates any
  // oracle.db field-snapshot witness present in this repo, proving the
  // seed is actually consulted by restoreLatest().
  fs.writeFileSync(seedPath, JSON.stringify(mkState(9_999_999, 0.95)));
  fs.rmSync(ledgerPath, { force: true });
  const s = fm.restoreLatest();
  assert.ok(s);
  assert.equal(s.updateCount, 9_999_999);
});

test('committed ledger and seed reconcile to the richer witness', () => {
  // Seed behind, committed ledger ahead → restore must prefer the ledger.
  fs.writeFileSync(seedPath, JSON.stringify(mkState(100, 0.7)));
  const chain = [
    { index: 0, timestamp: 't0', data: { type: 'GENESIS', patternId: null, metadata: {} }, previousHash: '0', hash: 'h0' },
    { index: 1, timestamp: 't1', data: { type: 'CHECKPOINT', patternId: 'field:histogram', metadata: { _entropy: mkState(8_888_888, 0.9) } }, previousHash: 'h0', hash: 'h1' },
  ];
  fs.writeFileSync(ledgerPath, JSON.stringify(chain));
  const s = fm.restoreLatest();
  assert.ok(s);
  assert.equal(s.updateCount, 8_888_888);
});
