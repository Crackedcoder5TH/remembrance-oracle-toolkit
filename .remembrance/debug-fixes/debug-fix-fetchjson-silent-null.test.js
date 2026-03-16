const { describe, it } = require('node:test');
const assert = require('node:assert');

function safeFetchResult(raw, expectedKey) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, data: null, error: 'null_or_invalid_response' };
  }
  if (expectedKey && !Array.isArray(raw[expectedKey])) {
    return { ok: false, data: raw, error: `missing_or_invalid_key:${expectedKey}` };
  }
  return { ok: true, data: raw, error: null };
}

describe('safe fetch result wrapping', () => {
  it('marks null as failure', () => {
    const result = safeFetchResult(null, 'patterns');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'null_or_invalid_response');
  });

  it('marks undefined as failure', () => {
    const result = safeFetchResult(undefined, 'patterns');
    assert.strictEqual(result.ok, false);
  });

  it('marks missing expected key as failure', () => {
    const result = safeFetchResult({ other: 'data' }, 'patterns');
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes('missing_or_invalid_key'));
  });

  it('marks non-array expected key as failure', () => {
    const result = safeFetchResult({ patterns: 'not-array' }, 'patterns');
    assert.strictEqual(result.ok, false);
  });

  it('marks valid response as success', () => {
    const result = safeFetchResult({ patterns: [1, 2, 3] }, 'patterns');
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data.patterns, [1, 2, 3]);
  });

  it('succeeds without expectedKey check', () => {
    const result = safeFetchResult({ anything: true });
    assert.strictEqual(result.ok, true);
  });
});
