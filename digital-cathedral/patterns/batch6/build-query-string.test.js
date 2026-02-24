const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('buildQueryString', () => {
  it('should build a query string from an object', () => {
    assert.strictEqual(buildQueryString({ foo: 'bar', baz: 'qux' }), 'foo=bar&baz=qux');
  });

  it('should encode special characters', () => {
    assert.strictEqual(buildQueryString({ greeting: 'hello world' }), 'greeting=hello%20world');
  });

  it('should skip null and undefined values', () => {
    assert.strictEqual(buildQueryString({ a: '1', b: null, c: undefined, d: '4' }), 'a=1&d=4');
  });

  it('should handle numeric values', () => {
    assert.strictEqual(buildQueryString({ count: 42 }), 'count=42');
  });

  it('should return empty string for invalid inputs', () => {
    assert.strictEqual(buildQueryString(null), '');
    assert.strictEqual(buildQueryString([]), '');
    assert.strictEqual(buildQueryString('string'), '');
  });

  it('should return empty string for empty object', () => {
    assert.strictEqual(buildQueryString({}), '');
  });
});
