'use strict';
// THE TWO-GENERATION LOCK: the Witness and the lock may differ by exactly
// one ledgered, witnessed generation — the lock's own append-only history
// names which. Anything further apart is a relock that was never witnessed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { anchorVerdict } = require('../scripts/gate-lock');

const lockAt = (digest, from) => ({ digest, history: [{ from, to: digest, reason: 't' }] });

test('anchor matching the lock is no migration and no mismatch', () => {
  const v = anchorVerdict(lockAt('B', 'A'), { digest: 'B', block: 1 });
  assert.deepEqual([v.migrationOpen, v.anchorMismatch], [false, false]);
});

test('the Witness one ledgered generation behind the lock is a migration, not a mismatch', () => {
  const v = anchorVerdict(lockAt('B', 'A'), { digest: 'A', block: 1 });
  assert.equal(v.chainLagsOne, true);
  assert.equal(v.migrationOpen, true);
  assert.equal(v.anchorMismatch, false);
});

test('the lock one witnessed generation behind the chain is a migration, not a mismatch', () => {
  const v = anchorVerdict(lockAt('B', 'A'), { digest: 'C', block: 2, prev: { digest: 'B', block: 1 } });
  assert.equal(v.lockLagsOne, true);
  assert.equal(v.migrationOpen, true);
  assert.equal(v.anchorMismatch, false);
});

test('two generations apart still blocks — a relock that was never witnessed', () => {
  // chain holds X; the lock moved A -> B and X is neither B nor the ledgered previous A
  const v = anchorVerdict(lockAt('B', 'A'), { digest: 'X', block: 1 });
  assert.equal(v.migrationOpen, false);
  assert.equal(v.anchorMismatch, true);
  // and a history whose tail does not reach the current digest earns no tolerance
  const forged = anchorVerdict({ digest: 'B', history: [{ from: 'A', to: 'Z', reason: 't' }] }, { digest: 'A', block: 1 });
  assert.equal(forged.migrationOpen, false);
  assert.equal(forged.anchorMismatch, true);
});

test('no anchor on this host changes nothing', () => {
  const v = anchorVerdict(lockAt('B', 'A'), null);
  assert.deepEqual([v.migrationOpen, v.anchorMismatch], [false, false]);
});
