const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createSortedArray', () => {
  it('should insert elements in sorted order', () => {
    const sa = createSortedArray();
    sa.insert(3);
    sa.insert(1);
    sa.insert(4);
    sa.insert(1);
    sa.insert(5);
    assert.deepStrictEqual(sa.toArray(), [1, 1, 3, 4, 5]);
  });

  it('should find index of elements', () => {
    const sa = createSortedArray();
    sa.insert(10);
    sa.insert(20);
    sa.insert(30);
    assert.strictEqual(sa.indexOf(20), 1);
    assert.strictEqual(sa.indexOf(99), -1);
  });

  it('should remove elements', () => {
    const sa = createSortedArray();
    sa.insert(1);
    sa.insert(2);
    sa.insert(3);
    assert.strictEqual(sa.remove(2), true);
    assert.deepStrictEqual(sa.toArray(), [1, 3]);
    assert.strictEqual(sa.remove(99), false);
  });

  it('should track size', () => {
    const sa = createSortedArray();
    assert.strictEqual(sa.size(), 0);
    sa.insert(5);
    sa.insert(3);
    assert.strictEqual(sa.size(), 2);
  });

  it('should accept custom comparator', () => {
    const sa = createSortedArray((a, b) => b - a); // descending
    sa.insert(1);
    sa.insert(3);
    sa.insert(2);
    assert.deepStrictEqual(sa.toArray(), [3, 2, 1]);
  });
});
