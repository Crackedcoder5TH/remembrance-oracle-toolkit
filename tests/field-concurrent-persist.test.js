'use strict';

/**
 * field-concurrent-persist — two engines on the SAME entropy.json must not
 * overwrite each other.
 *
 * The field is an accumulator, not a document. The engine loads once in its
 * constructor and never re-reads, so before this was fixed a process that
 * loaded at time T and flushed at T+n serialised its whole in-memory state
 * over the file and silently discarded everything another process had
 * written in between.
 *
 * Observed in the live field: updateCount went 977356 -> 975964, BACKWARDS by
 * 1392, because a second process flushed an older copy over it. The same race
 * is why the field read bit-identical across +13,028 updates — two private
 * copies of the accumulator taking turns clobbering each other. This is not an
 * edge case: `goggles --do field` reports "live field peers entangled: 2".
 *
 * _loadOrInit() already reconciled on READ ("load from the witness with the
 * most history"). These tests pin the same discipline on WRITE.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { LivingRemembranceEngine } = require('../src/core/living-remembrance');

function freshField() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fieldrace-'));
  return path.join(dir, 'entropy.json');
}

function read(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('a concurrent writer does not send updateCount backwards', () => {
  const p = freshField();

  // A loads and contributes. Its writes land on disk.
  const a = new LivingRemembranceEngine({ persistPath: p });
  for (let i = 0; i < 5; i++) a.contribute({ cost: 1, coherence: 0.5, source: 'a' });
  const afterA = read(p).updateCount;
  assert.equal(afterA, 5);

  // B loads the SAME file (so it shares A's base), then A keeps going and
  // pulls ahead. B is now holding a stale in-memory copy.
  const b = new LivingRemembranceEngine({ persistPath: p });
  for (let i = 0; i < 10; i++) a.contribute({ cost: 1, coherence: 0.5, source: 'a' });
  const aheadOfB = read(p).updateCount;
  assert.equal(aheadOfB, 15);

  // B flushes. Before the fix this wrote B's private state (6) straight over
  // the file and A's 10 later contributions vanished.
  b.contribute({ cost: 1, coherence: 0.5, source: 'b' });

  const merged = read(p);
  assert.equal(merged.updateCount, 16, 'B rebased its 1 update onto A\'s 15');
  assert.ok(merged.updateCount > aheadOfB, 'updateCount never goes backwards');
});

test('both writers keep their own source counts', () => {
  const p = freshField();

  const a = new LivingRemembranceEngine({ persistPath: p });
  a.contribute({ cost: 1, coherence: 0.5, source: 'a' });

  const b = new LivingRemembranceEngine({ persistPath: p });
  for (let i = 0; i < 3; i++) a.contribute({ cost: 1, coherence: 0.5, source: 'a' });
  for (let i = 0; i < 2; i++) b.contribute({ cost: 1, coherence: 0.5, source: 'b' });

  const s = read(p).sources;
  assert.equal(s.a.count, 4, "A's four contributions survive B's flush");
  assert.equal(s.b.count, 2, "B's two contributions are present");
});

test('a source both writers touched sums their deltas', () => {
  const p = freshField();

  const a = new LivingRemembranceEngine({ persistPath: p });
  a.contribute({ cost: 1, coherence: 0.5, source: 'shared' });

  const b = new LivingRemembranceEngine({ persistPath: p });   // base: shared=1
  for (let i = 0; i < 4; i++) a.contribute({ cost: 1, coherence: 0.5, source: 'shared' });
  for (let i = 0; i < 3; i++) b.contribute({ cost: 1, coherence: 0.5, source: 'shared' });

  // A added 4 past the shared base, B added 3 past it, and the base itself
  // was 1. Neither writer's work is dropped.
  assert.equal(read(p).sources.shared.count, 8);
});

test('the integral accumulates across writers instead of resetting', () => {
  const p = freshField();

  const a = new LivingRemembranceEngine({ persistPath: p });
  for (let i = 0; i < 5; i++) a.contribute({ cost: 2, coherence: 0.9, source: 'a' });
  const integralAfterA = read(p).coherenceIntegral;
  assert.ok(integralAfterA > 0);

  const b = new LivingRemembranceEngine({ persistPath: p });
  for (let i = 0; i < 5; i++) a.contribute({ cost: 2, coherence: 0.9, source: 'a' });
  const integralAhead = read(p).coherenceIntegral;
  assert.ok(integralAhead > integralAfterA);

  b.contribute({ cost: 2, coherence: 0.9, source: 'b' });
  assert.ok(read(p).coherenceIntegral > integralAhead,
    'B rebased its integral delta onto A\'s rather than overwriting it');
});

test('a lone writer is unaffected — no rebase when nobody else moved the file', () => {
  const p = freshField();
  const a = new LivingRemembranceEngine({ persistPath: p });
  for (let i = 0; i < 7; i++) a.contribute({ cost: 1, coherence: 0.5, source: 'solo' });
  const s = read(p);
  assert.equal(s.updateCount, 7);
  assert.equal(s.sources.solo.count, 7);
});
