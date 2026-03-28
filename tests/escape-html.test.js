const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const escapeHtml = require('../site/escape-html.js');

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    assert.equal(escapeHtml('a & b'), 'a &amp; b');
  });
  it('escapes angle brackets', () => {
    assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  });
  it('escapes quotes', () => {
    assert.equal(escapeHtml('"hello"'), '&quot;hello&quot;');
  });
  it('escapes single quotes', () => {
    assert.equal(escapeHtml("it's"), "it&#39;s");
  });
  it('returns empty string for non-strings', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(42), '');
  });
  it('handles empty string', () => {
    assert.equal(escapeHtml(''), '');
  });
});
