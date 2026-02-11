const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('localstorage-persistence', () => {
  it('loadArray returns empty in non-browser env', () => {
    const result = loadArray('test-key', 10);
    assert.deepStrictEqual(result, []);
  });

  it('prependToArray caps at maxLength', () => {
    const next = prependToArray('test', 0, [1, 2, 3, 4, 5], 5);
    assert.strictEqual(next.length, 5);
    assert.strictEqual(next[0], 0);
  });

  it('prependToArray places new entry first', () => {
    const result = prependToArray('test', 'new', ['old1', 'old2'], 10);
    assert.strictEqual(result[0], 'new');
    assert.strictEqual(result[1], 'old1');
  });

  it('clearArray returns boolean', () => {
    const result = clearArray('nonexistent');
    assert.strictEqual(typeof result, 'boolean');
  });
});
