const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('slugify', () => {
  it('converts a simple string to a slug', () => {
    assert.strictEqual(slugify('Hello World'), 'hello-world');
  });

  it('removes special characters', () => {
    assert.strictEqual(slugify('Hello, World! How are you?'), 'hello-world-how-are-you');
  });

  it('collapses multiple spaces and hyphens', () => {
    assert.strictEqual(slugify('  too   many   spaces  '), 'too-many-spaces');
  });

  it('handles empty string', () => {
    assert.strictEqual(slugify(''), '');
  });

  it('handles strings with underscores', () => {
    assert.strictEqual(slugify('hello_world test'), 'hello-world-test');
  });
});
