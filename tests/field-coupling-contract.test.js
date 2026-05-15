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
