const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('wordCount', () => {
  it('counts words in a simple sentence', () => {
    assert.strictEqual(wordCount('hello world'), 2);
  });

  it('handles multiple spaces between words', () => {
    assert.strictEqual(wordCount('one   two   three'), 3);
  });

  it('returns 0 for empty string', () => {
    assert.strictEqual(wordCount(''), 0);
  });

  it('returns 0 for whitespace-only string', () => {
    assert.strictEqual(wordCount('   '), 0);
  });

  it('counts a single word', () => {
    assert.strictEqual(wordCount('hello'), 1);
  });
});
