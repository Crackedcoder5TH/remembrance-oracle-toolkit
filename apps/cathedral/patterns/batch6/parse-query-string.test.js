const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('parseQueryString', () => {
  it('should parse simple query strings', () => {
    assert.deepStrictEqual(parseQueryString('foo=bar&baz=qux'), { foo: 'bar', baz: 'qux' });
  });

  it('should handle leading question mark', () => {
    assert.deepStrictEqual(parseQueryString('?name=John&age=30'), { name: 'John', age: '30' });
  });

  it('should decode URI components', () => {
    assert.deepStrictEqual(parseQueryString('greeting=hello%20world'), { greeting: 'hello world' });
  });

  it('should handle keys without values', () => {
    assert.deepStrictEqual(parseQueryString('key'), { key: '' });
  });

  it('should return empty object for empty input', () => {
    assert.deepStrictEqual(parseQueryString(''), {});
    assert.deepStrictEqual(parseQueryString('?'), {});
  });

  it('should return empty object for non-string input', () => {
    assert.deepStrictEqual(parseQueryString(null), {});
    assert.deepStrictEqual(parseQueryString(undefined), {});
  });
});
