const { describe, it } = require('node:test');
const assert = require('node:assert');
const { cappedExponentialBackoff } = require('/tmp/debug-fix-backoff-cap.js');

describe('capped exponential backoff', () => {
  it('applies exponential growth', () => {
    assert.strictEqual(cappedExponentialBackoff(1000, 0), 1000);
    assert.strictEqual(cappedExponentialBackoff(1000, 1), 2000);
    assert.strictEqual(cappedExponentialBackoff(1000, 2), 4000);
  });

  it('caps at maxDelayMs', () => {
    assert.strictEqual(cappedExponentialBackoff(1000, 10), 60000);
    assert.strictEqual(cappedExponentialBackoff(5000, 10, 30000), 30000);
  });

  it('handles zero attempt', () => {
    assert.strictEqual(cappedExponentialBackoff(500, 0), 500);
  });
});
