const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createCounter', () => {
  it('should count occurrences', () => {
    const counter = createCounter(['a', 'b', 'a', 'c', 'a', 'b']);
    assert.strictEqual(counter.get('a'), 3);
    assert.strictEqual(counter.get('b'), 2);
    assert.strictEqual(counter.get('c'), 1);
  });

  it('should return 0 for missing items', () => {
    const counter = createCounter([1, 2, 3]);
    assert.strictEqual(counter.get(99), 0);
  });

  it('should return most common elements', () => {
    const counter = createCounter(['x', 'y', 'x', 'z', 'x', 'y']);
    const top2 = counter.mostCommon(2);
    assert.strictEqual(top2[0][0], 'x');
    assert.strictEqual(top2[0][1], 3);
    assert.strictEqual(top2[1][0], 'y');
    assert.strictEqual(top2[1][1], 2);
    assert.strictEqual(top2.length, 2);
  });

  it('should provide entries', () => {
    const counter = createCounter([1, 1, 2]);
    const ents = counter.entries();
    assert.strictEqual(ents.length, 2);
  });

  it('should handle empty array', () => {
    const counter = createCounter([]);
    assert.strictEqual(counter.get('anything'), 0);
    assert.deepStrictEqual(counter.mostCommon(5), []);
  });
});
