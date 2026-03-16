const { describe, it } = require('node:test');
const assert = require('node:assert');

function validateGitRange(range) {
  if (!range || typeof range !== 'string') {
    return { valid: false, error: 'Range must be a non-empty string' };
  }
  if (range.length > 200) {
    return { valid: false, error: 'Range too long (max 200 chars)' };
  }
  const REF = '[a-zA-Z0-9][a-zA-Z0-9._~^/\\-]*';
  const pattern = new RegExp(`^${REF}(?:\\.{2,3}${REF})?$`);
  if (!pattern.test(range)) {
    return { valid: false, error: 'Range contains invalid characters' };
  }
  if (/[;|&$`"'\\<>(){}!#]/.test(range)) {
    return { valid: false, error: 'Range contains shell metacharacters' };
  }
  return { valid: true, error: null };
}

describe('git range validation', () => {
  it('accepts standard ranges', () => {
    assert.strictEqual(validateGitRange('HEAD~1..HEAD').valid, true);
    assert.strictEqual(validateGitRange('main...feature/foo').valid, true);
    assert.strictEqual(validateGitRange('v1.0.0..v2.0.0').valid, true);
    assert.strictEqual(validateGitRange('HEAD').valid, true);
    assert.strictEqual(validateGitRange('abc123').valid, true);
  });

  it('rejects shell injection attempts', () => {
    assert.strictEqual(validateGitRange('HEAD; echo evil').valid, false);
    assert.strictEqual(validateGitRange('HEAD$(whoami)').valid, false);
    assert.strictEqual(validateGitRange('HEAD`id`').valid, false);
    assert.strictEqual(validateGitRange('HEAD|cat /etc/passwd').valid, false);
  });

  it('rejects empty/null/undefined', () => {
    assert.strictEqual(validateGitRange('').valid, false);
    assert.strictEqual(validateGitRange(null).valid, false);
    assert.strictEqual(validateGitRange(undefined).valid, false);
  });

  it('rejects overly long ranges (ReDoS protection)', () => {
    assert.strictEqual(validateGitRange('a'.repeat(201)).valid, false);
  });

  it('accepts ranges with hyphens', () => {
    assert.strictEqual(validateGitRange('feature/my-branch..main').valid, true);
  });
});
