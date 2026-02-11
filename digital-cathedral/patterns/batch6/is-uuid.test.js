const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('isUuid', () => {
  it('should return true for valid UUID v4 strings', () => {
    assert.strictEqual(isUuid('550e8400-e29b-41d4-a716-446655440000'), true);
    assert.strictEqual(isUuid('6ba7b810-9dad-41d8-80b4-00c04fd430c8'), true);
  });

  it('should be case-insensitive', () => {
    assert.strictEqual(isUuid('550E8400-E29B-41D4-A716-446655440000'), true);
  });

  it('should reject non-v4 UUIDs (wrong version digit)', () => {
    assert.strictEqual(isUuid('550e8400-e29b-31d4-a716-446655440000'), false); // v3
    assert.strictEqual(isUuid('550e8400-e29b-51d4-a716-446655440000'), false); // v5
  });

  it('should reject invalid variant bits', () => {
    assert.strictEqual(isUuid('550e8400-e29b-41d4-c716-446655440000'), false);
    assert.strictEqual(isUuid('550e8400-e29b-41d4-0716-446655440000'), false);
  });

  it('should return false for non-UUID strings', () => {
    assert.strictEqual(isUuid(''), false);
    assert.strictEqual(isUuid('not-a-uuid'), false);
    assert.strictEqual(isUuid(null), false);
    assert.strictEqual(isUuid(12345), false);
  });
});
