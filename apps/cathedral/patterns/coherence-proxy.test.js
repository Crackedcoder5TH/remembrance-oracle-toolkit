const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('coherence-proxy', () => {
  it('returns 0-1 range', () => {
    const score = computeCoherence('hello world test', 5);
    assert.ok(score >= 0 && score <= 1);
  });

  it('higher rating increases coherence', () => {
    const low = computeCoherence('test input here', 1);
    const high = computeCoherence('test input here', 10);
    assert.ok(high > low);
  });

  it('longer input increases coherence', () => {
    const short = computeCoherence('hi', 5);
    const long = computeCoherence('the quick brown fox jumps over the lazy dog repeatedly', 5);
    assert.ok(long > short);
  });

  it('coherenceTier maps correctly', () => {
    assert.strictEqual(coherenceTier(0.1), 'low');
    assert.strictEqual(coherenceTier(0.5), 'mid');
    assert.strictEqual(coherenceTier(0.8), 'high');
  });

  it('empty input returns low score', () => {
    assert.ok(computeCoherence('', 5) < 0.5);
  });
});
