const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    assert.strictEqual(escapeHtml('a & b'), 'a &amp; b');
  });

  it('escapes angle brackets', () => {
    assert.strictEqual(escapeHtml('<div>'), '&lt;div&gt;');
  });

  it('escapes quotes', () => {
    assert.strictEqual(escapeHtml('"hello" & \'world\''), '&quot;hello&quot; &amp; &#39;world&#39;');
  });

  it('handles empty string', () => {
    assert.strictEqual(escapeHtml(''), '');
  });

  it('returns unchanged string when no special chars', () => {
    assert.strictEqual(escapeHtml('plain text'), 'plain text');
  });
});
