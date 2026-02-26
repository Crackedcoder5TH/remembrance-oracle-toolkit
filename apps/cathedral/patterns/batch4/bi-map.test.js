const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createBiMap', () => {
  it('should set and retrieve by key and value', () => {
    const bm = createBiMap();
    bm.set('a', 1);
    bm.set('b', 2);
    assert.strictEqual(bm.getByKey('a'), 1);
    assert.strictEqual(bm.getByValue(2), 'b');
  });

  it('should maintain bijection on key conflict', () => {
    const bm = createBiMap();
    bm.set('a', 1);
    bm.set('a', 2); // overwrite key 'a'
    assert.strictEqual(bm.getByKey('a'), 2);
    assert.strictEqual(bm.getByValue(1), undefined);
    assert.strictEqual(bm.getByValue(2), 'a');
  });

  it('should maintain bijection on value conflict', () => {
    const bm = createBiMap();
    bm.set('a', 1);
    bm.set('b', 1); // value 1 now maps to 'b', removing 'a'
    assert.strictEqual(bm.getByKey('a'), undefined);
    assert.strictEqual(bm.getByKey('b'), 1);
    assert.strictEqual(bm.getByValue(1), 'b');
  });

  it('should delete by key', () => {
    const bm = createBiMap();
    bm.set('x', 10);
    assert.strictEqual(bm.deleteByKey('x'), true);
    assert.strictEqual(bm.getByKey('x'), undefined);
    assert.strictEqual(bm.getByValue(10), undefined);
    assert.strictEqual(bm.deleteByKey('x'), false);
  });

  it('should track size correctly', () => {
    const bm = createBiMap();
    assert.strictEqual(bm.size(), 0);
    bm.set('a', 1);
    bm.set('b', 2);
    assert.strictEqual(bm.size(), 2);
    bm.deleteByKey('a');
    assert.strictEqual(bm.size(), 1);
  });
});
