const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('omit', () => {
  it('omits specified keys from an object', () => {
    assert.deepEqual(omit({ a: 1, b: 2, c: 3 }, ['b']), { a: 1, c: 3 });
  });

  it('ignores keys not present in the object', () => {
    assert.deepEqual(omit({ a: 1, b: 2 }, ['z']), { a: 1, b: 2 });
  });

  it('returns empty object when all keys are omitted', () => {
    assert.deepEqual(omit({ a: 1, b: 2 }, ['a', 'b']), {});
  });

  it('returns full copy when no keys are omitted', () => {
    assert.deepEqual(omit({ a: 1, b: 2 }, []), { a: 1, b: 2 });
  });

  it('does not mutate the original object', () => {
    const obj = { a: 1, b: 2, c: 3 };
    omit(obj, ['a', 'b']);
    assert.deepEqual(obj, { a: 1, b: 2, c: 3 });
  });
});
