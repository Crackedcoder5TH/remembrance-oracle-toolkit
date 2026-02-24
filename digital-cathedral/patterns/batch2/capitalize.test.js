const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('capitalize', () => {
  it('capitalizes a lowercase string', () => {
    assert.strictEqual(capitalize('hello'), 'Hello');
  });

  it('leaves an already capitalized string unchanged', () => {
    assert.strictEqual(capitalize('Hello'), 'Hello');
  });

  it('handles single character', () => {
    assert.strictEqual(capitalize('a'), 'A');
  });

  it('handles empty string', () => {
    assert.strictEqual(capitalize(''), '');
  });

  it('preserves the rest of the string', () => {
    assert.strictEqual(capitalize('hELLO wORLD'), 'HELLO wORLD');
  });
});
