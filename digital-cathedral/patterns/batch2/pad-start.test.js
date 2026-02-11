const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('padStart', () => {
  it('pads with spaces by default', () => {
    assert.strictEqual(padStart('hi', 5), '   hi');
  });

  it('pads with a custom character', () => {
    assert.strictEqual(padStart('42', 5, '0'), '00042');
  });

  it('does not truncate when string is already long enough', () => {
    assert.strictEqual(padStart('hello', 3), 'hello');
  });

  it('handles empty string', () => {
    assert.strictEqual(padStart('', 4, 'x'), 'xxxx');
  });

  it('returns empty string for non-string input', () => {
    assert.strictEqual(padStart(null, 5), '');
  });
});
