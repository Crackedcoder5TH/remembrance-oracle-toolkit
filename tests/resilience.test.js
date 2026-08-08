const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  retryWithBackoff,
  isRetryableError,
  withRetry,
  resilientFetchSource,
} = require('../src/core/resilience');

// ─── retryWithBackoff ───

describe('retryWithBackoff', () => {
  it('returns result on first success', async () => {
    const result = await retryWithBackoff(() => Promise.resolve(42));
    assert.equal(result, 42);
  });

  it('retries on failure and succeeds', async () => {
    let attempts = 0;
    const result = await retryWithBackoff(() => {
      attempts++;
      if (attempts < 3) throw new Error('fail');
      return Promise.resolve('ok');
    }, { maxRetries: 3, baseDelay: 10 });

    assert.equal(result, 'ok');
    assert.equal(attempts, 3);
  });

  it('throws after all retries exhausted', async () => {
    await assert.rejects(
      () => retryWithBackoff(() => { throw new Error('always fail'); }, { maxRetries: 2, baseDelay: 10 }),
      { message: 'always fail' }
    );
  });

  it('calls onRetry callback on each retry', async () => {
    const retries = [];
    let attempts = 0;

    await retryWithBackoff(() => {
      attempts++;
      if (attempts < 3) throw new Error('fail');
      return Promise.resolve('ok');
    }, {
      maxRetries: 3,
      baseDelay: 10,
      onRetry: (err, attempt, delay) => retries.push({ attempt, delay }),
    });

    assert.equal(retries.length, 2);
    assert.equal(retries[0].attempt, 1);
    assert.equal(retries[1].attempt, 2);
  });

  it('respects shouldRetry predicate', async () => {
    let attempts = 0;

    await assert.rejects(
      () => retryWithBackoff(() => {
        attempts++;
        const err = new Error('non-retryable');
        err.code = 'FATAL';
        throw err;
      }, {
        maxRetries: 3,
        baseDelay: 10,
        shouldRetry: (err) => err.code !== 'FATAL',
      }),
      { message: 'non-retryable' }
    );

    assert.equal(attempts, 1); // Should not retry
  });

  it('respects maxDelay cap', async () => {
    let attempts = 0;
    const delays = [];

    await assert.rejects(
      () => retryWithBackoff(() => {
        attempts++;
        throw new Error('fail');
      }, {
        maxRetries: 5,
        baseDelay: 10,
        maxDelay: 50,
        jitter: false,
        onRetry: (err, attempt, delay) => delays.push(delay),
      })
    );

    // All delays should be <= maxDelay
    for (const d of delays) {
      assert.ok(d <= 50, `delay ${d} exceeds maxDelay 50`);
    }
  });

  it('works with sync functions that return values', async () => {
    const result = await retryWithBackoff(() => 'sync-value');
    assert.equal(result, 'sync-value');
  });
});

// ─── isRetryableError ───

describe('isRetryableError', () => {
  it('returns true for ECONNRESET', () => {
    const err = new Error('Connection reset');
    err.code = 'ECONNRESET';
    assert.equal(isRetryableError(err), true);
  });

  it('returns true for ECONNREFUSED', () => {
    const err = new Error('Connection refused');
    err.code = 'ECONNREFUSED';
    assert.equal(isRetryableError(err), true);
  });

  it('returns true for ETIMEDOUT', () => {
    const err = new Error('Timed out');
    err.code = 'ETIMEDOUT';
    assert.equal(isRetryableError(err), true);
  });

  it('returns true for timeout message', () => {
    assert.equal(isRetryableError(new Error('Request timeout')), true);
  });

  it('returns true for 429 status', () => {
    const err = new Error('Too many requests');
    err.statusCode = 429;
    assert.equal(isRetryableError(err), true);
  });

  it('returns true for 500 status', () => {
    const err = new Error('Internal server error');
    err.statusCode = 500;
    assert.equal(isRetryableError(err), true);
  });

  it('returns true for 503 status', () => {
    const err = new Error('Service unavailable');
    err.statusCode = 503;
    assert.equal(isRetryableError(err), true);
  });

  it('returns false for 400 status', () => {
    const err = new Error('Bad request');
    err.statusCode = 400;
    assert.equal(isRetryableError(err), false);
  });

  it('returns false for 401 status', () => {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    assert.equal(isRetryableError(err), false);
  });

  it('returns false for null/undefined', () => {
    assert.equal(isRetryableError(null), false);
    assert.equal(isRetryableError(undefined), false);
  });

  it('returns false for generic error', () => {
    assert.equal(isRetryableError(new Error('some error')), false);
  });
});

// ─── withRetry ───

describe('withRetry', () => {
  it('wraps a function with retry logic', async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      if (calls < 2) {
        const err = new Error('Connection reset');
        err.code = 'ECONNRESET';
        return Promise.reject(err);
      }
      return Promise.resolve({ status: 200, data: 'ok' });
    };

    const resilientFn = withRetry(fn, { baseDelay: 10 });
    const result = await resilientFn('http://example.com', {});
    assert.equal(result.status, 200);
    assert.equal(calls, 2);
  });

  it('passes url and options through', async () => {
    let receivedUrl, receivedOpts;
    const fn = (url, opts) => {
      receivedUrl = url;
      receivedOpts = opts;
      return Promise.resolve({ status: 200 });
    };

    const resilientFn = withRetry(fn);
    await resilientFn('http://test.com/api', { method: 'POST' });
    assert.equal(receivedUrl, 'http://test.com/api');
    assert.equal(receivedOpts.method, 'POST');
  });
});

// ─── resilientFetchSource ───

describe('resilientFetchSource', () => {
  it('returns a string containing resilientFetch function', () => {
    const source = resilientFetchSource();
    assert.ok(typeof source === 'string');
    assert.ok(source.includes('async function resilientFetch'));
    assert.ok(source.includes('maxRetries'));
    assert.ok(source.includes('baseDelay'));
    assert.ok(source.includes('Retry-After'));
  });

  it('generates valid JavaScript', () => {
    const source = resilientFetchSource();
    // Should parse without syntax errors
    assert.doesNotThrow(() => new Function(source));
  });
});

// ─── index.js exports ───

describe('resilience index exports', () => {
  it('exports retryWithBackoff', () => {
    const index = require('../src/index');
    assert.equal(typeof index.retryWithBackoff, 'function');
  });

  it('exports isRetryableError', () => {
    const index = require('../src/index');
    assert.equal(typeof index.isRetryableError, 'function');
  });

  it('exports withRetry', () => {
    const index = require('../src/index');
    assert.equal(typeof index.withRetry, 'function');
  });

  it('exports resilientFetchSource', () => {
    const index = require('../src/index');
    assert.equal(typeof index.resilientFetchSource, 'function');
  });
});
