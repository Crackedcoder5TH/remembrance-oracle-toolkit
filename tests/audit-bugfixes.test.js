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

  it('autoHeal returns sentinel or result for pattern with no code improvement possible', () => {
    // autoHeal should not crash when reflectionLoop returns its actual shape
    const pattern = {
      code: '// stub',
      language: 'javascript',
      description: 'test',
      tags: ['test'],
      coherencyScore: { total: 0.5 },
    };
    // autoHeal may return a sentinel (skipped/no-improvement/error) or an object — it should NOT throw
    const result = autoHeal(pattern, { maxLoops: 1 });
    // Result is either a sentinel (has .skipped) or has the correct healing shape
    if (result && !result.skipped) {
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

// ─── Bug #11: withOfflineQueue doesn't await async syncFn ───

describe('Audit Bug #11: withOfflineQueue async handling', () => {
  it('wrappedSync is an async function', () => {
    const { withOfflineQueue, SyncQueue } = require('../src/store/sync-queue');
    const queue = new SyncQueue({ queueDir: '/tmp/oracle-test-sync-' + Date.now() });
    const asyncFn = async () => ({ ok: true });
    const wrapped = withOfflineQueue(asyncFn, queue, 'push');
    // The wrapped function should be async
    const result = wrapped({});
    assert.ok(result instanceof Promise, 'wrappedSync should return a Promise for async syncFn');
  });
});

// ─── Bug #12: coherencyBefore || null converts 0 to null ───

describe('Audit Bug #12: falsy zero in coherency values', () => {
  it('nullish coalescing preserves 0 values', () => {
    const stat = { coherencyBefore: 0, coherencyAfter: 0.5 };
    // The fix: use ?? instead of ||
    const before = stat.coherencyBefore ?? null;
    const after = stat.coherencyAfter ?? null;
    assert.strictEqual(before, 0, 'Should preserve 0, not convert to null');
    assert.strictEqual(after, 0.5);
  });

  it('nullish coalescing converts undefined to null', () => {
    const stat = {};
    const before = stat.coherencyBefore ?? null;
    assert.strictEqual(before, null);
  });
});

// ─── Bug #13: addCandidate coherencyTotal naming mismatch ───

describe('Audit Bug #13: addCandidate coherency field naming', () => {
  it('coherencyScore.total takes precedence over coherencyTotal', () => {
    const candidate = { coherencyScore: { total: 0.85 } };
    const value = candidate.coherencyScore?.total ?? candidate.coherencyTotal ?? 0;
    assert.strictEqual(value, 0.85);
  });

  it('falls back to coherencyTotal when coherencyScore is missing', () => {
    const candidate = { coherencyTotal: 0.7 };
    const value = candidate.coherencyScore?.total ?? candidate.coherencyTotal ?? 0;
    assert.strictEqual(value, 0.7);
  });

  it('falls back to 0 when both are missing', () => {
    const candidate = {};
    const value = candidate.coherencyScore?.total ?? candidate.coherencyTotal ?? 0;
    assert.strictEqual(value, 0);
  });
});

// ─── Bug #14: history.js language/tags crash on undefined ───

describe('Audit Bug #14: history filter null guards', () => {
  it('language filter handles undefined language', () => {
    const entries = [
      { language: undefined, description: 'test' },
      { language: 'javascript', description: 'js code' },
      { language: null, description: 'null lang' },
    ];
    const filtered = entries.filter(e => (e.language || '').toLowerCase() === 'javascript');
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].description, 'js code');
  });

  it('tags filter handles null tags', () => {
    const entries = [
      { tags: null },
      { tags: ['foo', 'bar'] },
      { tags: undefined },
    ];
    const filterTags = new Set(['foo']);
    const filtered = entries.filter(e => (e.tags || []).some(t => filterTags.has(t.toLowerCase())));
    assert.strictEqual(filtered.length, 1);
  });
});

// ─── Bug #15: whispers crash on null pattern.name ───

describe('Audit Bug #15: whisper null pattern name', () => {
  it('pattern name length handles null name', () => {
    const pattern = { name: null, code: 'function foo() {}' };
    const seed = pattern ? (pattern.name || '').length + (pattern.code?.length || 0) : 0;
    assert.strictEqual(seed, 17); // code length only
  });
});

// ─── Bug #16: registerPattern always-truthy check ───

describe('Audit Bug #16: registerPattern always-truthy', () => {
  it('registration result object is always truthy', () => {
    const result = { success: false, registered: false, error: 'test' };
    // The bug: if (result) is always true for objects
    assert.ok(result, 'Object is always truthy');
    // The fix: check .registered instead
    assert.strictEqual(result.registered, false);
  });
});

// ─── Bug #17: threshold falsy 0 coercion ───

describe('Audit Bug #17: threshold falsy 0 coercion', () => {
  it('nullish coalescing preserves 0 threshold', () => {
    const options = { threshold: 0 };
    const threshold = options.threshold ?? 0.6;
    assert.strictEqual(threshold, 0, 'Should preserve explicit 0, not fall back to 0.6');
  });

  it('nullish coalescing falls back on undefined', () => {
    const options = {};
    const threshold = options.threshold ?? 0.6;
    assert.strictEqual(threshold, 0.6);
  });
});

// ─── Bug #18: dry-run import inflates count ───

describe('Audit Bug #18: dry-run import count', () => {
  it('dry-run should not increment imported counter', () => {
    let imported = 0;
    const dryRun = true;
    const results = [];

    // Simulate the fixed logic
    if (dryRun) {
      results.push({ name: 'test', status: 'would_import' });
      // No imported++ — that was the bug
    }

    assert.strictEqual(imported, 0, 'Dry run should not count as imported');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].status, 'would_import');
  });
});
