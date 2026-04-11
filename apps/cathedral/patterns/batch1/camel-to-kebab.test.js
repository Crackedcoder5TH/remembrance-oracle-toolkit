const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('camelToKebab', () => {
  it('converts simple camelCase', () => {
    assert.equal(camelToKebab('helloWorld'), 'hello-world');
  });

  it('converts multiple humps', () => {
    assert.equal(camelToKebab('backgroundColor'), 'background-color');
  });

  it('handles already lowercase strings', () => {
    assert.equal(camelToKebab('hello'), 'hello');
  });

  it('converts consecutive capitals (groups uppercase runs)', () => {
    assert.equal(camelToKebab('myHTTPClient'), 'my-httpclient');
  });

  it('converts multi-hump camelCase', () => {
    assert.equal(camelToKebab('getValueFromObject'), 'get-value-from-object');
  });

  it('returns empty string for empty input', () => {
    assert.equal(camelToKebab(''), '');
  });
});
