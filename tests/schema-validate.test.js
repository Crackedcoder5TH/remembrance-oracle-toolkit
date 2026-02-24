const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validate, isValid, assert: assertValid } = require('../seeds/schema-validate');

describe('schema-validate', () => {
  it('should validate primitive types', () => {
    assert.ok(isValid('hello', 'string'));
    assert.ok(isValid(42, 'number'));
    assert.ok(isValid(true, 'boolean'));
    assert.ok(!isValid(42, 'string'));
    assert.ok(!isValid('x', 'number'));
  });

  it('should validate string constraints', () => {
    assert.ok(isValid('abc', { type: 'string', min: 1, max: 5 }));
    assert.ok(!isValid('', { type: 'string', min: 1 }));
    assert.ok(!isValid('toolong', { type: 'string', max: 3 }));
  });

  it('should validate string patterns', () => {
    assert.ok(isValid('abc123', { type: 'string', pattern: /^[a-z0-9]+$/ }));
    assert.ok(!isValid('ABC!', { type: 'string', pattern: /^[a-z0-9]+$/ }));
  });

  it('should validate string enums', () => {
    assert.ok(isValid('red', { type: 'string', enum: ['red', 'green', 'blue'] }));
    assert.ok(!isValid('orange', { type: 'string', enum: ['red', 'green', 'blue'] }));
  });

  it('should validate number constraints', () => {
    assert.ok(isValid(5, { type: 'number', min: 0, max: 10 }));
    assert.ok(!isValid(-1, { type: 'number', min: 0 }));
    assert.ok(!isValid(11, { type: 'number', max: 10 }));
    assert.ok(isValid(3, { type: 'number', integer: true }));
    assert.ok(!isValid(3.5, { type: 'number', integer: true }));
  });

  it('should validate arrays', () => {
    assert.ok(isValid([1, 2, 3], { type: 'array' }));
    assert.ok(!isValid('not-array', { type: 'array' }));
    assert.ok(isValid(['a', 'b'], { type: 'array', items: 'string' }));
    assert.ok(!isValid(['a', 1], { type: 'array', items: 'string' }));
  });

  it('should validate array length constraints', () => {
    assert.ok(isValid([1, 2], { type: 'array', minLength: 1, maxLength: 3 }));
    assert.ok(!isValid([], { type: 'array', minLength: 1 }));
    assert.ok(!isValid([1, 2, 3, 4], { type: 'array', maxLength: 3 }));
  });

  it('should validate nested objects', () => {
    const schema = {
      type: 'object',
      shape: {
        name: 'string',
        age: { type: 'number', min: 0 },
        address: {
          type: 'object',
          shape: {
            city: 'string',
            zip: { type: 'string', pattern: /^\d{5}$/ },
          },
        },
      },
    };

    assert.ok(isValid({
      name: 'Alice',
      age: 30,
      address: { city: 'Portland', zip: '97201' },
    }, schema));

    assert.ok(!isValid({
      name: 'Bob',
      age: -5,
      address: { city: 'Portland', zip: '97201' },
    }, schema));
  });

  it('should support optional fields', () => {
    const schema = {
      type: 'object',
      shape: {
        name: 'string',
        nickname: { type: 'string', optional: true },
      },
    };
    assert.ok(isValid({ name: 'Alice' }, schema));
    assert.ok(isValid({ name: 'Alice', nickname: 'Ali' }, schema));
  });

  it('should support custom validators', () => {
    const isEven = (v) => v % 2 === 0 ? true : 'Must be even';
    assert.ok(isValid(4, isEven));
    assert.ok(!isValid(3, isEven));
  });

  it('should return detailed errors', () => {
    const errors = validate({ name: 42 }, {
      type: 'object',
      shape: { name: 'string', age: 'number' },
    });
    assert.ok(errors.length >= 1);
    assert.ok(errors.some(e => e.path === 'name'));
  });

  it('assert should throw on invalid', () => {
    assert.throws(() => assertValid(42, 'string', 'test'), /Validation failed/);
    assert.equal(assertValid('ok', 'string'), 'ok');
  });

  it('should handle null/undefined for required fields', () => {
    const errors = validate(undefined, 'string');
    assert.ok(errors.length > 0);
  });
});
