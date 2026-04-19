const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('isEmpty', () => {
  it('returns true for null', () => {
    assert.equal(isEmpty(null), true);
  });

  it('returns true for undefined', () => {
    assert.equal(isEmpty(undefined), true);
  });

  it('returns true for empty string', () => {
    assert.equal(isEmpty(''), true);
  });

  it('returns true for empty array', () => {
    assert.equal(isEmpty([]), true);
  });

  it('returns true for empty object', () => {
    assert.equal(isEmpty({}), true);
  });

  it('returns false for non-empty string', () => {
    assert.equal(isEmpty('hello'), false);
  });

  it('returns false for non-empty array', () => {
    assert.equal(isEmpty([1]), false);
  });

  it('returns false for non-empty object', () => {
    assert.equal(isEmpty({ a: 1 }), false);
  });

  it('returns false for numbers', () => {
    assert.equal(isEmpty(0), false);
    assert.equal(isEmpty(42), false);
  });
});
