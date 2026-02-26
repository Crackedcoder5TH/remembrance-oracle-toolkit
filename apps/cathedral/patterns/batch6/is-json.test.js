const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('isJson', () => {
  it('should return true for valid JSON objects', () => {
    assert.strictEqual(isJson('{"key": "value"}'), true);
    assert.strictEqual(isJson('{"a": 1, "b": [1, 2, 3]}'), true);
  });

  it('should return true for valid JSON arrays', () => {
    assert.strictEqual(isJson('[1, 2, 3]'), true);
    assert.strictEqual(isJson('[]'), true);
  });

  it('should return true for valid JSON primitives', () => {
    assert.strictEqual(isJson('"hello"'), true);
    assert.strictEqual(isJson('42'), true);
    assert.strictEqual(isJson('true'), true);
    assert.strictEqual(isJson('null'), true);
  });

  it('should return false for invalid JSON', () => {
    assert.strictEqual(isJson('{key: value}'), false);
    assert.strictEqual(isJson("{'key': 'value'}"), false);
    assert.strictEqual(isJson('undefined'), false);
    assert.strictEqual(isJson('{trailing,}'), false);
  });

  it('should return false for non-string inputs', () => {
    assert.strictEqual(isJson(null), false);
    assert.strictEqual(isJson(undefined), false);
    assert.strictEqual(isJson(''), false);
    assert.strictEqual(isJson('   '), false);
  });
});
