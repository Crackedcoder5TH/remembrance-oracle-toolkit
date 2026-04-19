const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('deepClone', () => {
  it('clones a flat object', () => {
    const obj = { a: 1, b: 'hello' };
    const clone = deepClone(obj);
    assert.deepEqual(clone, obj);
    assert.notEqual(clone, obj);
  });

  it('clones nested objects deeply', () => {
    const obj = { a: { b: { c: 42 } } };
    const clone = deepClone(obj);
    assert.deepEqual(clone, obj);
    clone.a.b.c = 99;
    assert.equal(obj.a.b.c, 42);
  });

  it('clones arrays deeply', () => {
    const arr = [1, [2, [3]]];
    const clone = deepClone(arr);
    assert.deepEqual(clone, arr);
    clone[1][1][0] = 99;
    assert.equal(arr[1][1][0], 3);
  });

  it('handles null and primitives', () => {
    assert.equal(deepClone(null), null);
    assert.equal(deepClone(42), 42);
    assert.equal(deepClone('hello'), 'hello');
  });

  it('clones objects with mixed arrays and nested objects', () => {
    const obj = { items: [{ id: 1 }, { id: 2 }], meta: { count: 2 } };
    const clone = deepClone(obj);
    assert.deepEqual(clone, obj);
    clone.items[0].id = 99;
    assert.equal(obj.items[0].id, 1);
  });
});
