const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('titleCase', () => {
  it('capitalizes each word', () => {
    assert.strictEqual(titleCase('hello world'), 'Hello World');
  });

  it('handles a single word', () => {
    assert.strictEqual(titleCase('hello'), 'Hello');
  });

  it('handles mixed case input', () => {
    assert.strictEqual(titleCase('javaScript is fun'), 'JavaScript Is Fun');
  });

  it('handles empty string', () => {
    assert.strictEqual(titleCase(''), '');
  });

  it('returns empty string for non-string input', () => {
    assert.strictEqual(titleCase(42), '');
  });
});
