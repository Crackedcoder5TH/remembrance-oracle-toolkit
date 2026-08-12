// Regression contract for the auto-wire pipeline.
//
// This is part of the test suite because the field-coupling invariants
// must hold for the ecosystem to measure itself truthfully. Any future
// re-run of the auto-wire generator, hand edit, or refactor that
// breaks any of the four rules will fail here:
//   C1: source label matches enclosing function
//   C2: require path resolves to canonical field-coupling
//   C3: contribute reachable from main return path
//   C4: coherence expression yields a finite number
//
// See scripts/check-field-couplings.js for details.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { check } = require('../scripts/check-field-couplings');

describe('field-coupling contract — auto-wire invariants', () => {
  it('0 violations across all rules', () => {
    const violations = check();
    if (violations.length > 0) {
      const summary = violations
        .map(v => `  [${v.rule}] ${v.file} — ${v.source}\n      ${v.detail}`)
        .join('\n');
      assert.fail(`field-coupling contract failed (${violations.length} violation(s)):\n${summary}`);
    }
    assert.equal(violations.length, 0);
  });
});

describe('pruneSources — the lawful histogram-cleaning operation', () => {
  const { isolateField } = require('./helpers');

  it('removes exact keys, records them in sourcesPruned, touches no scalar term', () => {
    const { engine, restore } = isolateField();
    try {
      engine.contribute({ cost: 1, coherence: 0.8, source: 'keep-me' });
      engine.contribute({ cost: 1, coherence: 0.9, source: 'test:junk' });
      const before = engine.getState();
      const r = engine.pruneSources(['test:junk', 'never-existed'], 'contract test');
      assert.equal(r.pruned.length, 1);
      assert.deepEqual(r.missing, ['never-existed']);
      const after = engine.getState();
      assert.equal(after.sources['test:junk'], undefined, 'pruned key gone');
      assert.ok(after.sources['keep-me'], 'unrelated key untouched');
      assert.equal(after.coherenceIntegral, before.coherenceIntegral, 'integral is history');
      assert.equal(after.updateCount, before.updateCount, 'updateCount is history');
      assert.equal(after.sourcesPruned.length, 1, 'the pruning is itself remembered');
      assert.equal(after.sourcesPruned[0].key, 'test:junk');
      assert.equal(after.sourcesPruned[0].reason, 'contract test');
    } finally { restore(); }
  });

  it('refuses wildcard-shaped or reasonless prunings', () => {
    const { engine, restore } = isolateField();
    try {
      assert.throws(() => engine.pruneSources([], 'x'), /non-empty array/);
      assert.throws(() => engine.pruneSources(['a'], ''), /reason/);
      assert.throws(() => engine.pruneSources('test:*', 'x'), /array/);
    } finally { restore(); }
  });
});
