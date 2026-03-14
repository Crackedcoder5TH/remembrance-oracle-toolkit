/**
 * Tests for audit bug-detection patterns.
 * These patterns are registered with the oracle to catch common bugs.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { detectNullPropertyAccess } = require('../src/patterns/audit-patterns/null-property-access-guard');
const { detectPrecedenceIssues } = require('../src/patterns/audit-patterns/operator-precedence-check');
const { detectWrongPropertyAccess } = require('../src/patterns/audit-patterns/wrong-property-access');
const { detectOffByOne } = require('../src/patterns/audit-patterns/off-by-one-detection');
const { detectLogicInconsistency } = require('../src/patterns/audit-patterns/logic-inconsistency-check');

describe('Null Property Access Detection', () => {
  it('detects chained property access without guard', () => {
    const code = `const name = item.name.toLowerCase();`;
    const warnings = detectNullPropertyAccess(code);
    assert.ok(warnings.length > 0, 'Should detect unguarded .name.toLowerCase()');
  });

  it('does not flag guarded access', () => {
    const code = `const name = (item.name || '').toLowerCase();`;
    const warnings = detectNullPropertyAccess(code);
    assert.strictEqual(warnings.length, 0, 'Should not flag guarded access');
  });

  it('returns empty for null input', () => {
    assert.deepStrictEqual(detectNullPropertyAccess(null), []);
    assert.deepStrictEqual(detectNullPropertyAccess(''), []);
  });

  it('detects unguarded iteration over property', () => {
    const code = `for (const tag of entry.tags) { console.log(tag); }`;
    const warnings = detectNullPropertyAccess(code);
    assert.ok(warnings.length > 0, 'Should detect unguarded iteration');
  });

  it('does not flag guarded iteration', () => {
    const code = `for (const tag of (entry.tags || [])) { console.log(tag); }`;
    const warnings = detectNullPropertyAccess(code);
    assert.strictEqual(warnings.length, 0);
  });
});

describe('Operator Precedence Detection', () => {
  it('detects Math.round precedence bug', () => {
    const code = `const x = Math.round(1 - y - z * 100) / 100;`;
    const warnings = detectPrecedenceIssues(code);
    assert.ok(warnings.length > 0, 'Should detect precedence issue in Math.round');
  });

  it('returns empty for null input', () => {
    assert.deepStrictEqual(detectPrecedenceIssues(null), []);
  });
});

describe('Wrong Property Access Detection', () => {
  it('detects .improved on reflection result', () => {
    const code = `if (!reflection.improved) return null;`;
    const warnings = detectWrongPropertyAccess(code);
    assert.ok(warnings.length > 0, 'Should flag .improved on reflection');
  });

  it('returns empty for null input', () => {
    assert.deepStrictEqual(detectWrongPropertyAccess(null), []);
  });
});

describe('Off-by-One Detection', () => {
  it('detects <= length in for loop', () => {
    const code = `for (let i = 0; i <= arr.length; i++) { arr[i]; }`;
    const warnings = detectOffByOne(code);
    assert.ok(warnings.length > 0, 'Should detect <= length bound');
  });

  it('returns empty for correct bounds', () => {
    const code = `for (let i = 0; i < arr.length; i++) { arr[i]; }`;
    const warnings = detectOffByOne(code);
    assert.strictEqual(warnings.length, 0);
  });

  it('returns empty for null input', () => {
    assert.deepStrictEqual(detectOffByOne(null), []);
  });
});

describe('Logic Inconsistency Detection', () => {
  it('detects counter increment in dry-run block', () => {
    const code = [
      "if (status === 'would-promote') {",
      '  report.promoted++;',
      '  continue;',
      '}',
    ].join('\n');
    const warnings = detectLogicInconsistency(code);
    assert.ok(warnings.length > 0, 'Should detect counter in dry-run');
  });

  it('returns empty for null input', () => {
    assert.deepStrictEqual(detectLogicInconsistency(null), []);
  });
});
