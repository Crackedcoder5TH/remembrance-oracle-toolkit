const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('kebabToCamel', () => {
  it('converts simple kebab-case to camelCase', () => {
    assert.strictEqual(kebabToCamel('hello-world'), 'helloWorld');
  });

  it('converts multi-segment kebab-case', () => {
    assert.strictEqual(kebabToCamel('my-long-variable-name'), 'myLongVariableName');
  });

  it('returns the same string when no hyphens are present', () => {
    assert.strictEqual(kebabToCamel('already'), 'already');
  });

  it('handles empty string', () => {
    assert.strictEqual(kebabToCamel(''), '');
  });

  it('returns empty string for non-string input', () => {
    assert.strictEqual(kebabToCamel(null), '');
  });
});
