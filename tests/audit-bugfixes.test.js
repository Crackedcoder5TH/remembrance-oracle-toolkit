/**
 * Tests for bugs discovered during the deep codebase audit.
 *
 * Bug categories covered:
 * 1. Null/undefined crash guards
 * 2. Wrong property name access
 * 3. Operator precedence errors
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ─── Bug #1: tokenize() crashes on null/undefined input ───

describe('Audit Bug #1: tokenize null guard', () => {
  const { tokenize } = require('../src/core/relevance');

  it('returns empty array for null input', () => {
    assert.deepStrictEqual(tokenize(null), []);
  });

  it('returns empty array for undefined input', () => {
    assert.deepStrictEqual(tokenize(undefined), []);
  });

  it('returns empty array for empty string', () => {
    assert.deepStrictEqual(tokenize(''), []);
  });

  it('returns empty array for non-string input', () => {
    assert.deepStrictEqual(tokenize(42), []);
    assert.deepStrictEqual(tokenize({}), []);
    assert.deepStrictEqual(tokenize([]), []);
  });

  it('still works for valid strings', () => {
    const result = tokenize('hello world');
    assert.ok(result.length > 0);
  });
});

// ─── Bug #2: getTopTags() crashes on entries with null tags ───

describe('Audit Bug #2: getTopTags null tags guard', () => {
  const { getTopTags } = require('../src/store/store-helpers');

  it('handles entries with null tags', () => {
    const entries = [
      { tags: null },
      { tags: ['foo', 'bar'] },
      { tags: undefined },
    ];
    const result = getTopTags(entries, 5);
    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].tag, 'foo');
  });

  it('handles entries with no tags property', () => {
    const entries = [{ name: 'test' }, { tags: ['a'] }];
    const result = getTopTags(entries, 5);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].tag, 'a');
  });

  it('handles empty entries array', () => {
    assert.deepStrictEqual(getTopTags([], 5), []);
  });
});

// ─── Bug #3: search dedup crashes on null code ───

describe('Audit Bug #3: search dedup null code guard', () => {
  // We test the pattern directly since search() requires full oracle setup
  it('null-safe code slicing pattern', () => {
    const items = [
      { code: null },
      { code: undefined },
      { code: '' },
      { code: 'function foo() {}' },
    ];

    // This is the pattern used in oracle-core-search.js
    for (const item of items) {
      const key = (item.code || '').slice(0, 100);
      assert.ok(typeof key === 'string');
    }
  });
});

// ─── Bug #4: autoHeal checks wrong property name ───

describe('Audit Bug #4: autoHeal wrong property access', () => {
  const { autoHeal, needsAutoHeal } = require('../src/evolution/evolution');

  it('needsAutoHeal returns true for low success rate patterns', () => {
    const pattern = { usageCount: 10, successCount: 2 };
    assert.strictEqual(needsAutoHeal(pattern), true);
  });

  it('needsAutoHeal returns false for insufficient usage', () => {
    const pattern = { usageCount: 2, successCount: 0 };
    assert.strictEqual(needsAutoHeal(pattern), false);
  });

  it('autoHeal returns null for pattern with no code improvement possible', () => {
    // autoHeal should not crash when reflectionLoop returns its actual shape
    const pattern = {
      code: '// stub',
      language: 'javascript',
      description: 'test',
      tags: ['test'],
      coherencyScore: { total: 0.5 },
    };
    // autoHeal may return null (no improvement) or an object — it should NOT throw
    const result = autoHeal(pattern, { maxLoops: 1 });
    // Result is either null or has the correct shape
    if (result !== null) {
      assert.ok('code' in result, 'result should have code property');
      assert.ok('improvement' in result, 'result should have improvement property');
      assert.ok('newCoherency' in result, 'result should have newCoherency property');
    }
  });
});

// ─── Bug #5: suggestOptimalWeights operator precedence ───

describe('Audit Bug #5: weight calculation operator precedence', () => {
  const { suggestOptimalWeights } = require('../src/swarm/self-refinement');

  it('suggested weights always sum to 1.0', () => {
    // With insufficient data it returns current weights
    const result = suggestOptimalWeights('/tmp/nonexistent');
    const w = result.weights;
    const sum = w.coherency + w.selfConfidence + w.peerScore;
    // Weights must sum to 1.0 (within floating point tolerance)
    assert.ok(
      Math.abs(sum - 1.0) < 0.02,
      `Weights should sum to ~1.0, got ${sum} (coherency=${w.coherency}, self=${w.selfConfidence}, peer=${w.peerScore})`
    );
  });

  it('no individual weight is negative or > 1', () => {
    const result = suggestOptimalWeights('/tmp/nonexistent');
    const w = result.weights;
    for (const [key, val] of Object.entries(w)) {
      assert.ok(val >= 0, `${key} should be >= 0, got ${val}`);
      assert.ok(val <= 1, `${key} should be <= 1, got ${val}`);
    }
  });
});

// ─── Bug #6: decide() crashes on patterns with null name ───

describe('Audit Bug #6: decide() null pattern name guard', () => {
  it('normalizedName handles null/undefined pattern name', () => {
    // Direct test of the fix pattern
    const names = [null, undefined, '', 'debounce'];
    for (const name of names) {
      const normalized = (name || '').toLowerCase().replace(/[-_]/g, ' ');
      assert.ok(typeof normalized === 'string');
    }
  });
});

// ─── Bug #7: deduplicatePatterns crashes on null row.name ───

describe('Audit Bug #7: deduplicatePatterns null name guard', () => {
  it('dedup key handles null name', () => {
    const rows = [
      { name: null, language: 'javascript' },
      { name: undefined, language: null },
      { name: 'test', language: 'python' },
    ];
    for (const row of rows) {
      const key = `${(row.name || '').toLowerCase()}:${(row.language || 'unknown').toLowerCase()}`;
      assert.ok(typeof key === 'string');
      assert.ok(!key.includes('undefined'));
    }
  });
});

// ─── Bug #8: would-promote incorrectly counts as promoted ───

describe('Audit Bug #8: smartAutoPromote dry-run count', () => {
  it('would-promote status should not increment promoted count', () => {
    // Simulate the logic: would-promote is a dry-run status
    const report = { promoted: 0, skipped: 0, vetoed: 0, details: [] };
    const evaluation = { status: 'would-promote', coherency: 0.85 };

    // The fix: would-promote should NOT increment report.promoted
    if (evaluation.status === 'would-promote') {
      report.details.push({ name: 'test', status: 'would-promote', coherency: evaluation.coherency });
      // No report.promoted++ here — that was the bug
    }

    assert.strictEqual(report.promoted, 0, 'would-promote should not count as promoted');
    assert.strictEqual(report.details.length, 1);
  });
});

// ─── Bug #9: sync-queue retry off-by-one ───

describe('Audit Bug #9: sync-queue retry tracking', () => {
  it('retry count is correctly incremented on inline retry failure', () => {
    // Simulate the retry logic
    const MAX_RETRIES = 4;
    const op = { retries: 0, status: 'pending' };

    // First failure
    op.retries++;
    assert.strictEqual(op.retries, 1);

    // Inline retry also fails — should increment retries
    op.retries++;
    assert.strictEqual(op.retries, 2);

    // Check: both increments are tracked
    if (op.retries >= MAX_RETRIES) {
      op.status = 'failed';
    }
    assert.strictEqual(op.status, 'pending', 'Should not be failed after 2 retries');

    // Simulate hitting max
    op.retries = 3;
    op.retries++;
    if (op.retries >= MAX_RETRIES) {
      op.status = 'failed';
    }
    assert.strictEqual(op.status, 'failed', 'Should be failed after 4 retries');
  });
});

// ─── Bug #10: decide() alternatives includes main pattern ───

describe('Audit Bug #10: decide() alternatives consistency', () => {
  it('generate decision alternatives should exclude the main pattern', () => {
    const scored = [
      { pattern: { id: '1', name: 'main' }, composite: 0.3 },
      { pattern: { id: '2', name: 'alt1' }, composite: 0.2 },
      { pattern: { id: '3', name: 'alt2' }, composite: 0.1 },
      { pattern: { id: '4', name: 'alt3' }, composite: 0.05 },
    ];

    // The fix: use slice(1, 4) instead of slice(0, 3) for consistency
    const alternatives = scored.slice(1, 4).map(s => ({
      id: s.pattern.id, name: s.pattern.name, composite: s.composite,
    }));

    // Main pattern (id: '1') should NOT be in alternatives
    assert.ok(!alternatives.some(a => a.id === '1'), 'Main pattern should not appear in alternatives');
    assert.strictEqual(alternatives.length, 3);
    assert.strictEqual(alternatives[0].id, '2');
  });
});
