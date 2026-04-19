const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('padEnd', () => {
  it('pads with spaces by default', () => {
    assert.strictEqual(padEnd('hi', 5), 'hi   ');
  });

  it('pads with a custom character', () => {
    assert.strictEqual(padEnd('42', 5, '0'), '42000');
  });

  it('does not truncate when string is already long enough', () => {
    assert.strictEqual(padEnd('hello', 3), 'hello');
  });

  it('handles empty string', () => {
    assert.strictEqual(padEnd('', 4, 'x'), 'xxxx');
  });

  it('returns empty string for non-string input', () => {
    assert.strictEqual(padEnd(undefined, 5), '');
  });
});
