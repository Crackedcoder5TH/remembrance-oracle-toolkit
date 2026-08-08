const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hashString, redactSecrets, auditLog, verifySignature, sanitizeInput,
  rateLimitKey, timeConstantCompare, maskEmail, checksumBuffer,
  tokenBucketCheck, secureRandom, validateOrigin,
} = require('../src/security/covenant-utils');

test('hashString produces 64-char sha256 hex', () => {
  const h = hashString('hello');
  assert.equal(h.length, 64);
  assert.match(h, /^[a-f0-9]{64}$/);
});

test('hashString is deterministic', () => {
  assert.equal(hashString('same'), hashString('same'));
});

test('redactSecrets removes obvious API keys', () => {
  const input = 'API_KEY=sk-abc123def456ghi789jkl012mno345pqr and GITHUB_TOKEN=ghp_abc123def456ghi789jkl012mno345pqr678';
  const out = redactSecrets(input);
  assert.ok(!out.includes('sk-abc123def456'));
  assert.ok(!out.includes('ghp_abc123def456'));
  assert.match(out, /REDACTED/);
});

test('auditLog redacts secrets in context', () => {
  const event = auditLog('login', { token: 'ghp_abc123def456ghi789jkl012mno345pqr678', user: 'alice' });
  assert.ok(!JSON.stringify(event).includes('ghp_abc123def456ghi789jkl012mno345pqr678'));
  assert.equal(event.event, 'login');
  assert.match(event.at, /\d{4}-\d{2}-\d{2}T/);
});

test('verifySignature validates hmac', () => {
  const crypto = require('crypto');
  const secret = 'test-secret';
  const payload = '{"ok":true}';
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  assert.equal(verifySignature(payload, sig, secret), true);
  assert.equal(verifySignature(payload, sig, 'wrong'), false);
  assert.equal(verifySignature(payload, 'abc', secret), false);
});

test('sanitizeInput strips control chars by default', () => {
  const out = sanitizeInput('hello\x00world\x1F!');
  assert.equal(out, 'helloworld!');
});

test('sanitizeInput enforces maxLength', () => {
  const out = sanitizeInput('a'.repeat(100), { maxLength: 10 });
  assert.equal(out.length, 10);
});

test('rateLimitKey is stable within a window', () => {
  const k1 = rateLimitKey('user-1', 60000);
  const k2 = rateLimitKey('user-1', 60000);
  assert.equal(k1, k2);
});

test('timeConstantCompare returns false for different strings', () => {
  assert.equal(timeConstantCompare('abc', 'abd'), false);
  assert.equal(timeConstantCompare('abc', 'abc'), true);
  assert.equal(timeConstantCompare('abc', 'ab'), false);
});

test('maskEmail preserves domain, masks user', () => {
  assert.equal(maskEmail('alice@example.com'), 'a***e@example.com');
  assert.equal(maskEmail('ab@example.com'), '**@example.com');
  assert.equal(maskEmail('not-an-email'), '***');
});

test('checksumBuffer returns 64-char sha256', () => {
  const h = checksumBuffer(Buffer.from('test'));
  assert.equal(h.length, 64);
});

test('tokenBucketCheck allows then refuses', () => {
  let state = { tokens: 1, lastRefill: Date.now() };
  const first = tokenBucketCheck(state, 5, 0);
  assert.equal(first.allowed, true);
  const second = tokenBucketCheck(first.state, 5, 0);
  assert.equal(second.allowed, false);
  assert.ok(second.retryAfter >= 0);
});

test('secureRandom returns hex of expected length', () => {
  const r = secureRandom(16);
  assert.equal(r.length, 32);
  assert.match(r, /^[a-f0-9]+$/);
});

test('validateOrigin enforces allowlist', () => {
  const allow = ['https://example.com', 'https://trusted.io'];
  assert.equal(validateOrigin('https://example.com', allow), true);
  assert.equal(validateOrigin('https://evil.com', allow), false);
  assert.equal(validateOrigin('https://example.com/', allow), true);
});

test('all exported functions declare domain=security', () => {
  const mod = require('../src/security/covenant-utils');
  for (const [name, fn] of Object.entries(mod)) {
    if (typeof fn !== 'function') continue;
    assert.ok(fn.atomicProperties, `${name} missing atomicProperties`);
    assert.equal(fn.atomicProperties.domain, 'security', `${name} domain should be security`);
    assert.equal(fn.atomicProperties.alignment, 'healing', `${name} should be healing`);
    assert.equal(fn.atomicProperties.intention, 'benevolent', `${name} should be benevolent`);
    assert.equal(fn.atomicProperties.harmPotential, 'none', `${name} should be non-harming`);
  }
});
