const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('pick', () => {
  it('picks specified keys from an object', () => {
    assert.deepEqual(pick({ a: 1, b: 2, c: 3 }, ['a', 'c']), { a: 1, c: 3 });
  });

  it('ignores keys not present in the object', () => {
    assert.deepEqual(pick({ a: 1, b: 2 }, ['a', 'z']), { a: 1 });
  });

  it('returns empty object when no keys match', () => {
    assert.deepEqual(pick({ a: 1 }, ['x', 'y']), {});
  });

  it('returns empty object for empty keys array', () => {
    assert.deepEqual(pick({ a: 1, b: 2 }, []), {});
  });

  it('does not mutate the original object', () => {
    const obj = { a: 1, b: 2, c: 3 };
    pick(obj, ['a']);
    assert.deepEqual(obj, { a: 1, b: 2, c: 3 });
  });
});
