const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('groupBy', () => {
  it('groups numbers by even/odd', () => {
    const result = groupBy([1, 2, 3, 4, 5], (n) => (n % 2 === 0 ? 'even' : 'odd'));
    assert.deepEqual(result, { odd: [1, 3, 5], even: [2, 4] });
  });

  it('groups strings by length', () => {
    const result = groupBy(['one', 'two', 'three', 'four'], (s) => s.length);
    assert.deepEqual(result, { 3: ['one', 'two'], 5: ['three'], 4: ['four'] });
  });

  it('returns empty object for empty array', () => {
    assert.deepEqual(groupBy([], (x) => x), {});
  });

  it('groups objects by a property', () => {
    const items = [
      { type: 'fruit', name: 'apple' },
      { type: 'veggie', name: 'carrot' },
      { type: 'fruit', name: 'banana' },
    ];
    const result = groupBy(items, (item) => item.type);
    assert.equal(result.fruit.length, 2);
    assert.equal(result.veggie.length, 1);
  });
});
