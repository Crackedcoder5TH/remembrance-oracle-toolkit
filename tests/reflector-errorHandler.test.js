const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, rmSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const {
  ERROR_TYPES,
  classifyError,
  withErrorHandling,
  withRetry,
  withCircuitBreaker,
  resetCircuitBreaker,
  getCircuitStatus,
  buildErrorReport,
} = require('../src/reflector/scoring');

function makeTempDir() {
  const dir = join(tmpdir(), `err-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, '.remembrance'), { recursive: true });
  return dir;
}

// ─── Error Classification ───

describe('classifyError', () => {
  it('should classify permission errors', () => {
    assert.strictEqual(classifyError({ code: 'EACCES', message: '' }), ERROR_TYPES.PERMISSION);
    assert.strictEqual(classifyError({ message: 'permission denied' }), ERROR_TYPES.PERMISSION);
    assert.strictEqual(classifyError({ message: 'authentication failed' }), ERROR_TYPES.PERMISSION);
  });

  it('should classify transient errors', () => {
    assert.strictEqual(classifyError({ code: 'ETIMEDOUT', message: '' }), ERROR_TYPES.TRANSIENT);
    assert.strictEqual(classifyError({ code: 'ECONNRESET', message: '' }), ERROR_TYPES.TRANSIENT);
    assert.strictEqual(classifyError({ message: 'timeout waiting for lock' }), ERROR_TYPES.TRANSIENT);
    assert.strictEqual(classifyError({ message: 'network error' }), ERROR_TYPES.TRANSIENT);
  });

  it('should classify resource errors', () => {
    assert.strictEqual(classifyError({ code: 'ENOMEM', message: '' }), ERROR_TYPES.RESOURCE);
    assert.strictEqual(classifyError({ code: 'ENOSPC', message: '' }), ERROR_TYPES.RESOURCE);
    assert.strictEqual(classifyError({ message: 'out of memory' }), ERROR_TYPES.RESOURCE);
  });

  it('should classify config errors', () => {
    assert.strictEqual(classifyError({ code: 'ENOENT', message: '' }), ERROR_TYPES.CONFIG);
    assert.strictEqual(classifyError({ message: 'config file missing' }), ERROR_TYPES.CONFIG);
  });

  it('should default to fatal for unknown errors', () => {
    assert.strictEqual(classifyError({ message: 'something broke' }), ERROR_TYPES.FATAL);
    assert.strictEqual(classifyError(new TypeError('bad type')), ERROR_TYPES.FATAL);
  });
});

// ─── withErrorHandling ───

describe('withErrorHandling', () => {
  it('should return success for successful operations', () => {
    const dir = makeTempDir();
    const result = withErrorHandling('test-op', () => 42, { rootDir: dir });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result, 42);
    assert.strictEqual(result.error, null);
    assert.ok(result.durationMs >= 0);
    rmSync(dir, { recursive: true });
  });

  it('should catch errors and return structured failure', () => {
    const dir = makeTempDir();
    const result = withErrorHandling('test-op', () => { throw new Error('boom'); }, { rootDir: dir });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'boom');
    assert.ok(result.errorType);
    assert.ok(result.durationMs >= 0);
    rmSync(dir, { recursive: true });
  });

  it('should use fallback value on error', () => {
    const dir = makeTempDir();
    const result = withErrorHandling('test-op', () => { throw new Error('fail'); }, { rootDir: dir, fallback: 'default' });
    assert.strictEqual(result.result, 'default');
    rmSync(dir, { recursive: true });
  });

  it('should use fallback function on error', () => {
    const dir = makeTempDir();
    const result = withErrorHandling('test-op', () => { throw new Error('fail'); }, {
      rootDir: dir,
      fallback: (err) => `recovered from: ${err.message}`,
    });
    assert.strictEqual(result.result, 'recovered from: fail');
    rmSync(dir, { recursive: true });
  });
});

// ─── withRetry ───

describe('withRetry', () => {
  it('should succeed on first attempt', () => {
    const dir = makeTempDir();
    const result = withRetry('test-retry', () => 'ok', { rootDir: dir });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result, 'ok');
    assert.strictEqual(result.attempts, 1);
    rmSync(dir, { recursive: true });
  });

  it('should retry transient errors', () => {
    const dir = makeTempDir();
    let count = 0;
    const result = withRetry('test-retry', () => {
      count++;
      if (count < 3) {
        const err = new Error('timeout');
        err.code = 'ETIMEDOUT';
        throw err;
      }
      return 'finally';
    }, { rootDir: dir, maxRetries: 3, baseDelayMs: 1 });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result, 'finally');
    assert.strictEqual(result.attempts, 3);
    rmSync(dir, { recursive: true });
  });

  it('should not retry fatal errors', () => {
    const dir = makeTempDir();
    let count = 0;
    const result = withRetry('test-retry', () => {
      count++;
      throw new TypeError('not transient');
    }, { rootDir: dir, maxRetries: 3, baseDelayMs: 1 });
    assert.strictEqual(result.success, false);
    assert.strictEqual(count, 1); // Only one attempt
    rmSync(dir, { recursive: true });
  });

  it('should give up after max retries', () => {
    const dir = makeTempDir();
    const result = withRetry('test-retry', () => {
      const err = new Error('timeout');
      err.code = 'ETIMEDOUT';
      throw err;
    }, { rootDir: dir, maxRetries: 2, baseDelayMs: 1 });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.attempts, 3); // 1 initial + 2 retries
    rmSync(dir, { recursive: true });
  });
});

// ─── Circuit Breaker ───

describe('withCircuitBreaker', () => {
  beforeEach(() => { resetCircuitBreaker(); });

  it('should allow operations when circuit is closed', () => {
    const result = withCircuitBreaker('test-cb', () => 'ok');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result, 'ok');
    assert.strictEqual(result.circuitOpen, false);
  });

  it('should count failures', () => {
    withCircuitBreaker('test-cb', () => { throw new Error('fail'); });
    const status = getCircuitStatus('test-cb');
    assert.strictEqual(status.failures, 1);
    assert.strictEqual(status.open, false);
  });

  it('should open circuit after threshold failures', () => {
    const dir = makeTempDir();
    for (let i = 0; i < 5; i++) {
      withCircuitBreaker('test-cb', () => { throw new Error('fail'); }, { threshold: 5, rootDir: dir });
    }
    const status = getCircuitStatus('test-cb');
    assert.strictEqual(status.open, true);
    assert.strictEqual(status.failures, 5);

    // Next call should be rejected immediately
    const result = withCircuitBreaker('test-cb', () => 'ok', { threshold: 5, cooldownMs: 60000, rootDir: dir });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.circuitOpen, true);
    rmSync(dir, { recursive: true });
  });

  it('should reset on success', () => {
    withCircuitBreaker('test-cb', () => { throw new Error('fail'); });
    withCircuitBreaker('test-cb', () => { throw new Error('fail'); });
    const beforeReset = getCircuitStatus('test-cb');
    assert.strictEqual(beforeReset.failures, 2);

    withCircuitBreaker('test-cb', () => 'ok');
    const afterReset = getCircuitStatus('test-cb');
    assert.strictEqual(afterReset.failures, 0);
  });

  it('should allow reset via resetCircuitBreaker', () => {
    withCircuitBreaker('test-cb', () => { throw new Error('fail'); });
    resetCircuitBreaker('test-cb');
    const status = getCircuitStatus('test-cb');
    assert.strictEqual(status.failures, 0);
  });
});

// ─── Error Report ───

describe('buildErrorReport', () => {
  it('should return empty report for clean log', () => {
    const dir = makeTempDir();
    const report = buildErrorReport(dir);
    assert.strictEqual(report.totalErrors, 0);
    assert.strictEqual(report.totalWarnings, 0);
    assert.strictEqual(report.healthScore, 1.0);
    rmSync(dir, { recursive: true });
  });

  it('should count errors from log', () => {
    const dir = makeTempDir();
    const { appendLog } = require('../src/reflector/report');
    appendLog(dir, 'ERROR', 'test error 1', { errorType: 'transient' });
    appendLog(dir, 'ERROR', 'test error 2', { errorType: 'fatal' });
    appendLog(dir, 'WARN', 'test warning');
    appendLog(dir, 'INFO', 'normal log');

    const report = buildErrorReport(dir);
    assert.strictEqual(report.totalErrors, 2);
    assert.strictEqual(report.totalWarnings, 1);
    assert.ok(report.healthScore < 1.0);
    assert.ok(report.errorsByType.transient === 1 || report.errorsByType.fatal === 1);
    rmSync(dir, { recursive: true });
  });
});

// ─── Exports ───

describe('Error Handler — exports', () => {
  it('should export from index.js', () => {
    const index = require('../src/index');
    assert.strictEqual(typeof index.reflectorClassifyError, 'function');
    assert.strictEqual(typeof index.reflectorWithErrorHandling, 'function');
    assert.strictEqual(typeof index.reflectorWithRetry, 'function');
    assert.strictEqual(typeof index.reflectorWithCircuitBreaker, 'function');
    assert.strictEqual(typeof index.reflectorResetCircuitBreaker, 'function');
    assert.strictEqual(typeof index.reflectorBuildErrorReport, 'function');
    assert.ok(index.reflectorErrorTypes);
    assert.ok(index.reflectorErrorTypes.TRANSIENT);
    assert.ok(index.reflectorErrorTypes.FATAL);
  });
});
