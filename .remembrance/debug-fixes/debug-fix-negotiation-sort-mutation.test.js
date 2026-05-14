const { describe, it } = require('node:test');
const assert = require('node:assert');

// Inline the fix for testing
function resolveConflict(candidates, strategy = 'highest-coherency') {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return { ...candidates[0], reason: 'only-candidate' };
  const sorted = [...candidates];
  switch (strategy) {
    case 'most-tested':
      sorted.sort((a, b) => (b.pattern.hasTests ? 1 : 0) - (a.pattern.hasTests ? 1 : 0)
        || (b.pattern.coherency || 0) - (a.pattern.coherency || 0));
      break;
    default:
      sorted.sort((a, b) => (b.pattern.coherency || 0) - (a.pattern.coherency || 0));
  }
  return { remote: sorted[0].remote, pattern: sorted[0].pattern, reason: strategy };
}

describe('resolveConflict does not mutate input', () => {
  it('preserves original array order after sorting', () => {
    const candidates = [
      { remote: 'A', pattern: { coherency: 0.5 } },
      { remote: 'B', pattern: { coherency: 0.9 } },
      { remote: 'C', pattern: { coherency: 0.7 } },
    ];
    const originalOrder = candidates.map(c => c.remote);
    const result = resolveConflict(candidates);
    assert.strictEqual(result.remote, 'B'); // highest coherency wins
    assert.deepStrictEqual(candidates.map(c => c.remote), originalOrder); // NOT mutated
  });

  it('returns null for empty array', () => {
    assert.strictEqual(resolveConflict([]), null);
  });

  it('handles single candidate', () => {
    const result = resolveConflict([{ remote: 'X', pattern: { coherency: 0.8 } }]);
    assert.strictEqual(result.reason, 'only-candidate');
  });
});
