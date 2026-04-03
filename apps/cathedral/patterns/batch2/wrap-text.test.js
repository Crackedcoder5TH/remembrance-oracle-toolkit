const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('wrapText', () => {
  it('wraps text at specified width', () => {
    assert.strictEqual(wrapText('the quick brown fox jumps over', 15), 'the quick brown\nfox jumps over');
  });

  it('does not wrap when text fits within width', () => {
    assert.strictEqual(wrapText('short text', 50), 'short text');
  });

  it('handles a single long word', () => {
    assert.strictEqual(wrapText('superlongword', 5), 'superlongword');
  });

  it('handles empty string', () => {
    assert.strictEqual(wrapText('', 10), '');
  });

  it('wraps each word on its own line if width is very small', () => {
    assert.strictEqual(wrapText('a b c', 1), 'a\nb\nc');
  });
});
