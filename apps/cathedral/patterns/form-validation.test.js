const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function validateField({ value, touched, minLength }) {
  const trimmed = value.trim();
  const valid = trimmed.length >= minLength;
  if (!touched) return { valid: false, error: '', fieldClass: 'border-teal-cathedral/20' };
  if (valid) return { valid: true, error: '', fieldClass: 'field-valid' };
  const error = trimmed.length === 0 ? 'This field is required' : `At least ${minLength} characters needed`;
  return { valid: false, error, fieldClass: 'field-invalid' };
}

describe('form-validation', () => {
  it('returns no error when untouched', () => {
    const result = validateField({ value: '', touched: false, minLength: 3 });
    assert.strictEqual(result.error, '');
    assert.strictEqual(result.valid, false);
  });

  it('returns valid when meets min length', () => {
    const result = validateField({ value: 'hello', touched: true, minLength: 3 });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.fieldClass, 'field-valid');
  });

  it('returns required error when empty and touched', () => {
    const result = validateField({ value: '', touched: true, minLength: 3 });
    assert.strictEqual(result.error, 'This field is required');
    assert.strictEqual(result.fieldClass, 'field-invalid');
  });

  it('returns min length error when too short', () => {
    const result = validateField({ value: 'ab', touched: true, minLength: 3 });
    assert.strictEqual(result.error, 'At least 3 characters needed');
  });

  it('trims whitespace before validating', () => {
    const result = validateField({ value: '   ', touched: true, minLength: 3 });
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, 'This field is required');
  });
});
