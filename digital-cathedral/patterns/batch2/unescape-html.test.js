const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('unescapeHtml', () => {
  it('unescapes ampersands', () => {
    assert.strictEqual(unescapeHtml('a &amp; b'), 'a & b');
  });

  it('unescapes angle brackets', () => {
    assert.strictEqual(unescapeHtml('&lt;div&gt;'), '<div>');
  });

  it('unescapes quotes', () => {
    assert.strictEqual(unescapeHtml('&quot;hello&quot; &amp; &#39;world&#39;'), '"hello" & \'world\'');
  });

  it('handles empty string', () => {
    assert.strictEqual(unescapeHtml(''), '');
  });

  it('returns unchanged string when no entities present', () => {
    assert.strictEqual(unescapeHtml('plain text'), 'plain text');
  });
});
