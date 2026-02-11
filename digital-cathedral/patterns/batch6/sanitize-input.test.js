const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('sanitizeInput', () => {
  it('should strip HTML tags', () => {
    assert.strictEqual(sanitizeInput('<script>alert("xss")</script>'), 'alert(&quot;xss&quot;)');
  });

  it('should encode special HTML characters', () => {
    const result = sanitizeInput('a & b');
    assert.strictEqual(result, 'a &amp; b');
  });

  it('should handle plain text without HTML-like content', () => {
    const result = sanitizeInput('hello world');
    assert.strictEqual(result, 'hello world');
  });

  it('should strip nested and malformed tags aggressively', () => {
    const result = sanitizeInput('<div><b>bold</b></div>');
    assert.strictEqual(result, 'bold');
  });

  it('should encode quotes', () => {
    const result = sanitizeInput('He said "hello"');
    assert.strictEqual(result, 'He said &quot;hello&quot;');
  });

  it('should remove null bytes', () => {
    const result = sanitizeInput('hello\0world');
    assert.ok(!result.includes('\0'));
  });

  it('should return empty string for non-string inputs', () => {
    assert.strictEqual(sanitizeInput(null), '');
    assert.strictEqual(sanitizeInput(undefined), '');
    assert.strictEqual(sanitizeInput(42), '');
  });
});
